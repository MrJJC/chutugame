'use strict';
/* ---------- home ---------- */
let CUR = null, homeCycle = null;
function progressText(p) {
  const sc = findSc(p.scenarioId); if (!sc) return '';
  if (p.phase !== 'game') return `${sc.title} · 開場`;
  return `${sc.title} · ` + sc.decks.map((d, k) => { const c = d.cards[(p.pos || [])[k]]; return c ? `${d.label} ${ROMAN[c.stage]}` : ''; }).filter(Boolean).join('／');
}
function resume() {
  const p = save().progress; if (!p) return;
  CUR = findSc(p.scenarioId); homeCycle = CUR.cycle.id;
  // 舊版存檔只記 ag／ac 兩個位置
  G.pos = p.pos ? p.pos.slice() : [p.ag || 0, p.ac || 0];
  G.history = (p.history || []).map(h => Array.isArray(h) ? h.slice() : [h.ag, h.ac]);
  if (p.phase === 'game' && CUR.decks.length) toGame(); else toTitle();
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
const G = { pos: [], history: [] };
function toTitle() {
  stopPlayback(); where(CUR.cycle.name, CUR.title);
  $('titleSmall').textContent = CUR.tag || (CUR.kind === 'story' ? 'Interlude' : `Scenario ${CUR.code}`); $('titleBig').textContent = CUR.title;
  show('title');
}
// 依序跑一段流程：朗讀 read、把 note 列在朗讀後的方框、遇到 ask 讓玩家選
// 同一個問題在這段流程裡問過就沿用答案，不再問第二次
function runFlow(nodes, o) {
  const q = nodes.slice(), answered = {};
  const pick = (n, op) => { answered[n.q] = op.label; q.unshift(...op.nodes); next(); };
  const take = k => { const out = []; while (q.length && q[0].k === k) out.push(q.shift()); return out; };
  function next() {
    const notes = take('note'), reads = take('read'); notes.push(...take('note'));
    if (reads.length || notes.length) {
      const lines = notes.flatMap(n => n.text.split(/\n+/)).filter(Boolean);
      if (o.onNotes) o.onNotes(lines);
      narrate(reads.flatMap(r => chunks(r.text).map(t => ({ text: t, label: o.label }))), { effects: lines, effectsTitle: o.effectsTitle, label: q.length ? '繼續' : o.doneLabel, mute: o.mute, then: next });
      return;
    }
    const n = q.shift();
    if (!n) { o.then(); return; }
    if (n.k === 'goto') { if (o.goto) o.goto(n.res); else next(); return; }
    const prev = n.opts.find(op => op.label === answered[n.q]);
    if (prev) { pick(n, prev); return; }
    choose(applyGL(n.q, 'display'), n.opts.map(op => ({ label: applyGL(op.label, 'display'), fn: () => pick(n, op) })));
  }
  next();
}
function startIntro() {
  const sc = CUR;
  G.pos = sc.decks.map(d => { const s = deckStart(d); return s.length ? s[0][1] : -1; }); G.history = [];
  saveProgress('intro');
  where(`${sc.cycle.name} · 開場`, sc.title);
  if (sc.kind === 'story') {
    const lines = [];
    if (sc.mute) toast('依規則這一段不念出聲，請照畫面指示由該看的人自己讀');
    runFlow(sc.flow, { label: sc.title, effectsTitle: '照指示執行', doneLabel: '完成，回到選擇關卡', mute: sc.mute, onNotes: l => lines.push(...l), then: () => { saveResult(sc, 'done', lines); toHome(); } });
    return;
  }
  runFlow(sc.flow, { label: '開場', effectsTitle: '設置（照戰役手冊擺好後再繼續）', doneLabel: '開始遊戲', then: () => pickStart(0) });
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
  stopPlayback(); where(`${CUR.cycle.name} · 進行中`, CUR.title);
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
    read.classList.add(cls); read.textContent = '重念';
    read.onclick = () => { ensureCtx(); narrate(cardItems(c, d.label), { label: '回到遊戲', then: toGame }); };
    adv.classList.add(cls); adv.textContent = `推進${d.label}`;
    // 確認後整張卡翻過去，再開始念背面
    adv.onclick = () => confirmThen(`確定推進${d.label}？翻過去就會看到下一張的內容。`, cls, () => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { advance(k); return; }
      el.classList.add('flip'); setTimeout(() => advance(k), 400);
    }, '翻開');
    box.append(el);
  });
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
function flipBack(k, idx) {
  const d = CUR.decks[k], list = d.cards, word = d.label, c = list[idx];
  const snap = () => G.history.push(G.pos.slice());
  const setIdx = j => { snap(); G.pos[k] = j; };
  const effects = c.backText.split(/\n+/).filter(Boolean), effectsTitle = `${word} ${ROMAN[c.stage]} 背面：照卡面執行`;
  if (c.res.length) {
    snap();
    const go = () => c.res.length === 1 ? resolution(c.res[0]) : choose('依卡背的決定，進入哪一個結局？', c.res.map(id => ({ label: resLabel(id), fn: () => resolution(id) })));
    narrate(cardItems(c, word, true), { effects, effectsTitle, label: c.res.length === 1 ? `進入${resLabel(c.res[0])}` : '選擇結局', then: go });
    return;
  }
  // 卡背指示「移除這疊，換成另一張卡」（黑星升起的密謀 2 → 場景 3）
  const swapTo = CUR.swap && CUR.swap[c.code];
  if (swapTo) {
    const k2 = CUR.decks.findIndex(x => x.cards.some(y => y.code === swapTo)), d2 = CUR.decks[k2], j2 = d2.cards.findIndex(y => y.code === swapTo);
    snap(); G.pos[k] = -1; G.pos[k2] = j2;
    narrate([...cardItems(c, word, true), ...cardItems(d2.cards[j2], d2.label)], { effects, effectsTitle, label: '回到遊戲', then: toGame });
    return;
  }
  // 下一階段依正面名稱分組；同名的多個版本先當成同一張
  const groups = [];
  list.forEach((x, j) => { if (x.stage === c.stage + 1 && !groups.some(g => g.name === x.name)) groups.push({ name: x.name, j }); });
  if (groups.length > 1) {
    narrate(cardItems(c, word, true), { effects, effectsTitle, label: '選擇翻到的下一張',
      then: () => pickBranch(word, c, groups.map(g => [list[g.j], g.j]), j => { setIdx(j); narrate(cardItems(list[j], word), { label: '回到遊戲', then: toGame }); }) });
    return;
  }
  if (groups[0]) setIdx(groups[0].j); else snap();
  narrate([...cardItems(c, word, true), ...(groups[0] ? cardItems(list[groups[0].j], word) : [])], { effects, effectsTitle, label: groups[0] ? '回到遊戲' : '回到遊戲（這疊已經到底）', then: toGame });
}
function choose(text, options) {
  $('branchText').textContent = text;
  const list = $('branchList'); list.replaceChildren();
  options.forEach(o => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = o.label; b.onclick = () => { $('branchPick').close(); o.fn(); }; list.append(b); });
  $('branchPick').showModal();
}
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
function resolution(id, lines = []) {
  const sc = CUR, r = sc.resolutions[id];
  saveResult(sc, id, lines);
  where(`${sc.cycle.name} · ${resLabel(id)}`, sc.title);
  runFlow(r.flow, { label: resLabel(id), effectsTitle: '本關結算', doneLabel: '回到選擇關卡', then: toHome,
    onNotes: l => { lines.push(...l); saveResult(sc, id, lines); },
    goto: to => { if (sc.resolutions[to]) resolution(to, lines); else toHome(); } });
}
let pendingAction = null;
function confirmThen(text, cls, fn, yes = '推進') { pendingAction = fn; $('confirmText').textContent = text; $('cYes').className = 'btn solid ' + cls; $('cYes').textContent = yes; $('confirm').showModal(); }
$('cNo').onclick = () => { pendingAction = null; $('confirm').close(); };
$('cYes').onclick = () => { $('confirm').close(); const f = pendingAction; pendingAction = null; if (f) f(); };
$('undoBtn').onclick = () => { const h = G.history.pop(); if (!h) { toast('已經是第一張了'); return; } G.pos = h; toGame(); };
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
$('titleTap').addEventListener('click', () => { ensureCtx(); startIntro(); });
$('titleTap').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ensureCtx(); startIntro(); } });
