'use strict';
/* ---------- screens ---------- */
let current = 'title', returnTo = 'title';
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); current = id; window.scrollTo(0, 0); }
function where(a, b) { $('whereSmall').textContent = a; $('whereBig').textContent = b; }
let toastT;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 4500); }
