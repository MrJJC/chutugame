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
async function clipPut(k, v) { const st = await clipStore('readwrite'); if (st) await clipReq(() => st.put(v, k)); }
async function clipClear() { const st = await clipStore('readwrite'); if (st) await clipReq(() => st.clear()); audioCache.clear(); }
async function clipStats() {
  const st = await clipStore('readonly'); if (!st) return null;
  return new Promise(res => {
    let n = 0, bytes = 0; const r = st.openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) { res({ n, bytes }); return; } n++; bytes += c.value.buf.byteLength; c.continue(); };
    r.onerror = () => res(null);
  });
}
// 存檔的鍵：同一句、同模型同聲音同語氣才算同一段。語速是播放時調的，不在鍵裡
const clipKey = text => `${S.model}|${S.gvoice}|${(S.style || '').trim()}|${text}`;
// 拿到一段的音訊資料：先找存檔，沒有才花錢產生並存起來。同一段同時要好幾次只送一個請求
const inflight = new Map();
function fetchClip(text) {
  const k = clipKey(text);
  if (inflight.has(k)) return inflight.get(k);
  // 語氣指示要放 instructions，接在文字前面會被念出來
  const style = (S.style || '').trim();
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
      await clipPut(k, clip);
    }
    return clip;
  })();
  inflight.set(k, p); const done = () => inflight.delete(k); p.then(done, done);
  return p;
}
function synth(text) {
  const k = clipKey(text);
  if (audioCache.has(k)) return audioCache.get(k);
  const p = fetchClip(text).then(clip => {
    const { type, buf } = clip;
    if (/mpeg|mp3|wav|ogg|aac|flac/.test(type)) return URL.createObjectURL(new Blob([buf], { type }));
    // 回傳的 Content-Type 像 audio/pcm;rate=24000;channels=1
    return URL.createObjectURL(wavFromPcm(buf, +(/rate=(\d+)/.exec(type) || [])[1] || 24000, +(/channels=(\d+)/.exec(type) || [])[1] || 1));
  });
  audioCache.set(k, p); p.catch(() => audioCache.delete(k));
  return p;
}

// 線上語音一直用同一個 <audio>：iPhone 只要它第一次是在點擊時播過，之後自動接下一段也准播
const AUD = new Audio(); AUD.preload = 'auto';
const SILENT = URL.createObjectURL(wavFromPcm(new ArrayBuffer(2400)));
let audUnlocked = false;
function unlockAudio() {
  if (audUnlocked) return; audUnlocked = true;
  AUD.src = SILENT; AUD.play().then(() => { if (AUD.src === SILENT) AUD.pause(); }).catch(() => { audUnlocked = false; });
}
// 線上語音的語速：播放時加快放慢（保持音高），不用重新產生
function setRate(a) { a.defaultPlaybackRate = a.playbackRate = S.orate || 1; a.preservesPitch = a.webkitPreservesPitch = true; }

/* ---------- ambience ----------
   背景音全部即時合成，不下載音檔。底層很輕：不和諧的低音、遠遠的風、一點老唱片雜訊。
   氣氛靠不定時冒出來的東西：走音的音樂盒、慢慢往下滑的高音、像有人在耳邊吐氣的聲音、遠處的鐘、
   空蕩劇院裡的管風琴、悶雷。這些都送進長殘響，聽起來在遠處、在別的房間。 */
// 背景音預設關，使用者自己打開；打開後所有畫面都播，再按一次才停
let ctx = null, amb = null, ambOn = false;
function ensureCtx() {
  unlockAudio();
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  if (!ctx) { ctx = new AC(); ctx.onstatechange = () => { if (ambOn && ctx.state !== 'running' && ctx.state !== 'closed') setTimeout(keepAmb, 300); }; }
  ctx.resume(); return ctx;
}
const ambLevel = () => .7 * (S.ambVol == null ? .5 : S.ambVol);
// c 可以是真的 AudioContext，也可以是離線算圖用的 OfflineAudioContext（測試用）
// 各關卡的氣氛：layers 是底層各部分的音量倍數（雨、海浪、高音平常是 0），ev 是各種事件的頻率倍數（0＝不出現）
const AMB_PROFILES = {
  default: { layers: {}, ev: { sliding: 1, breath: 1, musicBox: 1, bell: 1, organ: 1, thunder: 1 } },
  // 謝幕：空蕩的劇院，管風琴、走音的音樂盒、稀落的掌聲
  theatre: { layers: { crackle: 1.3 }, ev: { organ: 1.6, musicBox: 1.4, applause: 1, sliding: 1, breath: .8, bell: .5, thunder: .3 } },
  // 最後的王者：宅邸裡的派對，遠處走調的華爾茲、玻璃杯
  party: { layers: { crackle: 1.2 }, ev: { waltz: 1.5, glass: 1.2, musicBox: .5, breath: .7, sliding: .6, bell: .3, organ: .2 } },
  // 往事回聲：歷史協會的老宅，地板吱嘎、座鐘滴答
  mansion: { layers: { wind: .8 }, ev: { creak: 1.2, tick: 1, breath: .8, sliding: .8, bell: .6, musicBox: .4, thunder: .4, organ: .2 } },
  // 邪穢誓約：瘋人院，鐵門、耳邊的吐氣、滴水
  asylum: { layers: { wind: .5, crackle: .6 }, ev: { door: 1.2, breath: 1.8, drip: .8, sliding: .8, musicBox: .3, bell: .3 } },
  // 真相幻影：雨中的巴黎，教堂的鐘
  paris: { layers: { rain: 1, wind: .8 }, ev: { bell: 1.6, thunder: .8, sliding: .6, breath: .5, musicBox: .3, organ: .3 } },
  // 蒼白面具：地下墓穴，殘響很重、滴水、碎石，幾乎沒有音樂
  catacombs: { layers: { wind: .3, crackle: .4, reverb: 1.4 }, ev: { drip: 1.6, rubble: 1, breath: 1, sliding: .5, bell: .2 } },
  // 黑星升起：海邊的修道院，海浪、強風、雷
  abbey: { layers: { waves: 1, wind: 1.8 }, ev: { thunder: 1.8, bell: .8, organ: .6, sliding: .6, breath: .4, musicBox: .2 } },
  // 卡城幽影：卡爾克薩，不屬於這世界的高音
  carcosa: { layers: { whine: 1, drone: 1.2 }, ev: { sliding: 1.8, breath: .8, musicBox: .6, organ: .5, bell: .4, thunder: .3 } }
};
const AMB_OF = { curtain_call: 'theatre', the_last_king: 'party', echoes_of_the_past: 'mansion', the_unspeakable_oath: 'asylum', a_phantom_of_truth: 'paris', the_pallid_mask: 'catacombs', black_stars_rise: 'abbey', dim_carcosa: 'carcosa' };
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
  conv.buffer = ir; const wet = gain(1.6, master); conv.connect(wet);
  // 遠處的聲音都接到這裡：大部分進殘響，留一點原音才聽得出是什麼
  const far = gain(1, conv); far.connect(gain(.4, master));
  // 不定時事件都經過這三個總閘（遠處、殘響、貼近），結局時一起收掉
  const evFar = gain(1, far), evConv = gain(1, conv), evNear = gain(1, master);

  // ---- 底層（都很輕） ----
  // 低音：A 和高它小二度的音擠在一起產生緩慢的拍頻。手機喇叭發不出 200Hz 以下，所以疊高一個八度、帶泛音的那一組
  // 毀滅逼近時整組往下沉、拍頻變快（mood 的 doom）
  const droneGain = gain(1, master), low = filter('lowpass', 520, 0, droneGain), drones = [], lfos = [];
  [[55, 'sine', .07, .05], [58.27, 'sine', .045, .07], [110, 'sawtooth', .045, .09], [116.54, 'sawtooth', .03, .06], [164.81, 'triangle', .04, .11]].forEach(([f, type, level, lfo]) => {
    const g = gain(level, low); drones.push([osc(type, f, g), f]); lfos.push([osc('sine', lfo, gain(level * .7, g.gain)), lfo]);
  });
  // 風：帶通雜訊，中心頻率和音量各自慢慢起伏
  const windBus = gain(1, master), windGain = gain(.06, windBus), wind = filter('bandpass', 420, 1.4, windGain);
  loop(noise(3), wind);
  osc('sine', .07, gain(200, wind.frequency)); osc('sine', .031, gain(110, wind.frequency));
  osc('sine', .05, gain(.035, windGain.gain)); osc('sine', .013, gain(.02, windGain.gain));
  // 老唱片：稀疏的爆音
  const crackle = c.createBuffer(1, c.sampleRate * 8, c.sampleRate), cd = crackle.getChannelData(0);
  for (let i = 0; i < 40; i++) { const at = Math.floor(Math.random() * (cd.length - 40)), amp = rnd(.2, 1); for (let k = 0; k < 24; k++) cd[at + k] += (Math.random() * 2 - 1) * amp * (1 - k / 24); }
  const crackleBus = gain(1, master); loop(crackle, filter('bandpass', 2600, .8, gain(.05, crackleBus)));
  // 只有某些關卡才開的底層（平常音量是 0）：雨、海浪、卡爾克薩不屬於這世界的高音
  const rainBus = gain(0, master), rainHi = filter('highpass', 1400, 0, filter('lowpass', 7000, 0, gain(.05, rainBus)));
  loop(noise(4), rainHi); osc('sine', .21, gain(.012, rainBus.gain));
  const waveBus = gain(0, master), waveAmp = gain(.05, waveBus), waveLp = filter('lowpass', 700, 0, waveAmp);
  loop(noise(5), waveLp); osc('sine', .085, gain(.045, waveAmp.gain)); osc('sine', .085, gain(260, waveLp.frequency));
  const whineBus = gain(0, far);
  [[1318.5, .5], [1396.9, .35], [1975.5, .18]].forEach(([f, v]) => { const o = osc('sine', f, gain(.012 * v, whineBus)); osc('sine', rnd(.05, .12), gain(f * .006, o.frequency)); });
  const layers = { drone: droneGain, wind: windBus, crackle: crackleBus, rain: rainBus, waves: waveBus, whine: whineBus, reverb: wet };

  // ---- 不定時的事件 ----
  const env = (g, t, peak, attack, hold, release) => {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold); g.gain.linearRampToValueAtTime(0, t + attack + hold + release);
  };
  const tone = (type, freq, t, len, to) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.connect(to); o.start(t); o.stop(t + len); return o; };
  // 敲一下就慢慢消失的聲音（音樂盒、鐘、玻璃杯共用）
  const struck = (freq, t, peak, decay, to) => { const g = c.createGain(); g.connect(to); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + decay); tone('sine', freq, t, decay + .1, g); };
  const burst = (t, len, freq, q, peak, to, type = 'bandpass') => {
    const g = c.createGain(); g.connect(to); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + Math.min(.01, len / 4)); g.gain.exponentialRampToValueAtTime(.0001, t + len);
    const n = c.createBufferSource(); n.buffer = noise(Math.max(.1, len + .05)); n.connect(filter(type, freq, q, g)); n.start(t); n.stop(t + len + .05);
  };
  // 走音的音樂盒：幾個音，節奏不穩，每個音都偏掉一點，最後常常停在半路
  const BOX = [587.33, 698.46, 783.99, 830.61, 932.33, 1108.73, 1174.66];   // D 小調加上降五度
  const musicBox = t => {
    let at = t, i = Math.floor(rnd(0, BOX.length));
    for (let n = Math.floor(rnd(3, 8)); n > 0; n--) {
      const f = BOX[i] * Math.pow(2, rnd(-22, 22) / 1200);
      struck(f, at, .1, rnd(1.8, 3), evFar); struck(f * 3.01, at, .024, .7, evFar);
      i = Math.max(0, Math.min(BOX.length - 1, i + pick([-2, -1, -1, 1, 1, 2])));
      at += pick([.42, .42, .5, .84, 1.3]) * rnd(.92, 1.12);
    }
  };
  // 慢慢往下滑的高音：兩個差一點點的音互相干擾，像玻璃在響，然後整個往下沉
  const HIGH = [466.16, 554.37, 622.25, 739.99, 830.61, 932.33];
  const sliding = t => {
    const g = c.createGain(), f = pick(HIGH), len = rnd(9, 14), drop = rnd(.9, .97); g.connect(evFar);
    env(g, t, .06, rnd(2.5, 4), rnd(1, 3), rnd(4, 6));
    [f, f * rnd(1.005, 1.013), Math.random() < .5 ? f * 1.414 : 0].filter(Boolean).forEach(x => { const o = tone('sine', x, t, len + 2, g); o.frequency.linearRampToValueAtTime(x * drop, t + len); });
  };
  // 吐氣聲：窄頻雜訊，頻率像嘴型一樣滑動，貼得很近（幾乎不加殘響）
  const breath = t => {
    const g = c.createGain(), len = rnd(1.6, 2.8), bp = filter('bandpass', rnd(700, 1100), 7, g); g.connect(evNear); g.connect(gain(.3, evConv));
    env(g, t, rnd(.08, .14), len * .45, 0, len * .55);
    bp.frequency.setValueAtTime(bp.frequency.value, t); bp.frequency.linearRampToValueAtTime(rnd(1300, 2000), t + len * .5); bp.frequency.linearRampToValueAtTime(rnd(500, 800), t + len);
    const n = c.createBufferSource(); n.buffer = noise(3); n.connect(bp); n.start(t); n.stop(t + len + .1);
  };
  // 遠處的鐘：泛音不成整數比，聽起來是金屬、而且有點壞掉
  const bell = t => { const f = pick([98, 110, 123.47]); [[.56, .5], [.92, .7], [1.19, 1], [1.71, .45], [2, .5], [2.74, .28], [3.76, .16]].forEach(([r, a]) => struck(f * r, t, .06 * a, rnd(6, 10) / Math.sqrt(r), evFar)); };
  // 管風琴：減和弦疊三全音，不安定、找不到落腳的地方
  const ORGAN = [[146.83, 174.61, 207.65, 293.66], [130.81, 155.56, 185, 261.63], [164.81, 196, 233.08, 277.18]];
  const organ = t => {
    const g = c.createGain(), hold = rnd(3, 6); g.connect(filter('lowpass', 900, 0, evFar)); env(g, t, .09, 1.8, hold, 5);
    pick(ORGAN).forEach(f => [1, 2, 3, 4].forEach(h => { const part = c.createGain(); part.gain.value = 1 / (h * h); part.connect(g); tone('sine', f * h * rnd(.998, 1.002), t, hold + 7.2, part); }));
  };
  const thunder = t => {
    const g = c.createGain(); g.connect(evNear); g.connect(evConv); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(rnd(.1, .2), t + rnd(.2, .6)); g.gain.exponentialRampToValueAtTime(.001, t + rnd(5, 8));
    const n = c.createBufferSource(); n.buffer = noise(8); n.connect(filter('lowpass', rnd(140, 260), 0, g)); n.start(t); n.stop(t + 8);
  };
  // 以下是依關卡才出現的事件
  // 遠處走調的華爾茲：低音一下、和弦兩下，兩三小節就斷掉（最後的王者的派對）
  const WALTZ = [[146.83, [293.66, 349.23, 440]], [110, [277.18, 329.63, 392]], [130.81, [261.63, 311.13, 392]], [146.83, [293.66, 349.23, 415.3]]];
  const waltz = t => {
    const g = filter('lowpass', 1400, 0, gain(1, evFar)), beat = rnd(.42, .5), off = () => Math.pow(2, rnd(-30, 30) / 1200);
    let at = t;
    for (let bar = Math.floor(rnd(2, 5)), k = Math.floor(rnd(0, WALTZ.length)); bar > 0; bar--, k = (k + 1) % WALTZ.length) {
      const [bass, chord] = WALTZ[k];
      struck(bass * off(), at, .07, 1.2, g); struck(bass * 2 * off(), at, .03, .8, g);
      [1, 2].forEach(b => chord.forEach(f => struck(f * off(), at + b * beat, .022, .5, g)));
      at += beat * 3 * rnd(.97, 1.06);
    }
  };
  // 玻璃杯輕碰
  const glass = t => { for (let n = Math.floor(rnd(1, 4)), at = t; n > 0; n--, at += rnd(.08, .5)) { const f = rnd(2300, 3200); struck(f, at, .035, rnd(.6, 1.1), evFar); struck(f * 2.71, at, .012, .3, evFar); } };
  // 沉重的鐵門在遠處關上（瘋人院）
  const door = t => { burst(t, .35, 260, 1.2, .16, evConv, 'lowpass'); [[61, 1], [133, .6], [207, .45], [341, .25]].forEach(([f, a]) => struck(f * rnd(.97, 1.03), t + .02, .07 * a, rnd(2.5, 4), evConv)); };
  // 滴水：短促、音高往下掉
  const drip = t => { for (let n = Math.floor(rnd(1, 3)), at = t; n > 0; n--, at += rnd(.6, 2.2)) { const g = c.createGain(), f = rnd(1500, 2400); g.connect(evConv); g.connect(gain(.4, evNear)); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.05, at + .004); g.gain.exponentialRampToValueAtTime(.0001, at + .18); const o = tone('sine', f, at, .22, g); o.frequency.exponentialRampToValueAtTime(f * .45, at + .05); } };
  // 空蕩的劇院裡幾聲稀落的掌聲，很快停下來（謝幕）
  const applause = t => { const len = rnd(1.5, 3.5), dens = rnd(6, 14); for (let at = t; at < t + len; at += rnd(.5, 1.5) / dens) burst(at, .03, rnd(1600, 2600), 1.5, rnd(.04, .09) * (1 - (at - t) / len), evFar); };
  // 碎石落下（地下墓穴）
  const rubble = t => { for (let n = Math.floor(rnd(4, 10)), at = t; n > 0; n--, at += rnd(.03, .25)) burst(at, rnd(.05, .2), rnd(300, 1200), .9, rnd(.04, .1), evConv); };
  // 老座鐘滴答，十幾下就停（往事回聲的宅邸）
  const tick = t => { for (let n = Math.floor(rnd(8, 16)), at = t, hi = true; n > 0; n--, at += 1, hi = !hi) burst(at, .025, hi ? 3200 : 2500, 8, .05, evFar); };
  // 木頭地板／樓梯的吱嘎聲
  const creak = t => { const g = c.createGain(), len = rnd(.6, 1.4); g.connect(evConv); g.connect(gain(.5, evNear)); env(g, t, .05, .05, len * .6, len * .4); const bp = filter('bandpass', rnd(500, 900), 12, g); const o = tone('sawtooth', rnd(60, 110), t, len + .1, bp); bp.frequency.setValueAtTime(bp.frequency.value, t); bp.frequency.linearRampToValueAtTime(rnd(900, 1500), t + len); o.frequency.linearRampToValueAtTime(rnd(90, 140), t + len); };
  // 事件：[函式, 最短間隔, 最長間隔]（秒）；各關卡的設定只調整頻率倍數（0＝不出現）
  const EVENTS = { sliding: [sliding, 16, 30], breath: [breath, 22, 45], musicBox: [musicBox, 30, 60], bell: [bell, 50, 100], organ: [organ, 60, 110], thunder: [thunder, 50, 90],
    waltz: [waltz, 45, 80], glass: [glass, 20, 40], door: [door, 35, 70], drip: [drip, 6, 14], applause: [applause, 70, 120], rubble: [rubble, 30, 60], tick: [tick, 40, 70], creak: [creak, 18, 35] };
  let rates = AMB_PROFILES.default.ev, evRate = 1;
  const nextT = {};
  // 在 [t0, t0+dur) 這段時間裡把事件排好；每種事件記住下一次的時間，換氣氛時頻率接著變
  function schedule(t0, dur) {
    const count = {};
    Object.entries(EVENTS).forEach(([key, [fn, min, max]]) => {
      const r = (rates[key] || 0) * evRate; count[key] = 0;
      if (!r) { nextT[key] = Infinity; return; }
      if (!(nextT[key] < Infinity)) nextT[key] = t0 + rnd(min * .15, min * .8) / r;
      for (; nextT[key] < t0 + dur; nextT[key] += rnd(min, max) / r) { if (nextT[key] >= t0) { fn(nextT[key]); count[key]++; } }
    });
    return count;
  }
  // 換氣氛：w = { prof: 關卡氣氛, moment: 'menu'|'intro'|'play'|'res', doom: 0–1 }
  function mood(w) {
    const p = AMB_PROFILES[w.prof] || AMB_PROFILES.default, now = c.currentTime, res = w.moment === 'res', intro = w.moment === 'intro';
    rates = p.ev; evRate = intro ? .35 : 1;
    const tc = res ? 3 : 2;
    Object.entries(layers).forEach(([k, g]) => {
      const base = k === 'reverb' ? 1.6 : 1, want = (p.layers[k] == null ? (['rain', 'waves', 'whine'].includes(k) ? 0 : 1) : p.layers[k]) * (res ? .4 : intro ? .8 : 1);
      g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(base * (k === 'reverb' ? (p.layers.reverb || 1) : want), now, tc);
    });
    [evFar, evConv, evNear].forEach(g => { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(res ? 0 : 1, now, res ? .7 : 1.5); });
    const d = res ? .5 : Math.max(0, Math.min(1, w.doom || 0));
    drones.forEach(([o, f]) => o.frequency.setTargetAtTime(f * (1 - .06 * d), now, 4));
    lfos.forEach(([o, f]) => o.frequency.setTargetAtTime(f * (1 + 1.5 * d), now, 4));
  }
  return { master, nodes, schedule, mood };
}
function startAmb() {
  if (amb) return true;
  const c = ensureCtx(); if (!c) return false;
  const a = buildAmb(c, c.destination);
  a.master.gain.linearRampToValueAtTime(ambLevel(), c.currentTime + 3);
  a.mood(ambWant);
  // 事件一次排 10 秒（換氣氛時很快跟上），快排完時再排下一段。切到背景時計時器會被放慢，回來時已經過了就從現在重排
  let until = c.currentTime + .5;
  const more = () => { a.schedule(until, 10); until += 10; };
  a.kick = () => { if (until < c.currentTime) until = c.currentTime + .5; if (c.currentTime > until - 4) more(); };
  more(); a.timer = setInterval(a.kick, 2000);
  amb = a; return true;
}
// 背景音跟著關卡和劇情走：遊戲畫面依關卡換氣氛、開場比較空、毀滅越近低音越沉、結局只剩低音慢慢淡出。
// 設定裡關掉「隨關卡與劇情變化」就一直是原本那一套
let ambWant = { prof: 'default', moment: 'menu', doom: 0 };
function ambMood(sc, moment, doom) {
  const on = S.ambScene !== false;
  ambWant = on ? { prof: (sc && AMB_OF[sc.id.split('.').pop()]) || 'default', moment, doom: Math.min(1, doom || 0) } : { prof: 'default', moment: 'play', doom: 0 };
  if (amb) amb.mood(ambWant);
}
// 被系統暫停（鎖螢幕、切 App、來電、語音播放）後叫回來
function keepAmb() {
  if (!ambOn) return;
  if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
  if (!amb) startAmb(); else amb.kick();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAmb(); });
document.addEventListener('pointerdown', keepAmb, true);
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

/* ---------- 開局前先準備這關的線上語音 ----------
   把這關所有會念到的段落（開場的每條分支、每張卡正背面、結局、地點卡）先產生並存起來，玩的時候就不用等。
   段落文字要和播放時完全一樣（同一個 speechOf），存檔的鍵才對得上。 */
const PREP = { sc: null, total: 0, done: 0, fail: 0, stop: false, running: false };
function prepTexts(sc) {
  const items = [];
  const walk = ns => ns.forEach(n => { if (n.k === 'ask') n.opts.forEach(o => walk(o.nodes)); else if (n.k === 'read') items.push(...chunks(n.text).map(text => ({ text }))); });
  walk(sc.flow); Object.values(sc.resolutions).forEach(r => walk(r.flow));
  sc.decks.forEach(d => d.cards.forEach(c => {
    items.push(...cardItems(c, d.label), ...cardItems(c, d.label, true));
    (c.cases || []).forEach((x, i) => items.push(...backItems(c, d.label, i)));
  }));
  sc.locs.forEach(l => items.push(...locItems(l, true)));
  return [...new Set(items.filter(x => x.text).map(speechOf))];
}
async function prepVoices() {
  const sc = CUR, texts = prepTexts(sc);
  $('prepStatus').textContent = '計算中…';
  const todo = [];
  for (const t of texts) if (!(await clipGet(clipKey(t)))) todo.push(t);
  if (!todo.length) { $('prepStatus').textContent = `這關 ${texts.length} 段語音都準備好了。`; return; }
  $('prepStatus').textContent = '';
  const chars = todo.reduce((n, t) => n + t.length, 0);
  const mb = /^google\//.test(S.model) ? `，約佔 ${Math.ceil(chars * 0.012)} MB` : '';
  confirmThen(`這關共 ${texts.length} 段，其中 ${texts.length - todo.length} 段已經存過。要產生剩下的 ${todo.length} 段嗎？（約 ${chars} 字${mb}。花費以 OpenRouter 帳單為準）`, '', () => runPrep(sc, todo), '開始準備');
}
async function runPrep(sc, todo) {
  Object.assign(PREP, { sc: sc.id, total: todo.length, done: 0, fail: 0, stop: false, running: true }); renderPrep();
  let i = 0;
  // 一次兩個請求；失敗的再試一次，還是不行就跳過，玩到時再產生
  const worker = async () => {
    while (!PREP.stop && i < todo.length) {
      const t = todo[i++];
      try { await fetchClip(t); } catch (e) { try { await fetchClip(t); } catch (e2) { PREP.fail++; } }
      PREP.done++; renderPrep();
    }
  };
  await Promise.all([worker(), worker()]);
  PREP.running = false; renderPrep();
}
function renderPrep() {
  if (!CUR) return;
  const on = S.engine === 'openrouter' && !!S.key && !CUR.mute;
  $('prepBox').hidden = !on; if (!on) return;
  const mine = PREP.sc === CUR.id;
  $('prepBtn').textContent = mine && PREP.running ? (PREP.stop ? '正在停止…' : '取消') : '先準備這關的語音';
  $('prepStatus').textContent = !mine ? '' : PREP.running ? `準備中 ${PREP.done}／${PREP.total}，可以先開始玩`
    : PREP.stop ? `已取消，完成 ${PREP.done - PREP.fail} 段。`
    : PREP.fail ? `完成，有 ${PREP.fail} 段沒準備好，玩到時再產生。` : `這關的語音都準備好了（${PREP.total} 段）。`;
}
