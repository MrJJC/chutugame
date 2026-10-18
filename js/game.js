'use strict';
/* ---------- home ---------- */
let CUR = null, homeCycle = null;
function progressText(p) {
  const sc = findSc(p.scenarioId); if (!sc) return '';
  const c = p.cursor, part = c && c.n > 1 ? ` 第 ${Math.min(c.item, c.n - 1) + 1}／${c.n} 段` : '';
  if (p.phase === 'intro') return `${sc.title} · ${sc.kind === 'story' ? '劇情' : '開場'}${part}`;
  if (p.phase === 'res' && c) return `${sc.title} · ${resLabel(c.res)}${part}`;
  if (p.phase === 'back' && c) { const d = sc.decks[c.k], card = d && d.cards[c.idx]; if (card) return `${sc.title} · ${d.label} ${ROMAN[card.stage]} 背面`; }
  return `${sc.title} · ` + sc.decks.map((d, k) => { const c = d.cards[(p.pos || [])[k]]; return c ? `${d.label} ${ROMAN[c.stage]}` : ''; }).filter(Boolean).join('／');
}
// 存檔裡的進度 → G。舊版存檔只記 ag／ac 兩個位置，history 也只有位置
function loadG(p) {
  G.pos = p.pos ? p.pos.slice() : [p.ag || 0, p.ac || 0];
  G.history = (p.history || []).map(h => Array.isArray(h) ? { pos: h.slice() } : h.pos ? copySnap(h) : { pos: [h.ag, h.ac] });
  G.lastBack = p.lastBack ? p.lastBack.slice() : CUR.decks.map(() => null);
  G.loc = p.loc ? p.loc.map(x => ({ ...x })) : initLoc(CUR);
  G.introAns = (p.introAns || []).slice();
}
// 從上次停下來的地方接著念：開場、卡背、結局念到一半的都回到那一段
function resume() {
  const p = save().progress; if (!p) return;
  CUR = findSc(p.scenarioId); homeCycle = CUR.cycle.id;
  loadG(p); ensureCtx();
  const c = p.cursor;
  if (p.phase === 'intro' && c) { startIntro(c); return; }
  if (p.phase === 'res' && c && CUR.resolutions[c.res]) { resolution(c.res, (c.carry || []).slice(), c); return; }
  if (p.phase === 'back' && c && CUR.decks[c.k] && CUR.decks[c.k].cards[c.idx]) {
    Object.assign(G, copySnap(c.pre)); G.history = (c.pre.history || []).map(copySnap);
    flipBack(c.k, c.idx, c); return;
  }
  if ((p.phase === 'game' || p.phase === 'back') && CUR.decks.length) toGame(); else toTitle();
}
function renderHome() {
  const s = save();
  $('saveName').textContent = s.name;
  const cb = $('continueBtn'), resumable = s.progress && findSc(s.progress.scenarioId);
  cb.hidden = !resumable; if (resumable) $('continueText').textContent = progressText(s.progress);
  if (!CYCLES.length) return;
  if (!homeCycle || !CYCLES.some(c => c.id === homeCycle)) homeCycle = CYCLES[0].id;
  const tabs = $('cycleTabs'); tabs.replaceChildren(); tabs.hidden = CYCLES.length < 2;
  CYCLES.forEach(cy => {
    const b = document.createElement('button'); b.className = 'tab'; b.textContent = cy.name;
    b.setAttribute('aria-pressed', cy.id === homeCycle);
    b.onclick = () => { homeCycle = cy.id; renderHome(); };
    tabs.append(b);
  });
  const cycle = CYCLES.find(c => c.id === homeCycle), finished = cycle.scenarios.filter(sc => s.results[sc.id]).length;
  $('cycleName').textContent = cycle.name;
  $('cycleProg').textContent = finished ? `已完成 ${finished}／${cycle.scenarios.length} 關` : `共 ${cycle.scenarios.length} 關，從序章開始`;
  $('cycleBar').style.width = finished / cycle.scenarios.length * 100 + '%';
  const list = $('scList'); list.replaceChildren();
  cycle.scenarios.forEach(sc => {
    const b = document.createElement('button'); b.className = 'sc-row' + (sc.kind === 'story' ? ' story' : '');
    const code = document.createElement('span'); code.className = 'code'; code.textContent = sc.code;
    const mid = document.createElement('span'); const st = document.createElement('strong'); st.textContent = sc.title;
    const count = kind => sc.decks.filter(d => d.kind === kind).reduce((n, d) => n + d.cards.length, 0);
    const sm = document.createElement('small'); sm.textContent = sc.kind === 'story' ? '劇情朗讀' : `密謀 ${count('agenda')} 張，場景 ${count('act')} 張`;
    mid.append(st, sm);
    const go = document.createElement('span'); go.className = 'go';
    const doing = s.progress && s.progress.scenarioId === sc.id, done = s.results[sc.id];
    if (doing) { go.textContent = '進行中'; go.classList.add('doing'); }
    else if (done) { go.textContent = sc.kind === 'story' ? '已讀完' : `完成，${resLabel(done.res)}`; go.classList.add('done'); }
    b.append(code, mid, go);
    b.onclick = () => { CUR = sc; store.set('asr.last', sc.id); if (doing) resume(); else toTitle(); };
    list.append(b);
  });
}
function toHome() { stopPlayback(); renderHome(); where('詭鎮劇本朗讀器', '選擇關卡'); show('home'); }

/* ---------- game flow ---------- */
// pos[k] = 第 k 疊目前是哪一張；-1 表示這疊不在場上
// lastBack[k] = 第 k 疊最後翻過的卡 { idx, cs }（cs 是卡背分情況時選的那一種），給「重聽」用
// loc = 地點清單 [{ g: 代表這格的卡號, c: 翻開後是哪一張（null＝未翻開）}]
// introAns = 開場裡回答過的問題，重聽開場時照同一條路走
const G = { pos: [], history: [], lastBack: [], loc: [], introAns: [] };
const copySnap = h => ({ pos: h.pos.slice(), lastBack: h.lastBack ? h.lastBack.map(x => x && { ...x }) : undefined, loc: h.loc ? h.loc.map(x => ({ ...x })) : undefined });
// 「回上一步」用的快照：翻卡、翻開地點、加入地點前各存一份
const snapOf = () => copySnap(G);
const initLoc = sc => (sc.locStart || []).map(code => ({ g: code, c: null }));
function toTitle() {
  stopPlayback(); where(CUR.cycle.name, CUR.title);
  $('titleSmall').textContent = CUR.tag || (CUR.kind === 'story' ? 'Interlude' : `Scenario ${CUR.code}`); $('titleBig').textContent = CUR.title;
  renderPrep();
  show('title');
}
// 依序跑一段流程：朗讀 read、把 note 列在朗讀後的方框、遇到 ask 讓玩家選
// 同一個問題在這段流程裡問過就沿用答案，不再問第二次
// o.track：記錄念到哪裡的物件 { answers, seg, item, n }，每念一段、每回答一題就呼叫 o.save()
// o.resume：上次記下的位置。前面的段落快轉過去（不出聲，但照樣收集指示），提問直接套上次的答案
function runFlow(nodes, o) {
  let q = nodes.slice(), answered = {}, seg = -1, held = [];
  const rec = o.track;
  let ff = o.resume ? { answers: (o.resume.answers || []).slice(), seg: o.resume.seg || 0, item: o.resume.item || 0 } : null;
  const pick = (n, op, user) => {
    answered[n.q] = op.label;
    if (user && rec) { rec.answers.push(op.label); o.save(); }
    q.unshift(...op.nodes); next();
  };
  const take = k => { const out = []; while (q.length && q[0].k === k) out.push(q.shift()); return out; };
  function next() {
    const notes = take('note'), reads = take('read'); notes.push(...take('note'));
    if (reads.length || notes.length) {
      seg++;
      const lines = notes.flatMap(n => n.text.split(/\n+/)).filter(Boolean);
      // 快轉中的指示先留著，真的接上那一段才交出去（萬一對不上要從頭念，才不會重複記）
      if (ff && seg < ff.seg) { held.push(...lines); next(); return; }
      if (o.onNotes) { if (held.length) o.onNotes(held); held = []; o.onNotes(lines); }
      const items = reads.flatMap(r => chunks(r.text).map(t => ({ text: t, label: o.label })));
      const start = ff && seg === ff.seg ? Math.min(ff.item, Math.max(0, items.length - 1)) : 0;
      if (ff) ff.seg = -1;
      if (rec) { rec.seg = seg; rec.item = start; rec.n = items.length; o.save(); }
      narrate(items, { effects: lines, effectsTitle: o.effectsTitle, label: q.length ? '繼續' : o.doneLabel, mute: o.mute, then: next,
        start, onItem: rec && (i => { rec.item = i; o.save(); }) });
      return;
    }
    const n = q.shift();
    // 記下的位置在這段流程裡找不到（劇本資料更新過）：從頭念
    const restart = () => { q = nodes.slice(); answered = {}; seg = -1; held = []; ff = null; if (rec) rec.answers = []; next(); };
    if (!n && ff && ff.seg >= 0) { restart(); return; }
    if (!n) { o.then(); return; }
    if (n.k === 'goto') { if (o.goto) o.goto(n.res); else next(); return; }
    const prev = n.opts.find(op => op.label === answered[n.q]);
    if (prev) { pick(n, prev); return; }
    // 重開後快轉：上次答過的題目照樣作答
    const again = ff && ff.answers.length && n.opts.find(op => op.label === ff.answers[0]);
    if (again) { ff.answers.shift(); if (rec) rec.answers.push(again.label); pick(n, again); return; }
    if (ff && ff.seg >= 0) { restart(); return; }
    choose(applyGL(n.q, 'display'), n.opts.map(op => ({ label: applyGL(op.label, 'display'), fn: () => pick(n, op, true) })));
  }
  next();
}
// 照記下的答案走一遍流程，只取實際會念到的劇情（重聽開場用）
function flowReads(nodes, answers) {
  const q = nodes.slice(), answered = {}, ans = (answers || []).slice(), out = [];
  while (q.length) {
    const n = q.shift();
    if (n.k === 'read') out.push(n.text);
    else if (n.k === 'ask') {
      const op = n.opts.find(x => x.label === answered[n.q]) || n.opts.find(x => x.label === ans[0] && ans.shift());
      if (!op) break;
      answered[n.q] = op.label; q.unshift(...op.nodes);
    }
  }
  return out;
}
function startIntro(resume) {
  const sc = CUR;
  if (!resume) { G.pos = sc.decks.map(d => { const s = deckStart(d); return s.length ? s[0][1] : -1; }); G.history = []; G.lastBack = sc.decks.map(() => null); G.loc = initLoc(sc); G.introAns = []; }
  const rec = { at: 'intro', answers: [], seg: 0, item: 0, n: 0 }, keep = () => saveProgress('intro', rec);
  keep();
  where(`${sc.cycle.name} · 開場`, sc.title);
  if (sc.kind === 'story') {
    const lines = [];
    if (sc.mute) toast('依規則這一段不念出聲，請照畫面指示由該看的人自己讀');
    runFlow(sc.flow, { label: sc.title, effectsTitle: '照指示執行', doneLabel: '完成，回到選擇關卡', mute: sc.mute, track: rec, resume, save: keep,
      onNotes: l => lines.push(...l), then: () => { saveResult(sc, 'done', lines); toHome(); } });
    return;
  }
  runFlow(sc.flow, { label: '開場', effectsTitle: '設置（照戰役手冊擺好後再繼續）', doneLabel: '開始遊戲', track: rec, resume, save: keep,
    then: () => { G.introAns = rec.answers.slice(); saveProgress('game'); pickStart(0); } });
}
// 開局的卡有多個版本時（例如場景 1 有 v. I／v. II），先問用哪一張，再念開局的卡
function pickStart(k) {
  const d = CUR.decks[k];
  if (!d) { narrate(CUR.decks.flatMap((x, i) => x.cards[G.pos[i]] ? cardItems(x.cards[G.pos[i]], x.label) : []), { label: '進入遊戲', then: toGame }); return; }
  const cands = []; deckStart(d).forEach(([c, j]) => { if (!cands.some(([x]) => x.name === c.name)) cands.push([c, j]); });
  if (cands.length < 2) { pickStart(k + 1); return; }
  choose(`這場冒險用的是哪一張${d.label} ${ROMAN[cands[0][0].stage]}？照設置指示，看手上那張卡的名稱點選。`,
    cands.map(([c, j]) => ({ label: applyGL(c.name, 'display'), fn: () => { G.pos[k] = j; pickStart(k + 1); } })));
}
function toGame() {
  closePanel(); stopPlayback(); where(`${CUR.cycle.name} · 進行中`, CUR.title);
  saveProgress('game');
  const box = $('decks'); box.replaceChildren();
  CUR.decks.forEach((d, k) => {
    const c = d.cards[G.pos[k]]; if (!c) return;
    const cls = d.kind === 'agenda' ? 'blood' : 'verd';
    const el = document.createElement('div'); el.className = `deck ${d.kind}`;
    el.innerHTML = '<div class="head"><span class="num"></span><div class="meta"><small></small><strong></strong></div><span class="need"></span></div><p class="flavor"></p><div class="row"><button class="btn"></button><button class="btn solid"></button></div>';
    const q = s => el.querySelector(s), [read, adv] = el.querySelectorAll('button');
    q('.num').textContent = ROMAN[c.stage]; q('small').textContent = `${d.label} · ${c.stage} / ${maxStage(d.cards)}`;
    q('strong').textContent = applyGL(c.name, 'display'); q('.need').textContent = c.need; q('.flavor').textContent = applyGL(c.flavor, 'display');
    read.classList.add(cls); read.textContent = '▶ 朗讀';
    read.onclick = () => { ensureCtx(); narrate(cardItems(c, d.label), { panel: true, then: closePanel }); };
    adv.classList.add(cls); adv.textContent = `推進${d.label}`;
    // 確認後整張卡翻過去，再開始念背面
    adv.onclick = () => confirmThen(`確定推進${d.label}？翻過去就會看到下一張的內容。`, cls, () => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { advance(k); return; }
      el.classList.add('flip'); setTimeout(() => advance(k), 400);
    }, '翻開');
    box.append(el);
  });
  renderLocs();
  show('game');
}
const maxStage = list => Math.max(...list.map(c => c.stage));
function advance(k) {
  const d = CUR.decks[k], list = d.cards, idx0 = G.pos[k], c0 = list[idx0];
  // 同一張正面、背面不同的版本（例如謝幕的場景 2）：翻開後選背面
  const variants = list.map((x, j) => [x, j]).filter(([x]) => x.stage === c0.stage && x.name === c0.name);
  if (variants.length > 1) {
    choose(`翻開${d.label} ${ROMAN[c0.stage]}「${applyGL(c0.name, 'display')}」，背面的標題是哪一個？`,
      variants.map(([x, j]) => ({ label: applyGL(x.backName || x.name, 'display'), fn: () => { G.pos[k] = j; flipBack(k, j); } })));
    return;
  }
  flipBack(k, idx0);
}
// 卡背要念的段落：背面的風味文字，加上分情況時選的那一段劇情
const backItems = (c, word, cs) => {
  const label = `${word} ${ROMAN[c.stage]} 背面 · ${c.backName}`;
  return [...cardItems(c, word, true), ...(cs != null && c.cases ? chunks(c.cases[cs].story).map(t => ({ text: t, label })) : [])];
};
const backFx = (c, cs) => [c.backText, cs != null && c.cases ? c.cases[cs].fx : ''].join('\n').split(/\n+/).filter(Boolean);
// resume：重開後接著念這張卡背 { cs, item }
function flipBack(k, idx, resume) {
  const d = CUR.decks[k], list = d.cards, word = d.label, c = list[idx], cases = c.cases || [];
  // 卡背分成幾種情況（真相幻影場景 1 等）：先問是哪一種，只念那一段
  if (cases.length > 1 && (!resume || resume.cs == null)) {
    choose(`照${word} ${ROMAN[c.stage]}「${applyGL(c.name, 'display')}」背面，是哪一種情況？`,
      cases.map((x, i) => ({ label: applyGL(x.cond, 'display'), fn: () => flipBack(k, idx, { ...(resume || {}), cs: i }) })));
    return;
  }
  const cs = cases.length ? (cases.length > 1 ? resume.cs : 0) : null;
  // 先記下翻卡前的狀態：念到一半重開時從這裡重來
  const rec = { at: 'back', k, idx, cs, pre: { ...snapOf(), history: G.history.map(copySnap) }, item: 0, n: 0 };
  G.history.push(snapOf()); G.lastBack[k] = { idx, cs };
  const items = backItems(c, word, cs); rec.n = items.length;
  saveProgress('back', rec);
  const track = { start: Math.min(resume && resume.item || 0, Math.max(0, items.length - 1)), onItem: i => { rec.item = i; saveProgress('back', rec); } };
  const effects = backFx(c, cs), effectsTitle = `${word} ${ROMAN[c.stage]} 背面：照卡面執行`;
  if (c.res.length) {
    const go = () => c.res.length === 1 ? resolution(c.res[0]) : choose('依卡背的決定，進入哪一個結局？', c.res.map(id => ({ label: resLabel(id), fn: () => resolution(id) })));
    narrate(items, { effects, effectsTitle, label: c.res.length === 1 ? `進入${resLabel(c.res[0])}` : '選擇結局', then: go, ...track });
    return;
  }
  // 卡背指示「移除這疊，換成另一張卡」（黑星升起的密謀 2 → 場景 3）
  const swapTo = CUR.swap && CUR.swap[c.code];
  if (swapTo) {
    const k2 = CUR.decks.findIndex(x => x.cards.some(y => y.code === swapTo)), d2 = CUR.decks[k2], j2 = d2.cards.findIndex(y => y.code === swapTo);
    G.pos[k] = -1; G.pos[k2] = j2;
    narrate([...items, ...cardItems(d2.cards[j2], d2.label)], { effects, effectsTitle, label: '回到遊戲', then: toGame, ...track });
    return;
  }
  // 下一階段依正面名稱分組；同名的多個版本先當成同一張
  const groups = [];
  list.forEach((x, j) => { if (x.stage === c.stage + 1 && !groups.some(g => g.name === x.name)) groups.push({ name: x.name, j }); });
  if (groups.length > 1) {
    narrate(items, { effects, effectsTitle, label: '選擇翻到的下一張', ...track,
      then: () => pickBranch(word, c, groups.map(g => [list[g.j], g.j]), j => { G.pos[k] = j; toGame(); narrate(cardItems(list[j], word), { panel: true, then: closePanel }); }) });
    return;
  }
  if (groups[0]) G.pos[k] = groups[0].j;
  narrate([...items, ...(groups[0] ? cardItems(list[groups[0].j], word) : [])], { effects, effectsTitle, label: groups[0] ? '回到遊戲' : '回到遊戲（這疊已經到底）', then: toGame, ...track });
}
function choose(text, options) {
  $('branchText').textContent = text;
  const list = $('branchList'); list.replaceChildren();
  options.forEach(o => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = o.label; b.onclick = () => { $('branchPick').close(); o.fn(); }; list.append(b); });
  $('branchPick').showModal();
}
// 可以取消的選單（重聽、地點）。grid：選項是短短的卡號，排成格子
function sheet(text, options, grid) {
  $('sheetText').textContent = text;
  const list = $('sheetList'); list.replaceChildren(); list.className = grid ? 'grid' : '';
  options.forEach(o => { const b = document.createElement('button'); b.className = 'btn' + (o.solid ? ' solid' : ''); b.textContent = o.label; b.onclick = () => { $('sheetPick').close(); o.fn(); }; list.append(b); });
  $('sheetPick').showModal();
}
$('sheetCancel').onclick = () => $('sheetPick').close();
$('sheetPick').addEventListener('click', e => { if (e.target === $('sheetPick')) $('sheetPick').close(); });
function pickBranch(word, from, cands, done) {
  $('branchText').textContent = `照${word} ${ROMAN[from.stage]} 背面的指示，你們翻到的是哪一張？看手上那張卡的名稱點選。`;
  const list = $('branchList'); list.replaceChildren();
  cands.forEach(([card, j]) => {
    const b = document.createElement('button'); b.className = 'btn';
    b.textContent = `${word} ${ROMAN[card.stage]}・${applyGL(card.name, 'display')}`;
    b.onclick = () => { $('branchPick').close(); done(j); };
    list.append(b);
  });
  toGame(); $('branchPick').showModal();
}
// lines：這一關到目前為止要記進戰役日誌的指示（結局之間互相轉接時會一路帶著）
// 結局念完才算這關結束；念到一半重開，從記下的那一段接著念
function resolution(id, lines = [], resume) {
  const sc = CUR, r = sc.resolutions[id];
  const rec = { at: 'res', res: id, carry: lines.slice(), answers: [], seg: 0, item: 0, n: 0 }, keep = () => saveProgress('res', rec);
  saveResult(sc, id, lines, true); keep();
  where(`${sc.cycle.name} · ${resLabel(id)}`, sc.title);
  const end = () => { clearProgress(sc); toHome(); };
  runFlow(r.flow, { label: resLabel(id), effectsTitle: '本關結算', doneLabel: '回到選擇關卡', track: rec, resume, save: keep, then: end,
    onNotes: l => { lines.push(...l); saveResult(sc, id, lines, true); },
    goto: to => { if (sc.resolutions[to]) resolution(to, lines); else end(); } });
}
let pendingAction = null;
function confirmThen(text, cls, fn, yes = '推進') { pendingAction = fn; $('confirmText').textContent = text; $('cYes').className = 'btn solid ' + cls; $('cYes').textContent = yes; $('confirm').showModal(); }
$('cNo').onclick = () => { pendingAction = null; $('confirm').close(); };
$('cYes').onclick = () => { $('confirm').close(); const f = pendingAction; pendingAction = null; if (f) f(); };
$('undoBtn').onclick = () => {
  const h = G.history.pop(); if (!h) { toast('已經是第一步了'); return; }
  G.pos = h.pos; if (h.lastBack) G.lastBack = h.lastBack; if (h.loc) G.loc = h.loc;
  toGame();
};
$('resBtn').onclick = () => {
  const list = $('resList'); list.replaceChildren();
  resIds(CUR).forEach(id => {
    const b = document.createElement('button'); b.className = 'btn' + (id === 'no_resolution' ? ' blood' : '');
    b.textContent = id === 'no_resolution' ? '無結局（全員撤退或被擊敗）' : resLabel(id);
    b.onclick = () => { $('resPick').close(); resolution(id); }; list.append(b);
  });
  $('resPick').showModal();
};
$('resCancel').onclick = () => $('resPick').close();
// 重聽：只列已經聽過的內容（照走過的分支念開場、每疊剛翻過的卡背、目前的卡）。都在牌桌上的面板念
$('replayBtn').onclick = () => {
  ensureCtx();
  const back = { panel: true, then: closePanel }, opts = [];
  const intro = flowReads(CUR.flow, G.introAns).flatMap(t => chunks(t).map(x => ({ text: x, label: '開場' })));
  if (intro.length) opts.push({ label: '這關的開場', fn: () => narrate(intro, back) });
  CUR.decks.forEach((d, k) => {
    const lb = G.lastBack[k], c = lb && d.cards[lb.idx]; if (!c) return;
    opts.push({ label: `${d.label} ${ROMAN[c.stage]} 背面 · ${applyGL(c.backName || c.name, 'display')}`,
      fn: () => narrate(backItems(c, d.label, lb.cs), { ...back, effects: backFx(c, lb.cs), effectsTitle: `${d.label} ${ROMAN[c.stage]} 背面：照卡面執行` }) });
  });
  CUR.decks.forEach((d, k) => {
    const c = d.cards[G.pos[k]]; if (!c) return;
    opts.push({ label: `${d.label} ${ROMAN[c.stage]} 正面 · ${applyGL(c.name, 'display')}`, fn: () => narrate(cardItems(c, d.label), back) });
  });
  if (!opts.length) { toast('還沒有可以重聽的內容'); return; }
  sheet('要重聽哪一段？', opts);
};

/* ---------- 地點卡 ----------
   清單照開局擺放，位置固定不跳動。未翻開的像卡背，翻開的像卡面並標出卡號。
   同名的多個版本（往事回聲的歷史協會等）翻開後只列卡號讓玩家對照，不列名稱，避免看到還沒去過的地點。 */
const locOf = code => CUR.locs.find(l => l.code === code);
// 和這張卡未翻開面一樣的所有地點（翻開前分不出是哪一張）。資料偶爾差一個句號，比對時不管標點
const bare = t => (t || '').replace(/[\s\p{P}]/gu, '');
const locGroup = code => { const r = locOf(code); return CUR.locs.filter(l => l.uname === r.uname && bare(l.uflavor) === bare(r.uflavor)); };
const byNum = (a, b) => parseInt(a.num, 10) - parseInt(b.num, 10) || a.num.localeCompare(b.num);
const locTitle = l => applyGL(l.name, 'display') + (l.sub ? `・${applyGL(l.sub, 'display')}` : '');
const locItems = (l, both) => [
  ...(both ? chunks(l.uflavor).map(t => ({ text: t, label: `地點 · ${l.uname}` })) : []),
  ...chunks(l.flavor).map(t => ({ text: t, label: `地點 ${l.num} · ${l.name}${l.sub ? '・' + l.sub : ''}` }))
];
function renderLocs() {
  const box = $('locs'); box.hidden = !CUR.locs.length; if (!CUR.locs.length) return;
  const list = $('locList'); list.replaceChildren();
  G.loc.forEach((cell, i) => {
    const l = cell.c && locOf(cell.c), b = document.createElement('button');
    b.className = 'loc ' + (l ? 'face' : 'back'); b.dataset.i = i;
    const no = document.createElement('span'); no.className = 'no';
    const nm = document.createElement('span'); nm.className = 'nm';
    const tag = document.createElement('span'); tag.className = 'tag';
    if (l) { no.textContent = l.num; nm.textContent = locTitle(l); tag.textContent = '▶ 重念'; b.setAttribute('aria-label', `地點 ${l.num} ${locTitle(l)}，已翻開，重念`); }
    else { const u = locOf(cell.g); nm.textContent = applyGL(u.uname, 'display'); tag.textContent = '未翻開'; b.setAttribute('aria-label', `地點 ${u.uname}，未翻開`); }
    b.append(no, nm, tag);
    b.onclick = () => { ensureCtx(); if (l) readLoc(l, false); else openLoc(i); };
    list.append(b);
  });
  const add = document.createElement('button'); add.className = 'loc add'; add.textContent = '＋ 新地點';
  add.onclick = () => { ensureCtx(); sheet('翻開新進場的地點後，看卡上的編號：', CUR.locs.slice().sort(byNum).map(l => ({ label: l.num, fn: () => revealLoc(-1, l) })), true); };
  list.append(add);
}
function openLoc(i) {
  const cell = G.loc[i], grp = locGroup(cell.g), u = locOf(cell.g), name = applyGL(u.uname, 'display');
  // 翻開面念的內容都一樣的版本（蒙巴特爾等）不用問
  const kinds = new Set(grp.map(l => [l.name, l.sub, l.flavor].join('|'))).size;
  if (kinds <= 1) { sheet(`走進「${name}」？會翻開這張地點卡並朗讀。`, [{ label: '翻開並朗讀', solid: true, fn: () => revealLoc(i, u) }]); return; }
  sheet(`走進「${name}」？翻開後，看卡上的編號：`, grp.slice().sort(byNum).map(l => ({ label: l.num, fn: () => revealLoc(i, l) })), true);
}
// i = -1：用「＋ 新地點」加進來的
function revealLoc(i, l) {
  G.history.push(snapOf());
  if (i < 0) { G.loc.push({ g: l.code, c: l.code }); i = G.loc.length - 1; } else G.loc[i].c = l.code;
  saveProgress('game');
  // 清單上那張在原地翻成卡面，同時在面板開始念
  const el = document.querySelector(`.loc[data-i="${i}"]`), go = () => { renderLocs(); readLoc(l, true); };
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) { go(); return; }
  el.classList.add('flip'); setTimeout(go, 400);
}
function readLoc(l, both) {
  const items = locItems(l, both);
  if (!items.length) { toast('這張地點卡沒有劇情文字'); return; }
  narrate(items, { panel: true, then: closePanel });
}
$('titleTap').addEventListener('click', () => { ensureCtx(); startIntro(); });
$('titleTap').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ensureCtx(); startIntro(); } });
