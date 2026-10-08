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
function synth(text) {
  // Gemini 的 TTS 只支援 pcm 輸出；語氣指示要放 instructions，接在文字前面會被念出來
  const style = (S.style || '').trim();
  const k = `${S.model}|${S.gvoice}|${style}|${text}`;
  if (audioCache.has(k)) return audioCache.get(k);
  const p = (async () => {
    const r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST', headers: { 'Authorization': `Bearer ${S.key}`, 'Content-Type': 'application/json', 'X-Title': 'Arkham Script Reader' },
      body: JSON.stringify({ model: S.model, input: text, voice: S.gvoice, response_format: 'pcm', ...(style ? { instructions: style } : {}) })
    });
    if (!r.ok) { let m = `HTTP ${r.status}`; try { const j = await r.json(); m = (j.error && (j.error.message || j.error)) || m; } catch (e) {} throw new Error(m); }
    const type = (r.headers.get('content-type') || '').toLowerCase(), buf = await r.arrayBuffer();
    if (/mpeg|mp3|wav|ogg|aac|flac/.test(type)) return URL.createObjectURL(new Blob([buf], { type }));
    // 回傳的 Content-Type 像 audio/pcm;rate=24000;channels=1
    return URL.createObjectURL(wavFromPcm(buf, +(/rate=(\d+)/.exec(type) || [])[1] || 24000, +(/channels=(\d+)/.exec(type) || [])[1] || 1));
  })();
  audioCache.set(k, p); p.catch(() => audioCache.delete(k));
  return p;
}

/* ---------- ambience ---------- */
let ctx = null, amb = null;
function ensureCtx() { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; if (!ctx) ctx = new AC(); ctx.resume(); return ctx; }
function startAmb() {
  const c = ensureCtx(); if (!c) return false;
  const master = c.createGain(); master.gain.value = 0; master.connect(c.destination);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360; lp.connect(master);
  const nodes = [];
  [[55, 'triangle', .16, .05], [77.8, 'triangle', .07, .07], [110.6, 'sine', .035, .11]].forEach(([f, t, g0, lf]) => {
    const o = c.createOscillator(); o.type = t; o.frequency.value = f;
    const g = c.createGain(); g.gain.value = g0;
    const l = c.createOscillator(); l.frequency.value = lf; const lg = c.createGain(); lg.gain.value = g0 * .6;
    l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(lp); o.start(); l.start(); nodes.push(o, l);
  });
  const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const rain = c.createBufferSource(); rain.buffer = buf; rain.loop = true;
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
  const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 2000;
  const rg = c.createGain(); rg.gain.value = .05;
  rain.connect(hp); hp.connect(rl); rl.connect(rg); rg.connect(master); rain.start(); nodes.push(rain);
  master.gain.linearRampToValueAtTime(.5, c.currentTime + 3);
  amb = { master, nodes }; return true;
}
function stopAmb() {
  if (!amb || !ctx) return; const { master, nodes } = amb; amb = null;
  master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
  setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); master.disconnect(); }, 1600);
}
