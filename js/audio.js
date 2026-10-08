'use strict';
/* ---------- voices ---------- */
let voices = [];
function loadVoices() {
  if (!window.speechSynthesis) return;
  const all = speechSynthesis.getVoices();
  const zh = all.filter(v => /^zh|cmn|yue/i.test(v.lang));
  // 預設優先：Apple 台灣中文語音（美佳 Meijia），增強／高品質版優先
  const isApple = v => /^com\.apple/i.test(v.voiceURI) || /Meijia|美佳|Mei-Jia|Tingting|婷婷|Sinji|善怡/i.test(v.name);
  const score = v => (/TW|Hant/i.test(v.lang) ? 0 : /HK/i.test(v.lang) ? 20 : 40)
    + (isApple(v) ? 0 : 10)
    - (/Premium|Enhanced|高品質|增強|進階/i.test(v.name + v.voiceURI) ? 5 : 0);
  voices = zh.sort((a, b) => score(a) - score(b));
  const sel = $('voiceSel'); sel.replaceChildren();
  if (!voices.length) { const o = document.createElement('option'); o.textContent = '這台裝置沒有中文語音'; o.value = ''; sel.append(o); return; }
  voices.forEach(v => { const o = document.createElement('option'); o.value = v.voiceURI; o.textContent = `${v.name}（${v.lang}）`; sel.append(o); });
  sel.value = voices.some(v => v.voiceURI === S.voiceURI) ? S.voiceURI : voices[0].voiceURI;
}
if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
const pickVoice = () => voices.find(v => v.voiceURI === S.voiceURI) || voices[0] || null;

/* ---------- Gemini via OpenRouter ---------- */
const audioCache = new Map();
function wavFromPcm(buf, rate = 24000, ch = 1) {
  const pcm = new Uint8Array(buf), h = new ArrayBuffer(44), v = new DataView(h);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, pcm.length, true);
  return new Blob([h, pcm], { type: 'audio/wav' });
}
/* 語音存檔：產生過的句子存在這台裝置的瀏覽器（IndexedDB），同一句、同模型同聲音同語氣只付一次錢 */
const clipDB = new Promise(res => {
  try {
    const r = indexedDB.open('asr-voice', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips');
    r.onsuccess = () => res(r.result); r.onerror = () => res(null);
  } catch (e) { res(null); }
});
const clipStore = async mode => { const db = await clipDB; return db ? db.transaction('clips', mode).objectStore('clips') : null; };
const clipReq = make => new Promise(res => { try { const r = make(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } });
async function clipGet(k) { const st = await clipStore('readonly'); return st ? clipReq(() => st.get(k)) : null; }
async function clipPut(k, v) { const st = await clipStore('readwrite'); if (st) clipReq(() => st.put(v, k)); }
async function clipClear() { const st = await clipStore('readwrite'); if (st) await clipReq(() => st.clear()); audioCache.clear(); }
async function clipStats() {
  const st = await clipStore('readonly'); if (!st) return null;
  return new Promise(res => {
    let n = 0, bytes = 0; const r = st.openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) { res({ n, bytes }); return; } n++; bytes += c.value.buf.byteLength; c.continue(); };
    r.onerror = () => res(null);
  });
}
function synth(text) {
  // 語氣指示要放 instructions，接在文字前面會被念出來
  const style = (S.style || '').trim();
  const k = `${S.model}|${S.gvoice}|${style}|${text}`;
  if (audioCache.has(k)) return audioCache.get(k);
  const p = (async () => {
    let clip = await clipGet(k);
    if (!clip) {
      // Gemini 只給 pcm；其他模型要 mp3（存檔小很多）。猜錯被拒絕就換另一種再試一次
      const ask = async fmt => fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST', headers: { 'Authorization': `Bearer ${S.key}`, 'Content-Type': 'application/json', 'X-Title': 'Arkham Script Reader' },
        body: JSON.stringify({ model: S.model, input: text, response_format: fmt, ...(S.gvoice ? { voice: S.gvoice } : {}), ...(style ? { instructions: style } : {}) })
      });
      const first = /^google\//.test(S.model) ? 'pcm' : 'mp3';
      let r = await ask(first), m = '';
      if (!r.ok) { m = `HTTP ${r.status}`; try { const j = await r.json(); m = (j.error && (j.error.message || j.error)) || m; } catch (e) {} }
      if (!r.ok && /response_format/.test(m)) { r = await ask(first === 'pcm' ? 'mp3' : 'pcm'); if (r.ok) m = ''; }
      if (!r.ok) throw new Error(m || `HTTP ${r.status}`);
      clip = { type: (r.headers.get('content-type') || '').toLowerCase(), buf: await r.arrayBuffer() };
      clipPut(k, clip);
    }
    const { type, buf } = clip;
    if (/mpeg|mp3|wav|ogg|aac|flac/.test(type)) return URL.createObjectURL(new Blob([buf], { type }));
    // 回傳的 Content-Type 像 audio/pcm;rate=24000;channels=1
    return URL.createObjectURL(wavFromPcm(buf, +(/rate=(\d+)/.exec(type) || [])[1] || 24000, +(/channels=(\d+)/.exec(type) || [])[1] || 1));
  })();
  audioCache.set(k, p); p.catch(() => audioCache.delete(k));
  return p;
}

/* ---------- ambience ----------
   背景音全部即時合成，不下載音檔。底層很輕：不和諧的低音、遠遠的風、一點老唱片雜訊。
   氣氛靠不定時冒出來的東西：走音的音樂盒、慢慢往下滑的高音、像有人在耳邊吐氣的聲音、遠處的鐘、
   空蕩劇院裡的管風琴、悶雷。這些都送進長殘響，聽起來在遠處、在別的房間。 */
let ctx = null, amb = null;
function ensureCtx() { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; if (!ctx) ctx = new AC(); ctx.resume(); return ctx; }
const ambLevel = () => .7 * (S.ambVol == null ? .5 : S.ambVol);
// c 可以是真的 AudioContext，也可以是離線算圖用的 OfflineAudioContext（測試用）
function buildAmb(c, out) {
  const rnd = (a, b) => a + Math.random() * (b - a), pick = list => list[Math.floor(Math.random() * list.length)];
  // 好幾樣東西剛好疊在一起時可能太大聲，最後過一道壓縮器擋住
  const limit = c.createDynamicsCompressor(); limit.threshold.value = -10; limit.ratio.value = 12; limit.connect(out);
  const master = c.createGain(); master.gain.value = 0; master.connect(limit);
  const nodes = [];
  const noise = sec => {
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };
  const gain = (v, to) => { const g = c.createGain(); g.gain.value = v; g.connect(to); return g; };
  const filter = (type, freq, q, to) => { const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; f.connect(to); return f; };
  const osc = (type, freq, to) => { const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.connect(to); o.start(); nodes.push(o); return o; };
  const loop = (buf, to) => { const n = c.createBufferSource(); n.buffer = buf; n.loop = true; n.connect(to); n.start(); nodes.push(n); return n; };
  // 殘響：一段指數衰減的雜訊當脈衝響應，像空曠的大廳
  const conv = c.createConvolver();
  const ir = c.createBuffer(2, Math.floor(c.sampleRate * 5), c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.4); }
  conv.buffer = ir; conv.connect(gain(1.6, master));
  // 遠處的聲音都接到這裡：大部分進殘響，留一點原音才聽得出是什麼
  const far = gain(1, conv); far.connect(gain(.4, master));

  // ---- 底層（都很輕） ----
  // 低音：A 和高它小二度的音擠在一起產生緩慢的拍頻。手機喇叭發不出 200Hz 以下，所以疊高一個八度、帶泛音的那一組
  const low = filter('lowpass', 520, 0, master);
  [[55, 'sine', .07, .05], [58.27, 'sine', .045, .07], [110, 'sawtooth', .045, .09], [116.54, 'sawtooth', .03, .06], [164.81, 'triangle', .04, .11]].forEach(([f, type, level, lfo]) => {
    const g = gain(level, low); osc(type, f, g); osc('sine', lfo, gain(level * .7, g.gain));
  });
  // 風：帶通雜訊，中心頻率和音量各自慢慢起伏
  const windGain = gain(.06, master), wind = filter('bandpass', 420, 1.4, windGain);
  loop(noise(3), wind);
  osc('sine', .07, gain(200, wind.frequency)); osc('sine', .031, gain(110, wind.frequency));
  osc('sine', .05, gain(.035, windGain.gain)); osc('sine', .013, gain(.02, windGain.gain));
  // 老唱片：稀疏的爆音
  const crackle = c.createBuffer(1, c.sampleRate * 8, c.sampleRate), cd = crackle.getChannelData(0);
  for (let i = 0; i < 40; i++) { const at = Math.floor(Math.random() * (cd.length - 40)), amp = rnd(.2, 1); for (let k = 0; k < 24; k++) cd[at + k] += (Math.random() * 2 - 1) * amp * (1 - k / 24); }
  loop(crackle, filter('bandpass', 2600, .8, gain(.05, master)));

  // ---- 不定時的事件：在 [t0, t0+dur) 這段時間裡預先排好 ----
  const env = (g, t, peak, attack, hold, release) => {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold); g.gain.linearRampToValueAtTime(0, t + attack + hold + release);
  };
  const tone = (type, freq, t, len, to) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.connect(to); o.start(t); o.stop(t + len); return o; };
  // 敲一下就慢慢消失的聲音（音樂盒、鐘共用）
  const struck = (freq, t, peak, decay, to) => { const g = c.createGain(); g.connect(to); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + decay); tone('sine', freq, t, decay + .1, g); };
  // 走音的音樂盒：幾個音，節奏不穩，每個音都偏掉一點，最後常常停在半路
  const BOX = [587.33, 698.46, 783.99, 830.61, 932.33, 1108.73, 1174.66];   // D 小調加上降五度
  const musicBox = t => {
    let at = t, i = Math.floor(rnd(0, BOX.length));
    for (let n = Math.floor(rnd(3, 8)); n > 0; n--) {
      const f = BOX[i] * Math.pow(2, rnd(-22, 22) / 1200);
      struck(f, at, .1, rnd(1.8, 3), far); struck(f * 3.01, at, .024, .7, far);
      i = Math.max(0, Math.min(BOX.length - 1, i + pick([-2, -1, -1, 1, 1, 2])));
      at += pick([.42, .42, .5, .84, 1.3]) * rnd(.92, 1.12);
    }
  };
  // 慢慢往下滑的高音：兩個差一點點的音互相干擾，像玻璃在響，然後整個往下沉
  const HIGH = [466.16, 554.37, 622.25, 739.99, 830.61, 932.33];
  const sliding = t => {
    const g = c.createGain(), f = pick(HIGH), len = rnd(9, 14), drop = rnd(.9, .97); g.connect(far);
    env(g, t, .06, rnd(2.5, 4), rnd(1, 3), rnd(4, 6));
    [f, f * rnd(1.005, 1.013), Math.random() < .5 ? f * 1.414 : 0].filter(Boolean).forEach(x => { const o = tone('sine', x, t, len + 2, g); o.frequency.linearRampToValueAtTime(x * drop, t + len); });
  };
  // 吐氣聲：窄頻雜訊，頻率像嘴型一樣滑動，貼得很近（幾乎不加殘響）
  const breath = t => {
    const g = c.createGain(), len = rnd(1.6, 2.8), bp = filter('bandpass', rnd(700, 1100), 7, g); g.connect(master); g.connect(gain(.3, conv));
    env(g, t, rnd(.08, .14), len * .45, 0, len * .55);
    bp.frequency.setValueAtTime(bp.frequency.value, t); bp.frequency.linearRampToValueAtTime(rnd(1300, 2000), t + len * .5); bp.frequency.linearRampToValueAtTime(rnd(500, 800), t + len);
    const n = c.createBufferSource(); n.buffer = noise(3); n.connect(bp); n.start(t); n.stop(t + len + .1);
  };
  // 遠處的鐘：泛音不成整數比，聽起來是金屬、而且有點壞掉
  const bell = t => { const f = pick([98, 110, 123.47]); [[.56, .5], [.92, .7], [1.19, 1], [1.71, .45], [2, .5], [2.74, .28], [3.76, .16]].forEach(([r, a]) => struck(f * r, t, .06 * a, rnd(6, 10) / Math.sqrt(r), far)); };
  // 管風琴：減和弦疊三全音，不安定、找不到落腳的地方
  const ORGAN = [[146.83, 174.61, 207.65, 293.66], [130.81, 155.56, 185, 261.63], [164.81, 196, 233.08, 277.18]];
  const organ = t => {
    const g = c.createGain(), hold = rnd(3, 6); g.connect(filter('lowpass', 900, 0, far)); env(g, t, .09, 1.8, hold, 5);
    pick(ORGAN).forEach(f => [1, 2, 3, 4].forEach(h => { const part = c.createGain(); part.gain.value = 1 / (h * h); part.connect(g); tone('sine', f * h * rnd(.998, 1.002), t, hold + 7.2, part); }));
  };
  const thunder = t => {
    const g = c.createGain(); g.connect(master); g.connect(conv); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(rnd(.1, .2), t + rnd(.2, .6)); g.gain.exponentialRampToValueAtTime(.001, t + rnd(5, 8));
    const n = c.createBufferSource(); n.buffer = noise(8); n.connect(filter('lowpass', rnd(140, 260), 0, g)); n.start(t); n.stop(t + 8);
  };
  function schedule(t0, dur) {
    const count = {};
    const every = (min, max, first, fn, key) => { count[key] = 0; for (let t = t0 + first; t < t0 + dur; t += rnd(min, max)) { fn(t); count[key]++; } };
    every(16, 30, rnd(3, 9), sliding, 'sliding');
    every(22, 45, rnd(6, 16), breath, 'breath');
    every(30, 60, rnd(10, 24), musicBox, 'musicBox');
    every(50, 100, rnd(18, 40), bell, 'bell');
    every(60, 110, rnd(25, 50), organ, 'organ');
    every(50, 90, rnd(20, 45), thunder, 'thunder');
    return count;
  }
  return { master, nodes, schedule };
}
function startAmb() {
  const c = ensureCtx(); if (!c) return false;
  const a = buildAmb(c, c.destination);
  a.master.gain.linearRampToValueAtTime(ambLevel(), c.currentTime + 3);
  // 事件一次排 30 秒，快排完時再排下一段
  let until = c.currentTime + .5;
  const more = () => { a.schedule(until, 30); until += 30; };
  more(); a.timer = setInterval(() => { if (c.currentTime > until - 8) more(); }, 4000);
  amb = a; return true;
}
function setAmbVol(v) {
  S.ambVol = v; store.set('asr.settings', S);
  if (amb && ctx) { amb.master.gain.cancelScheduledValues(ctx.currentTime); amb.master.gain.setTargetAtTime(ambLevel(), ctx.currentTime, .15); }
}
function stopAmb() {
  if (!amb || !ctx) return; const { master, nodes, timer } = amb; amb = null;
  clearInterval(timer);
  master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
  setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); master.disconnect(); }, 1600);
}
