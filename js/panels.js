'use strict';
/* ---------- library（文本庫） ---------- */
const LIB = { cycle: 'all', scenario: 'all', q: '', scroll: 0 };
function fillMarked(el, text, q) {
  el.replaceChildren();
  const addText = (parent, t) => {
    if (!q) { parent.append(document.createTextNode(t)); return; }
    t.split(q).forEach((part, i) => {
      if (i) { const h = document.createElement('mark'); h.className = 'hit'; h.textContent = q; parent.append(h); }
      if (part) parent.append(document.createTextNode(part));
    });
  };
  segments(text, 'display').forEach(sg => {
    if (sg.from && !sg.q) { const m = document.createElement('mark'); m.title = `原文：${sg.from}`; addText(m, sg.t); el.append(m); }
    else addText(el, sg.t);
  });
}
function fillLibSelects() {
  const cs = $('libCycle'); cs.replaceChildren();
  [['all', '全部循環'], ...CYCLES.map(c => [c.id, c.name])].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; cs.append(o); });
  cs.value = LIB.cycle;
  const ss = $('libScenario'); ss.replaceChildren();
  const pool = LIB.cycle === 'all' ? allScenarios() : CYCLES.find(c => c.id === LIB.cycle).scenarios;
  [['all', '全部關卡'], ...pool.map(s => [s.id, `${s.code} · ${s.title}`])].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; ss.append(o); });
  if (!pool.some(s => s.id === LIB.scenario)) LIB.scenario = 'all';
  ss.value = LIB.scenario;
}
function renderLibrary() {
  const body = $('libBody'); body.replaceChildren();
  const q = LIB.q.trim();
  let pool = LIB.cycle === 'all' ? allScenarios() : CYCLES.find(c => c.id === LIB.cycle).scenarios;
  if (LIB.scenario !== 'all') pool = pool.filter(s => s.id === LIB.scenario);
  let paras = 0, hits = 0;
  pool.forEach(sc => {
    const wrap = document.createElement('div'); wrap.className = 'lib-sc';
    const h = document.createElement('h3'); const sm = document.createElement('small'); sm.textContent = `${sc.cycle.name} · ${sc.code}`;
    h.append(sm, document.createTextNode(sc.title)); wrap.append(h);
    let scHits = 0;
    sections(sc).forEach(sec => {
      const flat = sec.groups.flatMap(g => g.items); let k = 0, secShown = false;
      const secEl = document.createElement('div'); secEl.className = 'lib-sec'; secEl.textContent = sec.title;
      sec.groups.forEach(g => {
        const showItems = [];
        g.items.forEach(it => { const idx = k++; paras++; if (!q || applyGL(it.text, 'display').includes(q)) showItems.push([it, idx]); });
        const fxLines = g.fx ? g.fx.split(/\n+/).filter(Boolean).filter(l => !q || applyGL(l, 'display').includes(q)) : [];
        if (!showItems.length && !fxLines.length) return;
        if (!secShown) { wrap.append(secEl); secShown = true; }
        const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = g.sub; wrap.append(sub);
        showItems.forEach(([it, idx]) => {
          scHits++; const b = document.createElement('button'); b.className = 'para'; fillMarked(b, it.text, q);
          b.onclick = () => { ensureCtx(); LIB.scroll = window.scrollY; CUR = sc; narrate(flat.slice(idx), { label: '回到文本庫', then: () => openLibrary(true) }); };
          wrap.append(b);
        });
        fxLines.forEach(line => { scHits++; const p = document.createElement('p'); p.className = 'fxline'; fillMarked(p, line, q); wrap.append(p); });
      });
    });
    hits += scHits;
    if (scHits) body.append(wrap);
  });
  $('libCount').textContent = q ? `找到 ${hits} 處含「${q}」` : `共 ${pool.length} 個關卡、${paras} 段朗讀文字`;
}
function openLibrary(restore) {
  if (!OVERLAYS.includes(current)) { returnTo = current; if (!restore) { LIB.cycle = CUR.cycle.id; LIB.scenario = CUR.id; } }
  stopPlayback(); fillLibSelects(); renderLibrary(); showOvCount(); where('全部循環', '文本庫'); show('library');
  if (restore) window.scrollTo(0, LIB.scroll);
}
$('libCycle').onchange = () => { LIB.cycle = $('libCycle').value; LIB.scenario = 'all'; fillLibSelects(); renderLibrary(); };
$('libScenario').onchange = () => { LIB.scenario = $('libScenario').value; renderLibrary(); };
let libT;
$('libSearch').oninput = () => { clearTimeout(libT); libT = setTimeout(() => { LIB.q = $('libSearch').value; renderLibrary(); }, 160); };
/* ---------- 文本匯出／匯入（逐段校對） ---------- */
const textHash = t => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
// 一關裡所有可以校對的文字欄位。卡名不在內：同名的卡靠名字認版本，改名字請用名詞替換
function textSlots(sc) {
  const out = [];
  const walk = (nodes, where) => nodes.forEach(n => {
    if (n.k === 'ask') n.opts.forEach(o => walk(o.nodes, where));
    else if (n.k !== 'goto' && n.text) out.push({ obj: n, key: 'text', where: `${where}${n.k === 'note' ? '（指示）' : ''}` });
  });
  walk(sc.flow, '開場');
  sc.decks.forEach(d => d.cards.forEach(c => [['flavor', '正面'], ['backFlavor', '背面'], ['backText', '背面效果']].forEach(([key, side]) => {
    if (c[key]) out.push({ obj: c, key, where: `${d.label} ${ROMAN[c.stage]} ${side}：${side === '正面' ? c.name : c.backName || c.name}` });
  })));
  resIds(sc).forEach(id => walk(sc.resolutions[id].flow, resLabel(id)));
  return out;
}
const origOf = (obj, key) => obj['_' + key] == null ? obj[key] : obj['_' + key];
// 把校對過的版本套到目前載入的劇本上；原文留在 _text 這類欄位，才還原得回來
function applyOverrides() {
  allScenarios().forEach(sc => textSlots(sc).forEach(({ obj, key }) => {
    const orig = origOf(obj, key); obj['_' + key] = orig;
    obj[key] = OV[textHash(orig)] || orig;
  }));
  allTextMemo = [null, ''];
}
const libPool = () => { const pool = LIB.cycle === 'all' ? allScenarios() : CYCLES.find(c => c.id === LIB.cycle).scenarios; return LIB.scenario === 'all' ? pool : pool.filter(sc => sc.id === LIB.scenario); };
function exportText(pool) {
  const seen = new Set();
  const lines = ['# 詭鎮劇本朗讀器 文本 v1', '# 只改每段的文字。「##」和「@」開頭的行是記號，不要改也不要刪。', '# 改完把整份檔案匯入；沒改的段落會被略過，所以只留你改過的幾段也可以。', ''];
  pool.forEach(sc => {
    lines.push(`## ${sc.cycle.name} ${sc.code} ${sc.title}`, '');
    textSlots(sc).forEach(({ obj, key, where }) => {
      const h = textHash(origOf(obj, key)); if (seen.has(h)) return; seen.add(h);
      lines.push(`@${h} ${where}`, obj[key], '');
    });
  });
  return lines.join('\n');
}
function importText(raw) {
  const blocks = {}; let cur = null;
  raw.replace(/^\uFEFF/, '').split(/\r?\n/).forEach(line => {
    const m = /^@([0-9a-f]{8})(\s|$)/.exec(line);
    if (m) { cur = m[1]; blocks[cur] = []; }
    else if (/^##\s/.test(line)) cur = null;
    else if (cur) blocks[cur].push(line);
  });
  const originals = {};
  allScenarios().forEach(sc => textSlots(sc).forEach(({ obj, key }) => { const o = origOf(obj, key); originals[textHash(o)] = o; }));
  let changed = 0, restored = 0, unknown = 0;
  Object.entries(blocks).forEach(([h, ls]) => {
    const text = ls.join('\n').trim();
    if (!(h in originals)) { unknown++; return; }
    if (!text) return;
    if (text === originals[h].trim()) { if (OV[h]) { delete OV[h]; restored++; } }
    else if (OV[h] !== text) { OV[h] = text; changed++; }
  });
  saveOV(); applyOverrides();
  return { blocks: Object.keys(blocks).length, changed, restored, unknown };
}
function showOvCount(msg) {
  const n = Object.keys(OV).length;
  $('libReset').hidden = !n; $('libReset').textContent = `還原全部（${n} 段）`;
  $('libIoStatus').textContent = msg || (n ? `目前有 ${n} 段用的是你改過的版本。` : '');
}
$('libExport').onclick = () => {
  const pool = libPool(), name = pool.length === 1 ? pool[0].title : LIB.cycle === 'all' ? '全部' : pool[0].cycle.name;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportText(pool)], { type: 'text/plain;charset=utf-8' }));
  a.download = `劇本文本_${name}.txt`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showOvCount(`已匯出 ${pool.length} 個關卡的文字。`);
};
$('libImportBtn').onclick = () => $('libImport').click();
$('libImport').onchange = async () => {
  const f = $('libImport').files[0]; if (!f) return;
  const r = importText(await f.text()); $('libImport').value = '';
  renderLibrary();
  showOvCount(!r.blocks ? '這個檔案裡找不到「@」開頭的記號，請確認是從這裡匯出的文字檔。'
    : `讀到 ${r.blocks} 段：套用 ${r.changed} 段修改` + (r.restored ? `、還原 ${r.restored} 段` : '') + (r.unknown ? `、有 ${r.unknown} 段對不上目前的劇本（已略過）` : '') + '。');
};
$('libReset').onclick = () => confirmThen('確定還原全部？你改過的段落會變回資料庫原本的文字。', 'blood', () => {
  Object.keys(OV).forEach(k => delete OV[k]); saveOV(); applyOverrides(); renderLibrary(); show('library'); showOvCount('已全部還原。');
}, '還原');
const OVERLAYS = ['library', 'glossary', 'settings', 'story', 'saves'];
function back() {
  if (returnTo === 'game') toGame(); else if (returnTo === 'library') openLibrary(true);
  else if (returnTo === 'home') toHome(); else toTitle();
}

/* ---------- glossary screen ---------- */
// 全部文本接成一串很花時間，劇本沒換就沿用上次的結果
let allTextMemo = [null, ''];
const allText = () => {
  if (allTextMemo[0] !== CYCLES) allTextMemo = [CYCLES, allScenarios().flatMap(sc => sections(sc).flatMap(s => s.groups.flatMap(g => g.items.map(i => i.text).concat(g.fx || '')))).join('\n')];
  return allTextMemo[1];
};
const countIn = w => w ? allText().split(w).length - 1 : 0;
function renderGlossary() {
  const box = $('gRules'); box.replaceChildren();
  GL.rules.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'rule-row';
    const t = document.createElement('div'); t.className = 'r'; t.textContent = `${r.from} → ${r.to || '（刪除）'}`;
    const sm = document.createElement('small'); sm.textContent = `${r.scope === 'all' ? '文字和朗讀' : '只改讀音'} · 全部文本出現 ${countIn(r.from)} 次`; t.append(sm);
    const del = document.createElement('button'); del.className = 'small-btn'; del.textContent = '刪除';
    del.onclick = () => { GL.rules.splice(i, 1); saveGL(); renderGlossary(); };
    row.append(t, del); box.append(row);
  });
  $('gQuotes').checked = !!GL.quotes;
  const chips = $('gChips'); chips.replaceChildren();
  const all = allText(), found = new Map();
  (all.match(/[\u4e00-\u9fff]{1,6}[·・‧][\u4e00-\u9fff]{1,6}/g) || []).forEach(n => found.set(n, (found.get(n) || 0) + 1));
  (all.match(/[「“]([^」”\n]{1,8})[」”]/g) || []).forEach(n => { n = n.slice(1, -1); found.set(n, (found.get(n) || 0) + 1); });
  allNames().forEach(n => { const c = all.split(n).length - 1; if (c) found.set(n, Math.max(found.get(n) || 0, c)); });
  [...found].filter(([n]) => !GL.rules.some(r => r.from === n)).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([n, c]) => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = n;
    const sm = document.createElement('small'); sm.textContent = `×${c}`; b.append(sm);
    b.onclick = () => { $('gFrom').value = n; $('gTo').value = n; $('gTo').focus(); $('gTo').select(); };
    chips.append(b);
  });
}
function openGlossary() { if (!OVERLAYS.includes(current) || current === 'library') returnTo = current; stopPlayback(); renderGlossary(); $('gStatus').textContent = ''; where('全部循環', '名詞替換'); show('glossary'); }
$('gAdd').onclick = () => {
  const from = $('gFrom').value.trim(), to = $('gTo').value.trim(), st = $('gStatus'), scope = $('gScope').value;
  st.classList.remove('err');
  if (!from) { st.classList.add('err'); st.textContent = '先填「原本的字」。'; return; }
  if (from === to) { st.classList.add('err'); st.textContent = '「改成」和原本的字一樣，請改成你要的用字。'; return; }
  GL.rules = GL.rules.filter(r => !(r.from === from && r.scope === scope));
  GL.rules.push({ from, to, scope }); saveGL();
  st.textContent = `已加入：${from} → ${to || '（刪除）'}，出現 ${countIn(from)} 次。`;
  $('gFrom').value = ''; $('gTo').value = ''; renderGlossary();
};
$('gQuotes').onchange = () => { GL.quotes = $('gQuotes').checked; saveGL(); };
$('gExport').onclick = async () => {
  const code = JSON.stringify({ v: 1, rules: GL.rules, quotes: GL.quotes }); $('gShare').value = code;
  try { await navigator.clipboard.writeText(code); $('gStatus').textContent = '已複製到剪貼簿，可以直接貼給同好。'; }
  catch (e) { $('gStatus').textContent = '代碼在下方欄位，請手動複製。'; }
};
$('gImport').onclick = () => {
  const st = $('gStatus'); st.classList.remove('err');
  try {
    const j = JSON.parse($('gShare').value); if (!Array.isArray(j.rules)) throw new Error();
    let added = 0;
    j.rules.forEach(r => { if (r && r.from && !GL.rules.some(x => x.from === r.from && x.scope === r.scope)) { GL.rules.push({ from: String(r.from), to: String(r.to || ''), scope: r.scope === 'speech' ? 'speech' : 'all' }); added++; } });
    if (typeof j.quotes === 'boolean') GL.quotes = j.quotes;
    saveGL(); renderGlossary(); st.textContent = `已匯入 ${added} 條（重複的略過）。`;
  } catch (e) { st.classList.add('err'); st.textContent = '代碼格式不對，請確認是從這個工具匯出的。'; }
};
$('gDone').onclick = back;

/* ---------- settings ---------- */
function openSettings() {
  if (!OVERLAYS.includes(current) || current === 'library') returnTo = current; stopPlayback();
  document.querySelectorAll('input[name=engine]').forEach(r => r.checked = r.value === S.engine);
  document.querySelectorAll('input[name=reveal]').forEach(r => r.checked = r.value === (S.reveal || 'sentence'));
  $('keyIn').value = S.key || ''; $('modelIn').value = S.model; $('gvoiceIn').value = S.gvoice; $('styleIn').value = S.style;
  loadVoices();
  $('rateIn').value = S.rate; $('rateOut').textContent = (+S.rate).toFixed(2);
  $('pitchIn').value = S.pitch; $('pitchOut').textContent = (+S.pitch).toFixed(2);
  $('setStatus').textContent = voices.length ? '' : '這台裝置沒有中文語音，會改成只顯示文字。';
  syncPreset(); showClipInfo(); syncEngine();
  where('全部循環', '朗讀設定'); show('settings');
}
// 只顯示目前聲音來源用得到的設定；線上語音失敗會退回裝置語音，所以那組也留著
function syncEngine() {
  const e = (document.querySelector('input[name=engine]:checked') || {}).value;
  $('grpOnline').hidden = e !== 'openrouter'; $('grpDevice').hidden = e === 'silent';
}
document.querySelectorAll('input[name=engine]').forEach(r => { r.onchange = syncEngine; });
async function showClipInfo() {
  const st = await clipStats();
  $('clipInfo').textContent = !st ? '這個瀏覽器無法存檔（例如無痕模式）。' : st.n ? `已存 ${st.n} 句，約 ${(st.bytes / 1048576).toFixed(1)} MB` : '還沒有存檔。';
}
$('clipClearBtn').onclick = () => confirmThen('確定清除所有語音存檔？之後重聽會重新產生並計費。', 'blood', async () => { await clipClear(); show('settings'); showClipInfo(); }, '清除');
function readForm() {
  const e = document.querySelector('input[name=engine]:checked'); S.engine = e ? e.value : 'browser';
  const rv = document.querySelector('input[name=reveal]:checked'); S.reveal = rv ? rv.value : 'sentence';
  S.key = $('keyIn').value.trim(); S.model = $('modelIn').value.trim() || 'google/gemini-3.8-flash-tts'; S.gvoice = $('gvoiceIn').value.trim(); S.style = $('styleIn').value;
  S.voiceURI = $('voiceSel').value; S.rate = +$('rateIn').value; S.pitch = +$('pitchIn').value;
  store.set('asr.settings', S);
}
$('rateIn').oninput = () => { $('rateOut').textContent = (+$('rateIn').value).toFixed(2); };
$('pitchIn').oninput = () => { $('pitchOut').textContent = (+$('pitchIn').value).toFixed(2); };
let testAudio = null;
$('testBtn').onclick = () => {
  readForm(); const v = pickVoice(), st = $('setStatus');
  if (S.engine === 'openrouter') {
    if (!S.key) { st.textContent = '還沒填 OpenRouter 金鑰。'; return; }
    st.textContent = '正在產生試聽…';
    if (testAudio) testAudio.pause();
    synth(applyGL('夜已經深了。劇院的燈還亮著，可是那裡，應該空無一人。', 'speech')).then(url => { if (testAudio) testAudio.pause(); testAudio = new Audio(url); testAudio.play().catch(() => {}); st.textContent = `播放中：${S.model}${S.gvoice ? ' · ' + S.gvoice : ''}`; showClipInfo(); })
      .catch(err => { st.textContent = `試聽失敗：${err.message}`; });
    return;
  }
  if (S.engine === 'silent') { st.textContent = '目前設定為不出聲。'; return; }
  if (!v || !window.speechSynthesis) { st.textContent = '這台裝置沒有中文語音。'; return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(applyGL('夜已經深了。圖書館那盞燈還亮著，可是那裡，應該空無一人。', 'speech'));
  u.voice = v; u.lang = v.lang; u.rate = S.rate; u.pitch = S.pitch; speechSynthesis.speak(u);
  st.textContent = `試聽中：${v.name}`;
};
$('saveBtn').onclick = () => { if (testAudio) testAudio.pause(); readForm(); back(); };
// 實測可用的組合：[顯示名稱, 模型, 聲音, 相對 Gemini Flash 的價格]
const TTS_PRESETS = [
  ['MiniMax 有聲書男聲', 'minimax/speech-2.8-turbo', 'audiobook_male_1', '136%'],
  ['MiniMax 男播音員', 'minimax/speech-2.8-turbo', 'Chinese (Mandarin)_Male_Announcer', '136%'],
  ['MiniMax 電台主持', 'minimax/speech-2.8-turbo', 'Chinese (Mandarin)_Radio_Host', '136%'],
  ['Gemini Flash', 'google/gemini-3.8-flash-tts', 'Charon', '100%'],
  ['Gemini Flash Lite', 'google/gemini-3.8-flash-lite-tts', 'Charon', '66%'],
  ['Fish Audio 女聲', 'fish-audio/s2.1-pro', '', '54%'],
  ['Qwen 男聲', 'qwen/qwen-audio-3.0-tts-flash', 'loongjohn', '34%'],
  ['Qwen 女聲', 'qwen/qwen-audio-3.0-tts-flash', 'longanhuan_v3.6', '34%'],
  ['MAI 雲哲', 'microsoft/mai-voice-2.1-flash', 'zh-TW-YunJheNeural', '18%'],
  ['MAI 曉臻', 'microsoft/mai-voice-2.1-flash', 'zh-TW-HsiaoChenNeural', '18%'],
  ['Kokoro', 'hexgrad/kokoro-82m', 'zm_yunjian', '1%'],
  // Fish Audio 的聲音是它公開聲音庫裡的編號（社群上傳），這三個是標籤為男聲的旁白型聲音
  ['Fish 免費・台灣男聲', 'fish-audio/s2.1-pro-free:free', 'f4e4280e229b4feba6017a2ffb66149e', '免費'],
  ['Fish 免費・懸疑男聲', 'fish-audio/s2.1-pro-free:free', 'ef53c4d18a5d46428cf90d2e971c82d8', '免費'],
  ['Fish 免費・渾厚男聲', 'fish-audio/s2.1-pro-free:free', 'dd43b30d04d9446a94ebe41f301229b5', '免費'],
  ['Fish 免費・女聲', 'fish-audio/s2.1-pro-free:free', '', '免費']
];
TTS_PRESETS.forEach(([name, , , price], i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${name}（${price}）`; $('presetSel').append(o); });
{ const o = document.createElement('option'); o.value = 'custom'; o.textContent = '自訂（自己填模型代號）'; $('presetSel').append(o); }
// 讓下拉選單反映目前欄位裡的模型和聲音；對不上任何一組就是自訂
function syncPreset() {
  const i = TTS_PRESETS.findIndex(([, model, voice]) => model === $('modelIn').value.trim() && voice === $('gvoiceIn').value.trim());
  $('presetSel').value = i < 0 ? 'custom' : i; $('customVoice').hidden = i >= 0;
}
$('presetSel').onchange = () => {
  const p = TTS_PRESETS[$('presetSel').value];
  $('customVoice').hidden = !!p; if (!p) return;
  document.querySelector('input[name=engine][value=openrouter]').checked = true; syncEngine();
  $('modelIn').value = p[1]; $('gvoiceIn').value = p[2]; $('testBtn').click();
};

/* ---------- saves screen ---------- */
function renderSaves() {
  const list = $('saveList'); list.replaceChildren();
  Object.values(SV.list).sort((a, b) => b.updated - a.updated).forEach(s => {
    const row = document.createElement('label'); row.className = 'save-item';
    const r = document.createElement('input'); r.type = 'radio'; r.name = 'saveSel'; r.checked = s.id === SV.active;
    r.onchange = () => { SV.active = s.id; persist(); renderSaves(); $('saveStatus').textContent = `已切換到「${s.name}」。`; };
    const sm = document.createElement('small'); sm.textContent = `完成 ${Object.keys(s.results).length} 關 · ${fmtTime(s.updated)}`;
    row.append(r, document.createTextNode(s.name), sm); list.append(row);
  });
  const lb = $('logBody'); lb.replaceChildren();
  const s = save();
  if (!s.log.length && !Object.keys(s.results).length) { const p = document.createElement('p'); p.textContent = '還沒有完成任何關卡。'; lb.append(p); return; }
  allScenarios().filter(sc => s.results[sc.id]).forEach(sc => {
    const h = document.createElement('h3'); h.textContent = `${sc.cycle.name} · ${sc.code} ${sc.title} — ${resLabel(s.results[sc.id].res)}`; lb.append(h);
    s.log.filter(e => e.sc === sc.id).forEach(e => { const p = document.createElement('p'); p.textContent = applyGL(e.text, 'display'); lb.append(p); });
  });
}
function openSaves() { if (!OVERLAYS.includes(current)) returnTo = current; stopPlayback(); renderSaves(); $('saveStatus').textContent = ''; where('全部循環', '存檔與日誌'); show('saves'); }
$('saveNew').onclick = () => {
  const name = $('saveNameIn').value.trim() || `新存檔 ${Object.keys(SV.list).length + 1}`, id = 's' + Date.now();
  SV.list[id] = { id, name, created: Date.now(), updated: Date.now(), progress: null, results: {}, log: [] };
  SV.active = id; persist(); $('saveNameIn').value = ''; renderSaves(); $('saveStatus').textContent = `已建立並切換到「${name}」。`;
};
$('saveRename').onclick = () => {
  const name = $('saveNameIn').value.trim(); if (!name) { $('saveStatus').textContent = '先在上面的欄位輸入新名字。'; return; }
  save().name = name; persist(); $('saveNameIn').value = ''; renderSaves(); $('saveStatus').textContent = `已改名為「${name}」。`;
};
$('saveDel').onclick = () => {
  if (Object.keys(SV.list).length <= 1) { $('saveStatus').textContent = '至少要保留一個存檔。'; return; }
  const s = save();
  confirmThen(`確定刪除「${s.name}」？這個存檔的進度和戰役日誌都會消失。`, 'blood', () => {
    delete SV.list[s.id]; SV.active = Object.keys(SV.list)[0]; persist(); renderSaves(); show('saves'); $('saveStatus').textContent = `已刪除「${s.name}」。`;
  }, '刪除');
};
$('backupOut').onclick = async () => {
  const code = JSON.stringify({ v: 1, saves: SV, glossary: GL, settings: S, overrides: OV });
  $('backupBox').value = code;
  try { await navigator.clipboard.writeText(code); $('saveStatus').textContent = '備份代碼已複製到剪貼簿，貼到記事本或傳給自己保存。'; }
  catch (e) { $('saveStatus').textContent = '備份代碼在下方欄位，請手動複製保存。'; }
};
$('backupIn').onclick = () => {
  try {
    const j = JSON.parse($('backupBox').value);
    if (!j.saves || !j.saves.list) throw new Error();
    confirmThen('匯入會用備份內容取代這台裝置目前的存檔、名詞替換表和設定，確定嗎？', 'blood', () => {
      SV.active = j.saves.active; SV.list = j.saves.list; persist();
      if (j.glossary) { Object.assign(GL, j.glossary); saveGL(); }
      if (j.settings) { Object.assign(S, j.settings); store.set('asr.settings', S); }
      if (j.overrides) { Object.keys(OV).forEach(k => delete OV[k]); Object.assign(OV, j.overrides); saveOV(); applyOverrides(); }
      renderSaves(); show('saves'); $('saveStatus').textContent = '備份已匯入。';
    }, '匯入');
  } catch (e) { $('saveStatus').textContent = '備份代碼格式不對，請確認是從這個工具匯出的。'; }
};
$('savesDone').onclick = () => { returnTo = 'home'; toHome(); };
$('savesBtn').onclick = openSaves;
$('continueBtn').onclick = resume;
