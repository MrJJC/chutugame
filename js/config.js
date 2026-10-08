'use strict';
const $ = id => document.getElementById(id);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* =========================================================
   真實資料設定：要加冒險或循環，只要在這裡多寫一行。
   encounter = ArkhamDB 的遭遇組代碼；pack = 卡牌所在的資料包。
   ========================================================= */
const REAL = [
  { id: 'ptc', name: '卡爾克薩之路', folder: 'ptc', extraPo: ['campaign', 'core'], scenarios: [
    { id: 'prologue', code: '序', title: '序章', kind: 'story',
      optional: [{ ask: '這次戰役，有人選擇「蘿拉·海耶斯」當調查員嗎？', step: 'lola_prologue', label: '蘿拉·海耶斯的玩家朗讀' }] },
    { id: 'curtain_call', code: 'I', pack: 'ptc' }
    // 之後加：{ id: 'the_last_king', code: 'II', pack: 'eotp' }, ...
  ] }
];
const RAW_CARDS = 'https://raw.githubusercontent.com/zzorba/arkham-cards-data/master/';
const RAW_ADB = 'https://raw.githubusercontent.com/Kamalisk/arkhamdb-json-data/master/';
const mirror = u => u.replace('https://raw.githubusercontent.com/zzorba/arkham-cards-data/master/', 'https://cdn.jsdelivr.net/gh/zzorba/arkham-cards-data@master/')
  .replace('https://raw.githubusercontent.com/Kamalisk/arkhamdb-json-data/master/', 'https://cdn.jsdelivr.net/gh/Kamalisk/arkhamdb-json-data@master/');
