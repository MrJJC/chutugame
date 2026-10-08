'use strict';
/* ---------- player ---------- */
const P = { list: [], i: 0, done: false, full: false, run: 0, stopFns: [], after: null, revealed: 0, cur: '' };
function weights(t) {
  const w = [...t].map(c => 1 + ('，、；：'.includes(c) ? 2 : 0) + ('。！？'.includes(c) ? 4 : 0) + ('…—'.includes(c) ? 1 : 0));
  const cum = []; w.reduce((a, x, i) => (cum[i] = a + x), 0); return cum;
}
function render(n) {
  const t = P.cur; n = Math.max(0, Math.min(t.length, n));
  if (n === P.revealed) return;
  P.revealed = n; $('shown').textContent = t.slice(0, n); $('rest').textContent = t.slice(n);
}
function stopPlayback() {
  P.run++; P.stopFns.forEach(f => { try { f(); } catch (e) {} }); P.stopFns = [];
  if (window.speechSynthesis) speechSynthesis.cancel();
}
function narrate(list, after) {
  stopPlayback();
  P.list = list.filter(x => x.text); P.after = after;
  show('story'); $('after').classList.remove('on');
  if (!P.list.length) { finishAll(); return; }
  playPassage(0);
}
function splitSent(t) { return (t.match(/[^。！？]+[。！？]*[」』”）]*/g) || [t]).filter(s => s.trim()); }
function playPassage(i) {
  if ((S.reveal || 'sentence') === 'type') { playTyped(i); return; }
  stopPlayback();
  P.i = i; P.done = false; P.full = false; P.mode = S.reveal;
  const item = P.list[i], run = P.run;
  const raw = S.reveal === 'full' ? [item.text] : splitSent(item.text);
  const disp = raw.map(s => applyGL(s, 'display')), sp = raw.map(s => applyGL(s, 'speech'));
  P.cur = disp.join('');
  $('storyLabel').textContent = item.label || '';
  $('storyCount').textContent = `${i + 1} / ${P.list.length}`;
  $('under').textContent = ''; $('under').classList.remove('caret');
  const box = $('shown'); box.replaceChildren(); $('rest').textContent = '';
  const els = disp.map(t => { const s = document.createElement('span'); s.className = 'sent todo'; s.textContent = t; box.append(s); return s; });
  P.sentEls = els;
  const mark = k => els.forEach((e, j) => { e.className = 'sent ' + (j < k ? 'done' : j === k ? 'now' : 'todo'); });
  const v = (S.engine === 'browser' || S.engine === 'openrouter') && window.speechSynthesis ? pickVoice() : null;
  const deviceOnly = (text, cb) => {
    if (!v) { const t = setTimeout(cb, Math.max(1200, text.length * 140)); P.stopFns.push(() => clearTimeout(t)); return; }
    const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = S.rate; u.pitch = S.pitch;
    let fired = false; const once = () => { if (!fired) { fired = true; cb(); } };
    u.onend = once; u.onerror = () => { const t = setTimeout(once, 400); P.stopFns.push(() => clearTimeout(t)); };
    speechSynthesis.speak(u);
  };
  const speakOne = (text, cb, k) => {
    if (S.engine !== 'openrouter' || !S.key) { deviceOnly(text, cb); return; }
    synth(text).then(url => {
      if (run !== P.run) return;
      const a = new Audio(url); let fired = false; const once = () => { if (!fired) { fired = true; cb(); } };
      P.stopFns.push(() => a.pause());
      a.onended = once; a.onerror = () => deviceOnly(text, once);
      a.play().catch(() => deviceOnly(text, once));
      if (sp[k + 1]) synth(sp[k + 1]).catch(() => {});
      else if (P.list[P.i + 1]) splitSent(applyGL(P.list[P.i + 1].text, 'speech')).slice(0, 1).forEach(t => synth(t).catch(() => {}));
    }).catch(err => {
      if (run !== P.run) return;
      if (!P.warned) { P.warned = true; toast(`Gemini 語音失敗：${err.message}。先改用裝置語音。`); }
      deviceOnly(text, cb);
    });
  };
  const step = k => {
    if (run !== P.run) return;
    if (k >= els.length) { P.done = true; els.forEach(e => e.className = 'sent now'); onPassageEnd(run); return; }
    mark(k);
    speakOne(sp[k], () => { if (run === P.run) step(k + 1); }, k);
  };
  step(0);
}
function playTyped(i) {
  P.mode = 'type';
  stopPlayback();
  P.i = i; P.done = false; P.full = false; P.revealed = -1;
  const item = P.list[i], text = applyGL(item.text, 'display'), speech = applyGL(item.text, 'speech'), run = P.run;
  P.cur = text;
  $('storyLabel').textContent = item.label || '';
  $('storyCount').textContent = `${i + 1} / ${P.list.length}`;
  $('under').textContent = ''; $('under').classList.remove('caret');
  render(0);
  const cum = weights(text), total = cum[cum.length - 1] || 1;
  const byFrac = f => { let k = 0; const target = f * total; while (k < cum.length && cum[k] <= target) k++; return k; };
  const progress = f => { if (run !== P.run || P.done || P.full) return; render(byFrac(Math.min(1, f))); };
  const end = () => { if (run !== P.run || P.done) return; P.done = true; render(text.length); onPassageEnd(run); };
  const timed = spw => {
    const dur = total * spw * 1000, t0 = performance.now();
    let raf = requestAnimationFrame(function step(now) { const f = (now - t0) / dur; progress(f); if (f >= 1) end(); else raf = requestAnimationFrame(step); });
    P.stopFns.push(() => cancelAnimationFrame(raf));
  };
  const v = S.engine === 'browser' ? pickVoice() : null;
  if (!v || !window.speechSynthesis) { timed(0.11); return; }
  const u = new SpeechSynthesisUtterance(speech); u.voice = v; u.lang = v.lang; u.rate = S.rate; u.pitch = S.pitch;
  const est = total * 0.13 / S.rate * 1000, t0 = performance.now(); let raf;
  const loop = now => { progress(Math.min(.97, (now - t0) / est)); raf = requestAnimationFrame(loop); };
  u.onboundary = e => { if (run === P.run && !P.full) render(Math.max(P.revealed, Math.round(e.charIndex * text.length / Math.max(1, speech.length)))); };
  u.onend = () => { cancelAnimationFrame(raf); end(); };
  u.onerror = () => { cancelAnimationFrame(raf); if (run === P.run && !P.done) timed(0.06); };
  P.stopFns.push(() => cancelAnimationFrame(raf));
  speechSynthesis.speak(u); raf = requestAnimationFrame(loop);
}
function onPassageEnd(run) {
  if (P.i >= P.list.length - 1) { $('under').textContent = ''; finishAll(); return; }
  $('under').textContent = '▼'; $('under').classList.add('caret');
  if (auto) { const t = setTimeout(() => { if (run === P.run) playPassage(P.i + 1); }, 900); P.stopFns.push(() => clearTimeout(t)); }
}
function finishAll() {
  const a = P.after || {}, fx = $('effects');
  fx.replaceChildren();
  if (a.effects && a.effects.length) {
    const h = document.createElement('h3'); h.textContent = a.effectsTitle || '照卡面執行'; fx.append(h);
    a.effects.forEach(line => { const p = document.createElement('p'); p.textContent = applyGL(line, 'display'); fx.append(p); });
    fx.hidden = false;
  } else fx.hidden = true;
  $('afterBtn').textContent = a.label || '繼續';
  $('after').classList.add('on');
  $('afterBtn').focus({ preventScroll: true });
}
function storyTap() {
  ensureCtx();
  if (!P.list.length) return;
  if (P.mode !== 'type' && !P.done) {
    stopPlayback(); P.done = true; (P.sentEls || []).forEach(e => e.className = 'sent now');
    if (P.i >= P.list.length - 1) { finishAll(); return; }
    $('under').textContent = '▼'; $('under').classList.add('caret'); return;
  }
  if (!P.done && !P.full) { P.full = true; render(P.cur.length); return; }
  if (P.i < P.list.length - 1) { playPassage(P.i + 1); return; }
  if (!P.done) { stopPlayback(); P.done = true; render(P.cur.length); $('under').textContent = ''; finishAll(); }
}
$('storyTap').addEventListener('click', storyTap);
$('storyTap').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); storyTap(); } });
$('afterBtn').addEventListener('click', () => { stopPlayback(); const f = P.after && P.after.then; P.list = []; if (f) f(); });
