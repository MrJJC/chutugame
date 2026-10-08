'use strict';
const $ = id => document.getElementById(id);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* =========================================================
   真實資料設定：要加冒險或循環，只要在這裡多寫一行。
   id = arkham-cards-data 的劇本檔名；pack = 卡牌所在的 ArkhamDB 資料包。
   kind: 'story' 是只有朗讀的關卡（序章、幕間故事、尾聲）。
   其餘欄位只有特殊關卡才需要：
     sets  密謀／場景卡分屬多個遭遇組時列出全部
     decks 同時有多疊密謀（或場景）時，各疊的卡號
     swap  某張卡的背面指示「移除這疊，換成另一張卡」時：{ 這張卡號: 換上的卡號 }
     mute  這一關只顯示文字、不出聲
   commonPo 是別的循環的翻譯檔，只用來補通用句子（經驗值結算等）。
   ========================================================= */
const REAL = [
  { id: 'ptc', name: '卡爾克薩之路', folder: 'ptc', extraPo: ['campaign', 'core'],
    commonPo: ['dwl/blood_on_the_altar', 'dwl/lost_in_time_and_space', 'notz/arkham'], scenarios: [
    { id: 'prologue', code: '序', title: '序章', kind: 'story', tag: 'Prologue' },
    { id: 'curtain_call', code: 'I', pack: 'ptc' },
    { id: 'the_last_king', code: 'II', pack: 'ptc' },
    { id: 'lunacys_reward', code: '幕I', title: '癲狂獎勵／現實之影', kind: 'story' },
    { id: 'echoes_of_the_past', code: 'III', pack: 'eotp' },
    { id: 'the_unspeakable_oath', code: 'IV', pack: 'tuo' },
    { id: 'lost_soul', code: '幕II', kind: 'story' },
    { id: 'a_phantom_of_truth', code: 'V', pack: 'apot' },
    { id: 'the_pallid_mask', code: 'VI', pack: 'tpm' },
    { id: 'black_stars_rise', code: 'VII', pack: 'bsr', sets: ['black_stars_rise', 'vortex', 'flood'],
      decks: [
        { kind: 'agenda', label: '密謀 a', codes: ['03275', '03276a', '03276b', '03277'] },
        { kind: 'agenda', label: '密謀 c', codes: ['03278', '03279a', '03279b', '03280'] },
        { kind: 'act', label: '場景', codes: ['03281', '03282'] }],
      swap: { '03276b': '03281', '03279b': '03282' } },
    { id: 'dim_carcosa', code: 'VIII', pack: 'dca' },
    // 規則要求尾聲只由被附身的調查員自己看、不可念出聲，所以這關不出聲
    { id: 'epilogue', code: '終', title: '尾聲', kind: 'story', tag: 'Epilogue', mute: true }
  ] }
];
// 資料庫沒有繁中翻譯的少數設置指示，由本工具自行翻譯（不是官方用字）
const FALLBACK_TR = {
  'Depending on the following circumstances, a different version of Act 2 should be used in this scenario. Each other version of Act 2 is removed from the game.':
    '依下列情況，本場冒險使用不同版本的場景2。將其他所有版本的場景2移出遊戲。',
  'Put the remaining locations (Montparnasse, Gare d’Orsay, Grand Guignol, Canal Saint‐Martin, Père Lachaise Cemetery, Notre‐Dame, and Gardens of Luxembourg) into play. Each investigator begins play at Montparnasse.':
    '將剩餘地點(蒙巴納斯、奧賽火車站、大木偶劇場、聖馬丁運河、拉雪茲神父公墓、巴黎聖母院、盧森堡公園)放置入場。每位調查員從蒙巴納斯開始遊戲。'
};
// 內建的 OpenRouter 金鑰，必須是「朗讀設定 → 把金鑰加密後內建」產生的密文，不可以放明文。
// 這個 repo 和網站都是公開的：明文金鑰一推上去就等於公開，寫在程式裡的密碼比對也擋不住人。
// 密文要用通行密碼才解得開；密碼不要寫在任何檔案裡。沒有要內建就留 null。
const KEY_VAULT = {"n":600000,"s":"G1FYt3IU4muF5NHdyerB3A==","i":"TNovXIc5LfAJPVat","c":"6tUcu+TjDtz/2Ul+Y7+Jev6RFMSAx5eAai/nJDIC8FNypauCFX8eS7VGCEFzXXbaOb1hX5BbS4xUs4kI9gqomlr2sGEUOtshpXKcg6TKdf1bWqLDY9y+OBg="};
const RAW_CARDS = 'https://raw.githubusercontent.com/zzorba/arkham-cards-data/master/';
const RAW_ADB = 'https://raw.githubusercontent.com/Kamalisk/arkhamdb-json-data/master/';
const mirror = u => u.replace('https://raw.githubusercontent.com/zzorba/arkham-cards-data/master/', 'https://cdn.jsdelivr.net/gh/zzorba/arkham-cards-data@master/')
  .replace('https://raw.githubusercontent.com/Kamalisk/arkhamdb-json-data/master/', 'https://cdn.jsdelivr.net/gh/Kamalisk/arkhamdb-json-data@master/');
