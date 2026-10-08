'use strict';
/* ---------- home ---------- */
let CUR = null, homeCycle = null;
function progressText(p) {
  const sc = findSc(p.scenarioId); if (!sc) return '';
  return p.phase === 'game' ? `${sc.title} · 密謀 ${ROMAN[(sc.agenda[p.ag] || {}).stage] || ''}／場景 ${ROMAN[(sc.act[p.ac] || {}).stage] || ''}` : `${sc.title} · 開場`;
}
function resume() {
  const p = save().progress; if (!p) return;
  CUR = findSc(p.scenarioId); homeCycle = CUR.cycle.id;
  G.ag = p.ag || 0; G.ac = p.ac || 0; G.history = (p.history || []).slice();
  if (p.phase === 'game') toGame(); else toTitle();
}
function renderHome() {
  const s = save();
  $('saveName').textContent = s.name;
  const cb = $('continueBtn');
  if (s.progress && findSc(s.progress.scenarioId)) { cb.hidden = false; cb.textContent = `繼續：${progressText(s.progress)}`; } else cb.hidden = true;
  if (!CYCLES.length) return;
  if (!homeCycle || !CYCLES.some(c => c.id === homeCycle)) homeCycle = CYCLES[0].id;
  const tabs = $('cycleTabs'); tabs.replaceChildren();
  CYCLES.forEach(cy => {
    const b = document.createElement('button'); b.className = 'tab'; b.textContent = cy.name;
    b.setAttribute('aria-pressed', cy.id === homeCycle);
    b.onclick = () => { homeCycle = cy.id; renderHome(); };
    tabs.append(b);
  });
  const list = $('scList'); list.replaceChildren();
  CYCLES.find(c => c.id === homeCycle).scenarios.forEach(sc => {
    const b = document.createElement('button'); b.className = 'sc-row';
    const code = document.createElement('span'); code.className = 'code'; code.textContent = sc.code;
    const mid = document.createElement('span'); const st = document.createElement('strong'); st.textContent = sc.title;
    const sm = document.createElement('small'); sm.textContent = sc.kind === 'story' ? '劇情朗讀' : `${sc.agenda.length} 張密謀 · ${sc.act.length} 張場景 · ${resIds(sc).length} 種結局`;
    mid.append(st, sm);
    const go = document.createElement('span'); go.className = 'go';
    const doing = s.progress && s.progress.scenarioId === sc.id, done = s.results[sc.id];
    if (doing) { go.textContent = '進行中'; go.classList.add('doing'); }
    else if (done) { go.textContent = `已完成 · ${resLabel(done.res)}`; go.classList.add('done'); }
    else go.textContent = '開始';
    b.append(code, mid, go);
    b.onclick = () => { CUR = sc; store.set('asr.last', sc.id); if (doing) resume(); else toTitle(); };
    list.append(b);
  });
}
function toHome() { stopPlayback(); renderHome(); where('詭鎮劇本朗讀器', '選擇關卡'); show('home'); }

/* ---------- game flow ---------- */
const G = { ag: 0, ac: 0, history: [] };
function toTitle() {
  stopPlayback(); where(CUR.cycle.name, CUR.title);
  $('titleSmall').textContent = CUR.kind === 'story' ? 'Prologue' : `Scenario ${CUR.code}`; $('titleBig').textContent = CUR.title;
  show('title');
}
function startIntro() {
  G.ag = 0; G.ac = 0; G.history = [];
  saveProgress('intro');
  where(CUR.cycle.name, `${CUR.title} · 開場`);
  if (CUR.kind === 'story') { storyFlow(); return; }
  narrate(chunks(CUR.intro).map(t => ({ text: t, label: '開場' })), {
    effects: CUR.setup || [], effectsTitle: '設置（照戰役手冊擺好後再繼續）',
    label: '開始遊戲', then: () => narrate([...cardItems(CUR.agenda[0], '密謀'), ...cardItems(CUR.act[0], '場景')], { label: '進入遊戲', then: toGame })
  });
}
function storyFlow() {
  const sc = CUR, extras = (sc.extra || []).slice();
  const finish = () => { saveResult(sc, 'done'); toHome(); };
  const nextExtra = () => {
    const o = extras.shift(); if (!o) { finish(); return; }
    choose(o.ask, [
      { label: '有', fn: () => narrate(chunks(o.text).map(t => ({ text: t, label: o.label })), { label: '繼續', then: nextExtra }) },
      { label: '沒有', fn: nextExtra }
    ]);
  };
  narrate(chunks(sc.intro).map(t => ({ text: t, label: sc.title })), { label: extras.length ? '繼續' : '完成，回到選擇關卡', then: nextExtra });
}
function toGame() {
  stopPlayback(); where(CUR.cycle.name, `${CUR.title} · 進行中`);
  saveProgress('game');
  const ag = CUR.agenda[G.ag], ac = CUR.act[G.ac];
  $('agNum').textContent = ROMAN[ag.stage]; $('agSmall').textContent = `密謀 · ${ag.stage} / ${maxStage(CUR.agenda)}`;
  $('agName').textContent = applyGL(ag.name, 'display'); $('agNeed').textContent = ag.need; $('agFlavor').textContent = applyGL(ag.flavor, 'display');
  $('acNum').textContent = ROMAN[ac.stage]; $('acSmall').textContent = `場景 · ${ac.stage} / ${maxStage(CUR.act)}`;
  $('acName').textContent = applyGL(ac.name, 'display'); $('acNeed').textContent = ac.need; $('acFlavor').textContent = applyGL(ac.flavor, 'display');
  show('game');
}
const maxStage = list => Math.max(...list.map(c => c.stage));
const nextCandidates = (list, c) => list.map((x, j) => [x, j]).filter(([x]) => x.stage === c.stage + 1);
function advance(kind) {
  const isAg = kind === 'agenda', list = isAg ? CUR.agenda : CUR.act, word = isAg ? '密謀' : '場景';
  const idx0 = isAg ? G.ag : G.ac, c0 = list[idx0];
  const setIdx = j => { G.history.push({ ag: G.ag, ac: G.ac }); if (isAg) G.ag = j; else G.ac = j; };
  // 同一張正面、背面不同的版本（例如謝幕的場景 2）：翻開後選背面
  const variants = list.map((x, j) => [x, j]).filter(([x]) => x.stage === c0.stage && x.name === c0.name);
  if (variants.length > 1) {
    choose(`翻開${word} ${ROMAN[c0.stage]}「${applyGL(c0.name, 'display')}」，背面的標題是哪一個？`,
      variants.map(([x, j]) => ({ label: applyGL(x.backName || x.name, 'display'), fn: () => { if (j !== idx0) { if (isAg) G.ag = j; else G.ac = j; } flipBack(isAg, list, word, j, setIdx); } })));
    return;
  }
  flipBack(isAg, list, word, idx0, setIdx);
}
function flipBack(isAg, list, word, idx, setIdx) {
  const c = list[idx];
  const effects = c.backText.split(/\n+/).filter(Boolean), effectsTitle = `${word} ${ROMAN[c.stage]} 背面：照卡面執行`;
  if (c.res.length) {
    G.history.push({ ag: G.ag, ac: G.ac });
    const go = () => c.res.length === 1 ? resolution(c.res[0]) : choose('依卡背的決定，進入哪一個結局？', c.res.map(id => ({ label: resLabel(id), fn: () => resolution(id) })));
    narrate(cardItems(c, word, true), { effects, effectsTitle, label: c.res.length === 1 ? `進入${resLabel(c.res[0])}` : '選擇結局', then: go });
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
  if (groups[0]) setIdx(groups[0].j); else G.history.push({ ag: G.ag, ac: G.ac });
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
function resolution(id) {
  const r = CUR.resolutions[id];
  saveResult(CUR, id);
  where(CUR.cycle.name, `${CUR.title} · ${resLabel(id)}`);
  narrate(chunks(r.text).map(t => ({ text: t, label: resLabel(id) })), { effects: r.log, effectsTitle: '本關結算', label: '回到選擇關卡', then: toHome });
}
let pendingAction = null;
function confirmThen(text, cls, fn) { pendingAction = fn; $('confirmText').textContent = text; $('cYes').className = 'btn solid ' + cls; $('confirm').showModal(); }
$('cNo').onclick = () => { pendingAction = null; $('confirm').close(); };
$('cYes').onclick = () => { $('confirm').close(); const f = pendingAction; pendingAction = null; if (f) f(); };
$('agAdv').onclick = () => confirmThen('確定推進密謀？翻過去就會看到下一張的內容。', 'blood', () => advance('agenda'));
$('acAdv').onclick = () => confirmThen('確定推進場景？翻過去就會看到下一張的內容。', 'verd', () => advance('act'));
$('agRead').onclick = () => { ensureCtx(); narrate(cardItems(CUR.agenda[G.ag], '密謀'), { label: '回到遊戲', then: toGame }); };
$('acRead').onclick = () => { ensureCtx(); narrate(cardItems(CUR.act[G.ac], '場景'), { label: '回到遊戲', then: toGame }); };
$('undoBtn').onclick = () => { const h = G.history.pop(); if (!h) { toast('已經是第一張了'); return; } G.ag = h.ag; G.ac = h.ac; toGame(); };
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
