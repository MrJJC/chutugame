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
  // 背景音只在遊玩層響。進遊玩層一定是玩家點出來的，瀏覽器才准開始出聲
  if (play && S.ambOn !== false && !amb) startAmb(); else if (!play && amb) stopAmb();
  document.querySelectorAll('.tabbar button').forEach(b => { if (b.id === TAB_OF[id]) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}
function where(a, b) { $('whereSmall').textContent = a; $('whereBig').textContent = b; }
let toastT;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 4500); }
