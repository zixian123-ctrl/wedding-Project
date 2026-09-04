const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const weddingAt = new Date('2026-09-28T12:00:00+08:00');
const store = { get(k, d = null) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }

const panels = $$('.panel');
const dots = $('.dots');
panels.forEach((panel, i) => { const a = document.createElement('a'); a.href = `#${panel.id}`; a.title = panel.dataset.label; if (!i) a.classList.add('active'); dots.appendChild(a); });
const navObserver = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { $$('.dots a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`)); } }), { threshold: .55 });
panels.forEach(p => navObserver.observe(p));
const revealObserver = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); }), { threshold: .14 });
$$('.reveal').forEach(el => revealObserver.observe(el));

let lastTimer = '';
function updateTimer() {
  let diff = weddingAt - new Date();
  const passed = diff <= 0; diff = Math.abs(diff);
  const vals = [Math.floor(diff / 86400000), Math.floor(diff / 3600000) % 24, Math.floor(diff / 60000) % 60, Math.floor(diff / 1000) % 60];
  const text = vals.map((v, i) => String(v).padStart(i ? 2 : 3, '0'));
  $$('#timer b').forEach((el, i) => { if (el.textContent !== text[i]) { el.textContent = text[i]; el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); } });
  if (passed && lastTimer !== 'passed') { $('#countdown h2').textContent = '幸福已如约而至'; lastTimer = 'passed'; }
}
updateTimer(); setInterval(updateTimer, 1000);

const bgm = $('#bgm'), musicBtn = $('#musicBtn');
const savedMusic = store.get('wedding-music', false);
musicBtn.addEventListener('click', async () => { if (bgm.paused) { try { await bgm.play(); musicBtn.classList.add('playing'); musicBtn.setAttribute('aria-label', '暂停背景音乐'); store.set('wedding-music', true); } catch { toast('轻触页面后即可播放音乐'); } } else { bgm.pause(); musicBtn.classList.remove('playing'); musicBtn.setAttribute('aria-label', '播放背景音乐'); store.set('wedding-music', false); } });
if (savedMusic) document.addEventListener('pointerdown', () => musicBtn.click(), { once: true });

const heroDefault = 'assets/wedding-hero.png';
const savedCover = store.get('wedding-cover');
if (savedCover) $('#heroPhoto').style.backgroundImage = `url(${savedCover})`;
$('#coverInput').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; const data = await compress(file, 1500, .78); try { store.set('wedding-cover', data); $('#heroPhoto').style.backgroundImage = `url(${data})`; toast('封面已更换并保存'); } catch { toast('图片过大，请选择更小的照片'); } });
$('.camera').addEventListener('contextmenu', e => { e.preventDefault(); localStorage.removeItem('wedding-cover'); $('#heroPhoto').style.backgroundImage = `url(${heroDefault})`; toast('已恢复默认封面'); });

const galleryGrid = $('#galleryGrid');
let customPhotos = store.get('wedding-photos', []);
const permanentPhotos = [
  'assets/gallery/liuzixian-lvyixian-01.jpg',
  heroDefault,
  'assets/wedding-walk.png'
];
const defaultPhotos = permanentPhotos;
function renderGallery() { galleryGrid.innerHTML = ''; [...defaultPhotos, ...customPhotos].forEach((src, index) => { const item = document.createElement('div'); item.className = 'gallery-item'; item.innerHTML = `<img src="${src}" alt="婚纱照 ${index + 1}" loading="lazy"><button aria-label="删除照片">×</button>`; item.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { if (index < defaultPhotos.length) return toast('默认照片不可删除'); customPhotos.splice(index - defaultPhotos.length, 1); store.set('wedding-photos', customPhotos); renderGallery(); return; } openLightbox(index); }); galleryGrid.appendChild(item); }); }
renderGallery();
$('#galleryInput').addEventListener('change', async e => { const files = [...e.target.files].slice(0, 12); for (const file of files) { try { customPhotos.push(await compress(file, 1200, .72)); } catch {} } try { store.set('wedding-photos', customPhotos); toast(`已添加 ${files.length} 张照片`); } catch { customPhotos.splice(-files.length); toast('本地空间不足，请减少照片'); } renderGallery(); e.target.value = ''; });
function compress(file, max, quality) { return new Promise((resolve, reject) => { const img = new Image(); const reader = new FileReader(); reader.onload = () => img.src = reader.result; reader.onerror = reject; img.onload = () => { const scale = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', quality)); }; reader.readAsDataURL(file); }); }

let lightboxIndex = 0;
function gallerySources() { return [...defaultPhotos, ...customPhotos]; }
function openLightbox(i) { lightboxIndex = i; $('.lightbox img').src = gallerySources()[i]; $('#lightbox').classList.add('open'); document.body.style.overflow = 'hidden'; }
function moveLightbox(step) { const all = gallerySources(); lightboxIndex = (lightboxIndex + step + all.length) % all.length; $('.lightbox img').src = all[lightboxIndex]; }
$('#lightboxClose').onclick = () => { $('#lightbox').classList.remove('open'); document.body.style.overflow = ''; }; $('.lightbox .prev').onclick = () => moveLightbox(-1); $('.lightbox .next').onclick = () => moveLightbox(1); $('#lightbox').addEventListener('click', e => { if (e.target === $('#lightbox')) $('#lightboxClose').click(); });

$('#navBtn').addEventListener('click', () => {
  const position = '114.357542,37.177688';
  const name = encodeURIComponent('皇寺村村委会');
  const href = `https://uri.amap.com/marker?position=${position}&name=${name}&coordinate=gaode&src=wedding-invitation&callnative=1`;
  window.location.href = href;
});
let captchaAnswer = 0;
function resetCaptcha() { const a = Math.ceil(Math.random() * 8), b = Math.ceil(Math.random() * 8); captchaAnswer = a + b; $('#captchaText').textContent = `${a} + ${b} = ?`; }
resetCaptcha();
const wishesStoreKey = 'wedding-wishes-v2';
localStorage.removeItem('wedding-wishes');
const demoWishTexts = ['愿你们岁岁相守，朝朝相伴。', '新婚快乐，百年好合！', '往后余生，三餐四季皆温柔。', '愿所有美好都如期而至。', '从此一屋两人，温暖相伴。', '祝你们永远幸福甜蜜。', '愿此生相知相守，白首不离。', '祝新婚大喜，生活胜蜜糖。', '山水一程，愿你们携手同行。', '愿爱意常新，幸福长存。'];
const demoWishes = Array.from({ length: 30 }, (_, i) => ({ name: `亲友 ${String(i + 1).padStart(2, '0')}`, wish: demoWishTexts[i % demoWishTexts.length] }));
function getWishes() { return new URLSearchParams(location.search).has('demo-wishes') ? demoWishes : store.get(wishesStoreKey, []); }
const compactWishLayout = window.matchMedia('(max-width: 720px)');
function renderWishes() {
  const wishes = getWishes().slice().reverse();
  const cardCount = compactWishLayout.matches ? 2 : 3;
  const latest = wishes.slice(0, cardCount);
  const floating = wishes.slice(cardCount);
  $('#wishWall').innerHTML = latest.map(w => `<article class="wish-card"><p>“${escapeHTML(w.wish)}”</p><span>— ${escapeHTML(w.name)}</span></article>`).join('');
  const lanes = [8, 16, 82, 90];
  const groups = Math.max(1, Math.ceil(floating.length / lanes.length));
  const cycle = Math.max(36, groups * 12);
  $('#wishBarrage').innerHTML = floating.map((w, i) => {
    const laneIndex = i % lanes.length;
    const group = Math.floor(i / lanes.length);
    const delay = -(group * 12 + laneIndex * 1.1);
    return `<span class="barrage-item" style="--lane:${lanes[laneIndex]}%;--cycle:${cycle}s;--delay:${delay}s">${escapeHTML(w.wish)}<b>— ${escapeHTML(w.name)}</b></span>`;
  }).join('');
}
compactWishLayout.addEventListener('change', renderWishes);
renderWishes();
$('#rsvpForm').addEventListener('submit', e => { e.preventDefault(); if (+$('#captchaInput').value !== captchaAnswer) { $('#formStatus').textContent = '验证答案不正确，请再试一次'; resetCaptcha(); return; } const data = Object.fromEntries(new FormData(e.target)); const replies = store.get('wedding-rsvp', []); replies.push({ ...data, createdAt: new Date().toISOString() }); store.set('wedding-rsvp', replies); if (data.wish.trim()) { const wishes = store.get(wishesStoreKey, []); wishes.push({ name: data.name, wish: data.wish }); store.set(wishesStoreKey, wishes); renderWishes(); } $('#formStatus').textContent = '✓ 回执已成功保存，期待与您相见'; e.target.reset(); resetCaptcha(); });
function escapeHTML(s = '') { return s.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

const sharePreview = $('#sharePreview');
function closeSharePreview() { sharePreview.classList.remove('open'); document.body.style.overflow = ''; }
$('#sharePreviewClose').addEventListener('click', closeSharePreview);
sharePreview.addEventListener('click', e => { if (e.target === sharePreview) closeSharePreview(); });
$('#shareBtn').addEventListener('click', async () => {
  const isLocalPreview = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocalPreview) { sharePreview.classList.add('open'); document.body.style.overflow = 'hidden'; return; }
  const data = { title: '💒 我们结婚啦｜刘子贤 & 吕燚娴', text: '2026年9月28日，诚邀您相聚邢台，见证我们的幸福时刻', url: 'https://zixian123-ctrl.github.io/wedding-Project/' };
  if (navigator.share) { try { await navigator.share(data); } catch {} }
  else { try { await navigator.clipboard.writeText(data.url); toast('邀请链接已复制，请发送到微信查看卡片'); } catch { toast('请使用浏览器菜单分享给好友'); } }
});
