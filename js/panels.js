'use strict';
/* ---------- library（文本庫） ---------- */
const LIB = { cycle: 'all', scenario: 'all', q: '', scroll: 0, openLoc: new Set() };
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
      // 這關正在玩：地點卡先收起來，免得看到還沒去過的地點
      const s = save();
      if (sec.loc && s.progress && s.progress.scenarioId === sc.id && !LIB.openLoc.has(sc.id)) {
        if (q) return;
        const b = document.createElement('button'); b.className = 'small-btn lib-reveal'; b.textContent = '這關正在進行，地點卡先收起來。點這裡顯示';
        b.onclick = () => { LIB.openLoc.add(sc.id); renderLibrary(); };
        wrap.append(secEl, b); return;
      }
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
  sc.decks.forEach(d => d.cards.forEach(c => {
    [['flavor', '正面'], ['backFlavor', '背面'], ['backText', '背面效果']].forEach(([key, side]) => {
      if (c[key]) out.push({ obj: c, key, where: `${d.label} ${ROMAN[c.stage]} ${side}：${side === '正面' ? c.name : c.backName || c.name}` });
    });
    (c.cases || []).forEach(x => [['story', '背面劇情'], ['fx', '背面效果']].forEach(([key, side]) => {
      if (x[key]) out.push({ obj: x, key, where: `${d.label} ${ROMAN[c.stage]} ${side}（${x.cond}）：${c.backName || c.name}` });
    }));
  }));
  (sc.locs || []).forEach(l => [['uflavor', '未翻開'], ['flavor', '翻開']].forEach(([key, side]) => {
    if (l[key]) out.push({ obj: l, key, where: `地點 ${l.num} ${side}：${side === '翻開' ? l.name : l.uname}` });
  }));
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
  if ((returnTo === 'story' || returnTo === 'game') && storyBack) {
    const b = storyBack; storyBack = null;
    if (returnTo === 'game') toGame();
    narrate(b.list, { ...b.after, start: b.i }); return;
  }
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
// 朗讀到一半進設定：記下那一段，按完成回去接著念
let storyBack = null;
function openSettings() {
  storyBack = null;
  if (current === 'story' || (current === 'game' && panelOpen())) { storyBack = { list: P.list.slice(), i: P.i, after: P.after }; returnTo = current; }
  else if (!OVERLAYS.includes(current) || current === 'library') returnTo = current;
  stopPlayback();
  fillSettings();
  where('全部循環', '朗讀設定'); show('settings');
}
function fillSettings() {
  document.querySelectorAll('input[name=engine]').forEach(r => r.checked = r.value === S.engine);
  document.querySelectorAll('input[name=reveal]').forEach(r => r.checked = r.value === (S.reveal || 'sentence'));
  $('keyIn').value = S.key || ''; $('modelIn').value = S.model; $('gvoiceIn').value = S.gvoice; $('styleIn').value = S.style;
  loadVoices();
  $('rateIn').value = S.rate; $('pitchIn').value = S.pitch; $('orateIn').value = S.orate || 1;
  $('ambVol2').value = S.ambVol == null ? .5 : S.ambVol; $('wakeIn').checked = S.wake !== false;
  showRanges();
  $('setStatus').textContent = voices.length ? '' : '這台裝置沒有中文語音，會改成只顯示文字。';
  syncModel(); showClipInfo(); syncEngine();
}
const showRanges = () => {
  $('rateOut').textContent = (+$('rateIn').value).toFixed(2); $('pitchOut').textContent = (+$('pitchIn').value).toFixed(2);
  $('orateOut').textContent = (+$('orateIn').value).toFixed(2) + '×'; $('ambVol2').nextElementSibling.textContent = Math.round($('ambVol2').value * 100) + '%';
};
/* ---------- 內建金鑰：用通行密碼加密／解密（PBKDF2 → AES-GCM，都在瀏覽器裡做） ---------- */
const b64d = t => Uint8Array.from(atob(t), ch => ch.charCodeAt(0)), b64e = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function vaultCipher(pass, salt, n) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: n, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
// 密碼錯的話 decrypt 會丟例外
async function vaultOpen(vault, pass) {
  const k = await vaultCipher(pass, b64d(vault.s), vault.n);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(vault.i) }, k, b64d(vault.c)));
}
async function vaultSeal(key, pass) {
  const n = 600000, salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await vaultCipher(pass, salt, n), new TextEncoder().encode(key));
  return { n, s: b64e(salt), i: b64e(iv), c: b64e(c) };
}
$('vaultBtn').onclick = async () => {
  const st = $('vaultStatus'), pass = $('vaultIn').value; st.classList.remove('err');
  if (!pass) { st.textContent = '請輸入通行密碼。'; return; }
  st.textContent = '解鎖中…';
  try {
    S.key = await vaultOpen(KEY_VAULT, pass); $('keyIn').value = S.key; $('vaultIn').value = '';
    document.querySelector('input[name=engine][value=openrouter]').checked = true; S.engine = 'openrouter'; store.set('asr.settings', S);
    st.textContent = '已帶入金鑰，可以按「試聽」。';
  } catch (e) { st.classList.add('err'); st.textContent = '密碼不對。'; }
};
$('sealBtn').onclick = async () => {
  const st = $('sealStatus'), key = $('keyIn').value.trim(), pass = $('sealPass').value; st.classList.remove('err');
  if (!key || !pass) { st.classList.add('err'); st.textContent = '上面的金鑰和這裡的通行密碼都要填。'; return; }
  if (!window.crypto || !crypto.subtle) { st.classList.add('err'); st.textContent = '這個瀏覽器不支援加密（要用 https 開啟，且不能是太舊的瀏覽器）。'; return; }
  st.textContent = '加密中，手機上大約要等幾秒…'; $('sealOut').value = '';
  try {
    const line = 'const KEY_VAULT = ' + JSON.stringify(await vaultSeal(key, pass)) + ';';
    $('sealOut').value = line; $('sealPass').value = '';
    try { await navigator.clipboard.writeText(line); st.textContent = '已產生並複製。這一行可以公開，但密碼不行。'; } catch (e) { st.textContent = '已產生，請手動複製上面那一行。這一行可以公開，但密碼不行。'; }
  } catch (e) { st.classList.add('err'); st.textContent = '這個瀏覽器不支援加密：' + e.message; }
};

// 只顯示目前聲音來源用得到的設定。線上語音失敗會退回裝置語音，所以那組收進「備用聲音」裡
const devHome = $('grpDevice').nextElementSibling;
function syncEngine() {
  const e = (document.querySelector('input[name=engine]:checked') || {}).value, dev = $('grpDevice');
  $('grpOnline').hidden = e !== 'openrouter'; dev.hidden = e === 'silent';
  if (e === 'openrouter') { if (dev.parentNode !== $('fallbackBox')) $('fallbackBox').append(dev); }
  else if (dev.parentNode !== devHome.parentNode) devHome.before(dev);
  dev.classList.toggle('nested', e === 'openrouter');
  $('vaultRow').hidden = !KEY_VAULT || !!$('keyIn').value;
}
// 改了就存，不用按完成；別的分頁改了這邊也跟著換
$('settings').addEventListener('input', e => { if (!/^(vaultIn|sealPass|sealOut)$/.test(e.target.id)) { readForm(); showRanges(); } });
$('settings').addEventListener('change', e => { if (!/^(vaultIn|sealPass|sealOut)$/.test(e.target.id)) { readForm(); syncEngine(); } });
window.addEventListener('storage', e => { if (e.key === 'asr.settings' && e.newValue) { try { Object.assign(S, JSON.parse(e.newValue)); if (current === 'settings') fillSettings(); } catch (err) {} } });
async function showClipInfo() {
  const st = await clipStats();
  $('clipInfo').textContent = !st ? '這個瀏覽器無法存檔（例如無痕模式）。' : st.n ? `已存 ${st.n} 句，約 ${(st.bytes / 1048576).toFixed(1)} MB` : '還沒有存檔。';
}
$('clipClearBtn').onclick = () => confirmThen('確定清除所有語音存檔？之後重聽會重新產生並計費。', 'blood', async () => { await clipClear(); show('settings'); showClipInfo(); }, '清除');
function readForm() {
  const e = document.querySelector('input[name=engine]:checked'); S.engine = e ? e.value : 'browser';
  const rv = document.querySelector('input[name=reveal]:checked'); S.reveal = rv ? rv.value : 'sentence';
  S.key = $('keyIn').value.trim(); S.model = $('modelIn').value.trim() || 'google/gemini-3.8-flash-tts'; S.gvoice = $('gvoiceIn').value.trim(); S.style = $('styleIn').value;
  S.voiceURI = $('voiceSel').value; S.rate = +$('rateIn').value; S.pitch = +$('pitchIn').value; S.orate = +$('orateIn').value;
  S.wake = $('wakeIn').checked;
  store.set('asr.settings', S);
}
$('ambVol2').oninput = () => setAmbVol(+$('ambVol2').value);
let testAudio = null;
$('testBtn').onclick = () => {
  readForm(); const v = pickVoice(), st = $('setStatus');
  if (S.engine === 'openrouter') {
    if (!S.key) { st.textContent = '還沒填 OpenRouter 金鑰。'; return; }
    st.textContent = '正在產生試聽…';
    if (testAudio) testAudio.pause();
    synth(applyGL('夜已經深了。劇院的燈還亮著，可是那裡，應該空無一人。', 'speech')).then(url => { if (testAudio) testAudio.pause(); testAudio = new Audio(url); setRate(testAudio); testAudio.play().catch(() => {}); st.textContent = `播放中：${S.model}${S.gvoice ? ' · ' + S.gvoice : ''}`; showClipInfo(); })
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
// 改語速時拿已經試聽過的那段直接換速度，不用重新產生
$('orateIn').addEventListener('change', () => { if (testAudio) { setRate(testAudio); testAudio.currentTime = 0; testAudio.play().catch(() => {}); } });
// 線上語音：[顯示名稱, 模型, 相對 Gemini Flash 的價格, [[聲音, 說明, 候選?], …]]
// 候選（第三欄是 1）是原廠公布的聲音名稱，透過 OpenRouter 能不能用、念中文好不好聽還沒試過
const GEMINI_VOICES = [['Charon', '男聲'], ['Kore', '女聲', 1], ['Aoede', '女聲', 1], ['Leda', '女聲', 1], ['Puck', '男聲', 1], ['Fenrir', '男聲', 1], ['Orus', '男聲', 1]];
const TTS_MODELS = [
  ['MiniMax', 'minimax/speech-2.8-turbo', '136%', [['audiobook_male_1', '有聲書男聲'], ['Chinese (Mandarin)_Male_Announcer', '男播音員'], ['Chinese (Mandarin)_Radio_Host', '電台主持'], ['audiobook_female_1', '有聲書女聲', 1]]],
  ['Gemini Flash', 'google/gemini-3.8-flash-tts', '100%', GEMINI_VOICES],
  ['Gemini Flash Lite', 'google/gemini-3.8-flash-lite-tts', '66%', GEMINI_VOICES],
  ['Fish Audio', 'fish-audio/s2.1-pro', '54%', [['', '女聲']]],
  ['Qwen', 'qwen/qwen-audio-3.0-tts-flash', '34%', [['loongjohn', '男聲'], ['longanhuan_v3.6', '女聲']]],
  ['MAI（微軟，台灣口音）', 'microsoft/mai-voice-2.1-flash', '18%', [['zh-TW-YunJheNeural', '雲哲・男聲'], ['zh-TW-HsiaoChenNeural', '曉臻・女聲'], ['zh-TW-HsiaoYuNeural', '曉雨・女聲', 1]]],
  ['Kokoro', 'hexgrad/kokoro-82m', '1%', [['zm_yunjian', '男聲'], ['zf_xiaobei', '女聲', 1], ['zf_xiaoni', '女聲', 1]]],
  // Fish Audio 的聲音是它公開聲音庫裡的編號（社群上傳），這三個是標籤為男聲的旁白型聲音
  ['Fish Audio 免費', 'fish-audio/s2.1-pro-free:free', '免費', [['f4e4280e229b4feba6017a2ffb66149e', '台灣男聲'], ['ef53c4d18a5d46428cf90d2e971c82d8', '懸疑男聲'], ['dd43b30d04d9446a94ebe41f301229b5', '渾厚男聲'], ['', '女聲']]]
];
TTS_MODELS.forEach(([name, , price], i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${name}（${price}）`; $('modelSel').append(o); });
{ const o = document.createElement('option'); o.value = 'custom'; o.textContent = '自訂（自己填模型代號）'; $('modelSel').append(o); }
const voiceLabel = ([v, desc]) => /^[A-Za-z]{2,10}$/.test(v) ? `${desc} · ${v}` : desc;
// 讓兩個下拉選單反映目前欄位裡的模型和聲音；模型不在清單裡就是自訂
function syncModel() {
  const model = $('modelIn').value.trim(), voice = $('gvoiceIn').value.trim(), i = TTS_MODELS.findIndex(m => m[1] === model);
  $('modelSel').value = i < 0 ? 'custom' : i; $('customVoice').hidden = i >= 0; $('voiceRow').hidden = i < 0;
  if (i < 0) return;
  const sel = $('onVoiceSel'); sel.replaceChildren();
  const voices = TTS_MODELS[i][3], add = (parent, v) => { const o = document.createElement('option'); o.value = v[0]; o.textContent = voiceLabel(v); parent.append(o); };
  voices.filter(v => !v[2]).forEach(v => add(sel, v));
  const cands = voices.filter(v => v[2]);
  if (cands.length) { const g = document.createElement('optgroup'); g.label = '候選（還沒試過）'; cands.forEach(v => add(g, v)); sel.append(g); }
  if (!voices.some(v => v[0] === voice)) add(sel, [voice, `目前：${voice || '（預設）'}`]);
  sel.value = voice;
}
const pickVoiceTest = () => { document.querySelector('input[name=engine][value=openrouter]').checked = true; readForm(); syncEngine(); $('testBtn').click(); };
$('modelSel').onchange = () => {
  const m = TTS_MODELS[$('modelSel').value];
  if (!m) { $('customVoice').hidden = false; $('voiceRow').hidden = true; return; }
  // 換模型時，新模型有同名的聲音就沿用，沒有就用它的第一個
  const keep = m[3].find(v => v[0] === $('gvoiceIn').value.trim());
  $('modelIn').value = m[1]; $('gvoiceIn').value = (keep || m[3][0])[0]; syncModel(); pickVoiceTest();
};
$('onVoiceSel').onchange = () => { $('gvoiceIn').value = $('onVoiceSel').value; pickVoiceTest(); };
$('modelIn').addEventListener('change', syncModel);

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

/* ---------- 用 QR Code 換裝置 ----------
   QR Code 裡是一個網址，# 後面夾帶壓縮過的目前存檔（進度、完成紀錄、日誌）和名詞替換表。
   金鑰、校對修改、語音存檔都不放：金鑰太敏感，後兩者太大，換裝置請用備份代碼。
   一個 QR Code 最多裝得下約 2,900 個字元，太長就依序拿掉名詞替換表、日誌。 */
const QR_LIB = { src: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', sri: 'sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1' };
const QR_MAX = 2900;
let qrLib = null;
const loadQrLib = () => qrLib || (qrLib = new Promise((res, rej) => {
  const el = document.createElement('script'); el.src = QR_LIB.src; el.integrity = QR_LIB.sri; el.crossOrigin = 'anonymous';
  el.onload = () => res(window.qrcode); el.onerror = () => { qrLib = null; rej(new Error('QR Code 程式載入失敗，請確認有連網')); };
  document.head.append(el);
}));
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
// 有壓縮就壓（z 開頭），舊瀏覽器沒有就直接放（j 開頭）
async function packTransfer(data) {
  const raw = new TextEncoder().encode(JSON.stringify(data));
  return window.CompressionStream ? 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw'))) : 'j' + b64url(raw);
}
async function unpackTransfer(t) {
  const bytes = unb64url(t.slice(1));
  return JSON.parse(new TextDecoder().decode(t[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes));
}
const transferUrl = payload => location.origin + location.pathname + '#take=' + payload;
// 日誌每一行都是某關劇本裡的一句指示，兩台裝置的劇本一樣，所以只傳「第幾句」，對不到的才傳原文
const scLines = id => { const sc = findSc(id); return sc ? [...new Set([sc.flow, ...Object.values(sc.resolutions).map(r => r.flow)].flatMap(flowTexts).flatMap(t => t.split(/\n+/)).filter(Boolean))] : []; };
const packLog = log => log.map(e => { const i = scLines(e.sc).indexOf(e.text); return [e.sc, i >= 0 ? i : e.text]; });
const unpackLog = log => (log || []).map(e => Array.isArray(e) ? { sc: e[0], text: typeof e[1] === 'number' ? scLines(e[0])[e[1]] || '' : e[1] } : e).filter(e => e.text);
async function openQr() {
  if (current === 'game') saveProgress('game');
  $('qrImg').className = 'qr wait'; $('qrImg').textContent = '產生中…'; $('qrNote').textContent = '';
  if (!$('qrBox').open) $('qrBox').showModal();
  try {
    const s = save(), full = { v: 1, name: s.name, progress: s.progress, results: Object.fromEntries(Object.entries(s.results).map(([k, r]) => [k, { res: r.res }])), log: packLog(s.log), gl: { rules: GL.rules, quotes: GL.quotes } };
    // 依序試：全部 → 不帶名詞替換表 → 也不帶日誌
    const tries = [[full, ''], [{ ...full, gl: null }, '名詞替換表太大，這次沒有帶過去；需要的話請用備份代碼。'], [{ ...full, gl: null, log: [] }, '日誌和名詞替換表太長，這次只帶進度和完成紀錄；完整內容請用「存檔與日誌」的備份代碼。']];
    let url = '', note = '';
    for (const [data, msg] of tries) { url = transferUrl(await packTransfer(data)); note = msg; if (url.length <= QR_MAX) break; }
    if (url.length > QR_MAX) throw new Error('進度資料太大，裝不進一個 QR Code，請改用備份代碼');
    const qrcode = await loadQrLib(), q = qrcode(0, 'L'); q.addData(url, 'Byte'); q.make();
    $('qrImg').className = 'qr'; $('qrImg').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $('qrNote').textContent = note || `存檔「${s.name}」${s.progress ? '，' + progressText(s.progress) : ''}`;
  } catch (e) { $('qrImg').className = 'qr wait'; $('qrImg').textContent = '無法產生'; $('qrNote').textContent = e.message; }
}
$('qrOpen').onclick = openQr;
$('qrOpen2').onclick = () => { $('playMenu').close(); openQr(); };
$('qrClose').onclick = () => $('qrBox').close();
$('qrBox').addEventListener('click', e => { if (e.target === $('qrBox')) $('qrBox').close(); });
// 掃描後打開的網址：問過再匯入成一個新存檔，不蓋掉這台原本的進度
async function takeTransfer() {
  const m = /^#take=([jz][\w-]+)$/.exec(location.hash); if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  let d; try { d = await unpackTransfer(m[1]); } catch (e) { toast('這個 QR Code 的內容讀不出來，可能拍得不完整，請重掃一次。'); return; }
  const where = d.progress && findSc(d.progress.scenarioId) ? `，進度在「${progressText(d.progress)}」` : '';
  confirmThen(`要匯入另一台裝置的存檔「${d.name}」${where}嗎？會另存成一個新存檔，不影響這台原本的進度。`, '', () => {
    const id = 's' + Date.now();
    SV.list[id] = { id, name: `${d.name}（從其他裝置）`, created: Date.now(), updated: Date.now(), progress: d.progress || null, results: d.results || {}, log: unpackLog(d.log) };
    SV.active = id; persist();
    if (d.gl) { (d.gl.rules || []).forEach(r => { if (r && r.from && !GL.rules.some(x => x.from === r.from && x.scope === r.scope)) GL.rules.push(r); }); if (typeof d.gl.quotes === 'boolean') GL.quotes = d.gl.quotes; saveGL(); }
    if (save().progress && findSc(save().progress.scenarioId)) resume(); else toHome();
    toast('已匯入，從上次的進度繼續。');
  }, '匯入');
}
$('savesBtn').onclick = openSaves;
$('continueBtn').onclick = resume;
