'use strict';
/* ---------- screens ---------- */
let current = 'title', returnTo = 'title';
// 遊玩層（開場、朗讀、牌桌）顯示頂端列；其餘是選單層，顯示底部分頁
const PLAY_SCREENS = ['title', 'story', 'game'];
const TAB_OF = { home: 'tabHome', saves: 'tabHome', library: 'textBtn', glossary: 'glossBtn', settings: 'tabSet' };
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  current = id; window.scrollTo(0, 0);
  const play = PLAY_SCREENS.includes(id);
  document.body.dataset.mode = play ? 'play' : 'menu';
  wake(play);
  document.querySelectorAll('.tabbar button').forEach(b => { if (b.id === TAB_OF[id]) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}
function where(a, b) { $('whereSmall').textContent = a; $('whereBig').textContent = b; }
let toastT;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 4500); }
// 遊玩層（開場、朗讀、牌桌）保持螢幕常亮；切到背景時系統會自動放掉，回來再要
let wakeLock = null, wakeBusy = false;
async function wake(on) {
  on = on && S.wake !== false && document.visibilityState === 'visible';
  if (!navigator.wakeLock || wakeBusy || on === !!wakeLock) return;
  wakeBusy = true; let ok = true;
  try {
    if (on) { const l = await navigator.wakeLock.request('screen'); wakeLock = l; l.addEventListener('release', () => { if (wakeLock === l) wakeLock = null; }); }
    else { const w = wakeLock; wakeLock = null; await w.release(); }
  } catch (e) { wakeLock = null; ok = false; }
  wakeBusy = false;
  // 等待期間畫面可能又換了（要不到就算了，不重試）
  if (ok) wake(document.body.dataset.mode === 'play');
}
document.addEventListener('visibilitychange', () => wake(document.body.dataset.mode === 'play'));
