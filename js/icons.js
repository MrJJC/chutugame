'use strict';
// 卡面效果裡的符號：自己畫的細線圖示，尖角、像刻出來的線條，配合暗場與黃衣之王的氣氛。不是官方圖
const star = (n, ro, ri, rot = -90) => 'M' + Array.from({ length: n * 2 }, (_, k) => {
  const r = k % 2 ? ri : ro, a = (rot + k * 180 / n) * Math.PI / 180;
  return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
}).join('L') + 'Z';
// 五芒星：外圈五點每隔一點連起來（線會交叉）
const pentagram = r => { const p = [0, 2, 4, 1, 3].map(k => { const a = (-90 + k * 72) * Math.PI / 180; return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`; }); return 'M' + p.join('L') + 'Z'; };
const IC_PATH = {
  行動: '<path d="M3.5 12h13M11.5 6.5 17 12l-5.5 5.5"/><path d="M19.5 9.5v5"/>',
  反應: '<path d="M18.5 13.5A6.5 6.5 0 1 1 16.4 7"/><path d="M18.8 3.8v4.6h-4.6"/>',
  免費: '<path d="M14 2 5.5 13.6H11L9.6 22 18.5 10.2H13z" fill="currentColor" stroke="none"/>',
  骷髏: '<path d="M7 16.2v-5.8L9.2 5h5.6L17 10.4v5.8l-2 1.1V20H9v-2.7z"/><path d="M8.6 11h2.7l-1.2 2.4zM12.7 11h2.7l-1.5 2.4z" fill="currentColor" stroke="none"/><path d="M11 20v-1.8M13 20v-1.8"/>',
  異教徒: '<path d="M4.5 21 12 2.5 19.5 21"/><path d="M9.2 21 12 11.5l2.8 9.5z" fill="currentColor" stroke="none" opacity=".35"/><path d="M10.9 16.3h.8M12.3 16.3h.8"/>',
  石板: '<path d="M6.5 21V8.6L12 3.5l5.5 5.1V21z"/><path d="M9.6 10.2l2 2.1-2 2.1M14.4 10.2v4.2M9.6 17.6h4.8"/>',
  古神: `<path d="${star(5, 9.6, 1.5)}"/><circle cx="12" cy="12" r="2.4" fill="#0000"/>`,
  觸手: '<path d="M8.2 21.7C6.8 16.8 13.6 15.6 13.6 11c0-3-2.9-4.3-2-7.4 1.7 1.8 4.1 3.9 4.1 7.8 0 5.6-6.6 6.8-6.1 10.3z" fill="currentColor" stroke="none"/>',
  舊印: `<path d="${pentagram(9.4)}"/><path d="M12 10.3l.9 1.9-.9 1.9-.9-1.9z" fill="currentColor" stroke="none"/>`,
  每位調查員: '<path d="M12 4.2 14.6 7.5 12 10.8 9.4 7.5z"/><path d="M5.5 20.5 8 13.8h8l2.5 6.7"/>',
  祝福: `<path d="${star(8, 9.5, 3.2)}"/>`,
  詛咒: '<path d="M16.2 3.4a9 9 0 1 0 4.4 12.8A7 7 0 0 1 16.2 3.4z"/><path d="M8.5 11.5l1.5 1.5M10 11.5l-1.5 1.5"/>'
};
// 四種技能：菱形框加一個明體字（顏色照遊戲裡大家熟悉的分配）
const IC_SKILL = { 意志: '意', 智力: '智', 戰力: '戰', 敏捷: '敏' };
const IC_CLASS = { 意志: 'will', 智力: 'int', 戰力: 'com', 敏捷: 'agi', 觸手: 'fail', 舊印: 'sign' };
function icon(label) {
  const sk = IC_SKILL[label], p = IC_PATH[label];
  if (!sk && !p) return null;
  const el = document.createElement('span'); el.className = 'ic' + (IC_CLASS[label] ? ' ic-' + IC_CLASS[label] : '');
  el.title = label; el.setAttribute('role', 'img'); el.setAttribute('aria-label', label);
  el.innerHTML = sk
    ? `<svg viewBox="0 0 24 24"><path d="M12 1.8 22.2 12 12 22.2 1.8 12z"/><text x="12" y="16.2" text-anchor="middle">${sk}</text></svg>`
    : `<svg viewBox="0 0 24 24">${p}</svg>`;
  return el;
}
// 把「［行動］：抽 1 張」這種文字變成圖示＋文字，放進 el。圖示後面附小字名稱（技能的菱形裡已經有字，不再附）
function fillFx(el, text) {
  el.replaceChildren();
  text.split(/(［[^］]+］)/).forEach(part => {
    const m = /^［([^］]+)］$/.exec(part), ic = m && icon(m[1]);
    if (!ic) { el.append(document.createTextNode(part)); return; }
    el.append(ic);
    if (!IC_SKILL[m[1]]) { const l = document.createElement('span'); l.className = 'ic-l'; l.textContent = `(${m[1]})`; l.setAttribute('aria-hidden', 'true'); el.append(l); }
  });
}
