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
   背景音全部即時合成，不下載音檔。底層一直都在：不和諧的低音、忽強忽弱的風、細雨、老唱片的雜訊；
   上面不定時出現：遠處的悶雷、空蕩劇院裡的管風琴和弦、高處若有似無的鳴響。事件都送進長殘響，聽起來在遠處。 */
let ctx = null, amb = null;
function ensureCtx() { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; if (!ctx) ctx = new AC(); ctx.resume(); return ctx; }
// c 可以是真的 AudioContext，也可以是離線算圖用的 OfflineAudioContext（測試用）
function buildAmb(c, out) {
  const rnd = (a, b) => a + Math.random() * (b - a), pick = list => list[Math.floor(Math.random() * list.length)];
  // 雷聲和管風琴剛好疊在一起時可能太大聲，最後過一道壓縮器擋住
  const limit = c.createDynamicsCompressor(); limit.threshold.value = -8; limit.ratio.value = 12; limit.connect(out);
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
  const ir = c.createBuffer(2, Math.floor(c.sampleRate * 4.5), c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.6); }
  conv.buffer = ir; conv.connect(gain(.55, master));

  // 低音：A 和高它小二度的音擠在一起產生緩慢的拍頻，再壓一個更低的八度
  // 手機喇叭幾乎發不出 200Hz 以下的聲音，所以再疊高一個八度、帶泛音的那一組，小喇叭才聽得到
  const low = filter('lowpass', 700, 0, master);
  [[55, 'sine', .09, .05], [58.27, 'sine', .055, .07], [27.5, 'sine', .04, .03], [110, 'sawtooth', .1, .09], [116.54, 'sawtooth', .07, .06], [164.81, 'triangle', .1, .11]].forEach(([f, type, level, lfo]) => {
    const g = gain(level, low); osc(type, f, g); osc('sine', lfo, gain(level * .6, g.gain));
  });
  // 風：帶通雜訊，中心頻率和音量各自慢慢起伏，聽起來一陣一陣
  const windGain = gain(.4, master), wind = filter('bandpass', 480, 1.1, windGain);
  loop(noise(3), wind);
  osc('sine', .07, gain(240, wind.frequency)); osc('sine', .031, gain(120, wind.frequency));
  osc('sine', .05, gain(.22, windGain.gain)); osc('sine', .013, gain(.12, windGain.gain));
  // 雨：很輕的高頻雜訊
  loop(noise(2), filter('highpass', 1800, 0, filter('lowpass', 6500, 0, gain(.08, master))));
  // 老唱片：稀疏的爆音
  const crackle = c.createBuffer(1, c.sampleRate * 8, c.sampleRate), cd = crackle.getChannelData(0);
  for (let i = 0; i < 70; i++) { const at = Math.floor(Math.random() * (cd.length - 40)), amp = rnd(.2, 1); for (let k = 0; k < 24; k++) cd[at + k] += (Math.random() * 2 - 1) * amp * (1 - k / 24); }
  loop(crackle, filter('bandpass', 2600, .8, gain(.2, master)));

  // ---- 不定時的事件：在 [t0, t0+dur) 這段時間裡預先排好 ----
  const env = (g, t, peak, attack, hold, release) => {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold); g.gain.linearRampToValueAtTime(0, t + attack + hold + release);
  };
  const tone = (type, freq, t, len, to) => { const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.connect(to); o.start(t); o.stop(t + len); };
  const thunder = t => {
    const g = c.createGain(); g.connect(master); g.connect(conv); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(rnd(.22, .4), t + rnd(.15, .5)); g.gain.exponentialRampToValueAtTime(.001, t + rnd(5, 8));
    const n = c.createBufferSource(); n.buffer = noise(8); n.connect(filter('lowpass', rnd(140, 280), 0, g)); n.start(t); n.stop(t + 8);
  };
  // 減和弦疊三全音：聽起來不安定、找不到落腳的地方
  const ORGAN = [[146.83, 174.61, 207.65, 293.66], [130.81, 155.56, 185, 261.63], [164.81, 196, 233.08, 277.18]];
  const organ = t => {
    const g = c.createGain(), hold = rnd(3, 6); g.connect(filter('lowpass', 900, 0, conv)); env(g, t, .14, 1.6, hold, 4.5);
    pick(ORGAN).forEach(f => [1, 2, 3, 4].forEach(h => { const part = c.createGain(); part.gain.value = 1 / (h * h); part.connect(g); tone('sine', f * h * rnd(.998, 1.002), t, hold + 6.5, part); }));
  };
  const HIGH = [466.16, 554.37, 622.25, 739.99, 830.61, 932.33, 1108.73];
  const whisper = t => {
    const g = c.createGain(), f = pick(HIGH); g.connect(conv); g.connect(gain(.25, master)); env(g, t, .09, rnd(2, 4), rnd(.5, 2), rnd(4, 7));
    tone('sine', f, t, 14, g); tone('sine', f * rnd(1.004, 1.012), t, 14, g);     // 兩個差一點點的音互相干擾，像玻璃在響
    if (Math.random() < .5) tone('sine', f * 1.414, t, 14, g);                     // 有時再疊一個三全音
  };
  function schedule(t0, dur) {
    const count = { thunder: 0, organ: 0, whisper: 0 };
    const every = (min, max, first, fn, key) => { for (let t = t0 + first; t < t0 + dur; t += rnd(min, max)) { fn(t); count[key]++; } };
    every(9, 18, rnd(2, 6), whisper, 'whisper');
    every(28, 55, rnd(8, 20), thunder, 'thunder');
    every(40, 75, rnd(14, 30), organ, 'organ');
    return count;
  }
  return { master, nodes, schedule };
}
function startAmb() {
  const c = ensureCtx(); if (!c) return false;
  const a = buildAmb(c, c.destination);
  a.master.gain.linearRampToValueAtTime(.6, c.currentTime + 3);
  // 事件一次排 30 秒，快排完時再排下一段
  let until = c.currentTime + .5;
  const more = () => { a.schedule(until, 30); until += 30; };
  more(); a.timer = setInterval(() => { if (c.currentTime > until - 8) more(); }, 4000);
  amb = a; return true;
}
function stopAmb() {
  if (!amb || !ctx) return; const { master, nodes, timer } = amb; amb = null;
  clearInterval(timer);
  master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
  setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); master.disconnect(); }, 1600);
}
