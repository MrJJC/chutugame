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
  stopPlayback(); fillLibSelects(); renderLibrary(); where('全部循環', '文本庫'); show('library');
  if (restore) window.scrollTo(0, LIB.scroll);
}
$('libCycle').onchange = () => { LIB.cycle = $('libCycle').value; LIB.scenario = 'all'; fillLibSelects(); renderLibrary(); };
$('libScenario').onchange = () => { LIB.scenario = $('libScenario').value; renderLibrary(); };
$('libSearch').oninput = () => { LIB.q = $('libSearch').value; renderLibrary(); };
const OVERLAYS = ['library', 'glossary', 'settings', 'story', 'saves'];
function back() {
  if (returnTo === 'game') toGame(); else if (returnTo === 'library') openLibrary(true);
  else if (returnTo === 'home') toHome(); else toTitle();
}

/* ---------- glossary screen ---------- */
const allText = () => allScenarios().flatMap(sc => sections(sc).flatMap(s => s.groups.flatMap(g => g.items.map(i => i.text).concat(g.fx || '')))).join('\n');
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
  syncPreset(); showClipInfo();
  where('全部循環', '朗讀設定'); show('settings');
}
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
  ['Gemini Flash', 'google/gemini-3.8-flash-tts', 'Charon', '100%'],
  ['Gemini Flash Lite', 'google/gemini-3.8-flash-lite-tts', 'Charon', '66%'],
  ['Fish Audio', 'fish-audio/s2.1-pro', '', '54%'],
  ['Qwen 男聲', 'qwen/qwen-audio-3.0-tts-flash', 'loongjohn', '34%'],
  ['Qwen 女聲', 'qwen/qwen-audio-3.0-tts-flash', 'longanhuan_v3.6', '34%'],
  ['MAI 雲哲', 'microsoft/mai-voice-2.1-flash', 'zh-TW-YunJheNeural', '18%'],
  ['MAI 曉臻', 'microsoft/mai-voice-2.1-flash', 'zh-TW-HsiaoChenNeural', '18%'],
  ['Kokoro', 'hexgrad/kokoro-82m', 'zm_yunjian', '1%'],
  ['Fish Audio 免費版', 'fish-audio/s2.1-pro-free:free', '', '免費']
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
  document.querySelector('input[name=engine][value=openrouter]').checked = true;
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
  const code = JSON.stringify({ v: 1, saves: SV, glossary: GL, settings: S });
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
      renderSaves(); show('saves'); $('saveStatus').textContent = '備份已匯入。';
    }, '匯入');
  } catch (e) { $('saveStatus').textContent = '備份代碼格式不對，請確認是從這個工具匯出的。'; }
};
$('savesDone').onclick = () => { returnTo = 'home'; toHome(); };
$('savesBtn').onclick = openSaves;
$('continueBtn').onclick = resume;
