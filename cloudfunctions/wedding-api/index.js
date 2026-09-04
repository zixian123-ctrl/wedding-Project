const cloudbaseJs = require('@cloudbase/js-sdk');
const { randomUUID } = require('node:crypto');

const pgApp = cloudbaseJs.init({ env: cloudbaseJs.SYMBOL_CURRENT_ENV });
const db = pgApp.rdb();
const STORAGE_BUCKET = 'wedding-photos';
let storageReady;
const allowedOrigins = new Set([
  'https://zixian123-ctrl.github.io',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
]);

function response(statusCode, data, origin = '') {
  const allowOrigin = allowedOrigins.has(origin) ? origin : 'https://zixian123-ctrl.github.io';
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(data)
  };
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, maxLength);
}

function parseBody(event) {
  if (!event.body) return {};
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return typeof text === 'string' ? JSON.parse(text) : text;
}

function imageExtension(mimeType, buffer) {
  if (mimeType === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (mimeType === 'image/png' && buffer.subarray(1, 4).toString() === 'PNG') return 'png';
  if (mimeType === 'image/webp' && buffer.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return '';
}

async function getPhotoStorage() {
  if (!storageReady) {
    storageReady = (async () => {
      const { data: buckets, error: listError } = await pgApp.storage.listBuckets({ limit: 100, offset: 0 });
      if (listError) throw listError;
      if (!(buckets || []).some(bucket => bucket.id === STORAGE_BUCKET)) {
        const { error: createError } = await pgApp.storage.createBucket(STORAGE_BUCKET, {
          public: false,
          type: 'STANDARD',
          fileSizeLimit: '2MB',
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
        });
        if (createError && !/already|exist|duplicate/i.test(createError.message || '')) throw createError;
      }
      return true;
    })().catch(error => {
      storageReady = null;
      throw error;
    });
  }
  await storageReady;
  return pgApp.storage.from(STORAGE_BUCKET);
}

exports.main = async (event) => {
  const method = String(event.httpMethod || event.requestContext?.http?.method || 'GET').toUpperCase();
  const path = String(event.path || event.rawPath || '/').replace(/^\/wedding-api/, '');
  const origin = event.headers?.origin || event.headers?.Origin || '';

  if (method === 'OPTIONS') return response(204, {}, origin);
  if (origin && !allowedOrigins.has(origin)) return response(403, { error: '来源不受信任' }, origin);

  try {
    if (method === 'GET' && (path === '/' || path === '/health')) {
      return response(200, { ok: true, service: 'wedding-api' }, origin);
    }

    if (method === 'GET' && path.endsWith('/wishes')) {
      const { data, error } = await db
        .from('wedding_wishes')
        .select('id,name,wish,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const wishes = (data || []).map(item => ({
        id: item.id,
        name: item.name,
        wish: item.wish,
        createdAt: item.created_at
      }));
      return response(200, { wishes }, origin);
    }

    if (method === 'POST' && path.endsWith('/wishes')) {
      const body = parseBody(event);
      const name = cleanText(body.name, 20);
      const wish = cleanText(body.wish, 120);
      if (!name || !wish) return response(400, { error: '请填写姓名和祝福' }, origin);
      const item = { name, wish, createdAt: new Date().toISOString() };
      const { error } = await db.from('wedding_wishes').insert({
        name,
        wish,
        created_at: item.createdAt
      });
      if (error) throw error;
      return response(201, { ok: true, wish: item }, origin);
    }

    if (method === 'GET' && path.endsWith('/photos')) {
      const { data, error } = await db
        .from('wedding_photos')
        .select('id,name,file_id,cloud_path,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const photos = (data || []).map(item => ({
        id: item.id,
        name: item.name,
        fileId: item.file_id,
        cloudPath: item.cloud_path,
        createdAt: item.created_at
      }));
      if (!photos.length) return response(200, { photos: [] }, origin);
      const storage = await getPhotoStorage();
      const { data: signedUrls, error: signError } = await storage.createSignedUrls(
        photos.map(photo => photo.cloudPath),
        86400
      );
      if (signError) throw signError;
      const urlMap = new Map((signedUrls || []).map(file => [file.path, file.fullSignedURL]));
      return response(200, { photos: photos.map(photo => ({ ...photo, url: urlMap.get(photo.fileId) || '' })).filter(photo => photo.url) }, origin);
    }

    if (method === 'POST' && path.endsWith('/photos')) {
      const body = parseBody(event);
      const name = cleanText(body.name || '亲友', 20);
      const match = String(body.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return response(400, { error: '仅支持 JPG、PNG 或 WebP 图片' }, origin);
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > 2 * 1024 * 1024) return response(413, { error: '照片压缩后需小于 2MB' }, origin);
      const extension = imageExtension(match[1], buffer);
      if (!extension) return response(400, { error: '图片内容无法识别' }, origin);
      const cloudPath = `wedding-guest-photos/${Date.now()}-${randomUUID()}.${extension}`;
      const storage = await getPhotoStorage();
      const { data: uploaded, error: uploadError } = await storage.upload(cloudPath, buffer, {
        contentType: match[1],
        upsert: false
      });
      if (uploadError) throw uploadError;
      const storedPath = uploaded.path || cloudPath;
      const item = { name, fileId: storedPath, cloudPath: storedPath, createdAt: new Date().toISOString() };
      const { error } = await db.from('wedding_photos').insert({
        name,
        file_id: item.fileId,
        cloud_path: storedPath,
        created_at: item.createdAt
      });
      if (error) throw error;
      return response(201, { ok: true, photo: item }, origin);
    }

    return response(404, { error: '接口不存在' }, origin);
  } catch (error) {
    console.error(error);
    return response(500, { error: '云端服务暂时不可用，请稍后再试' }, origin);
  }
};
