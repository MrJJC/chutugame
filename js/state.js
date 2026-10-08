'use strict';
/* ---------- settings ---------- */
const S = Object.assign({ engine: 'browser', voiceURI: '', rate: 0.85, pitch: 0.8, reveal: 'sentence', key: '', model: 'google/gemini-3.8-flash-tts', gvoice: 'Charon', style: '請用台灣口音的國語，以低沉、緩慢、帶著壓抑不安的語氣，像在昏暗燭光下說故事一樣，朗讀以下文字：' }, store.get('asr.settings', {}));
let auto = true;

/* ---------- saves（存檔） ---------- */
const SV = store.get('asr.saves', null) || (() => {
  const id = 's' + Date.now();
  return { active: id, list: { [id]: { id, name: '我的戰役', created: Date.now(), updated: Date.now(), progress: null, results: {}, log: [] } } };
})();
const persist = () => { const s = SV.list[SV.active]; if (s) s.updated = Date.now(); store.set('asr.saves', SV); };
const save = () => SV.list[SV.active] || Object.values(SV.list)[0];
function saveProgress(phase) {
  save().progress = { scenarioId: CUR.id, phase, pos: G.pos.slice(), history: G.history.map(h => h.slice()) };
  persist();
}
function saveResult(sc, resId, lines) {
  const s = save();
  s.results[sc.id] = { res: resId, at: Date.now() };
  s.log = s.log.filter(e => e.sc !== sc.id);
  (lines || []).forEach(text => s.log.push({ sc: sc.id, text }));
  if (s.progress && s.progress.scenarioId === sc.id) s.progress = null;
  persist();
}
const fmtTime = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* ---------- glossary ---------- */
const GL = Object.assign({ rules: [], quotes: true }, store.get('asr.glossary', {}));
const saveGL = () => store.set('asr.glossary', GL);
const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function ruleSet(mode) {
  const rs = GL.rules.filter(r => r.from && (mode === 'speech' || r.scope === 'all'));
  if (GL.quotes) rs.push({ from: '“', to: '「', q: 1 }, { from: '”', to: '」', q: 1 });
  return rs.sort((a, b) => b.from.length - a.from.length);
}
function segments(text, mode) {
  const rs = ruleSet(mode); if (!rs.length) return [{ t: text }];
  const map = new Map(rs.map(r => [r.from, r]));
  const re = new RegExp(rs.map(r => esc(r.from)).join('|'), 'g');
  const out = []; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    const r = map.get(m[0]); out.push({ t: r.to, from: m[0], q: r.q }); last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
const applyGL = (t, mode) => segments(t, mode).map(x => x.t).join('');
