'use strict';
/* ---------- top bar ---------- */
$('autoBtn').onclick = () => { auto = !auto; $('autoBtn').setAttribute('aria-pressed', auto); $('autoBtn').textContent = auto ? '自動' : '手動'; };
$('soundBtn').onclick = () => { if (amb) { stopAmb(); $('soundBtn').setAttribute('aria-pressed', 'false'); } else if (startAmb()) $('soundBtn').setAttribute('aria-pressed', 'true'); };
$('homeBtn').onclick = () => { if (!CYCLES.length) return; toHome(); };
$('textBtn').onclick = () => { if (!CYCLES.length) { toast('劇本還沒讀取完成'); return; } openLibrary(false); };
$('glossBtn').onclick = () => { if (!CYCLES.length) { toast('劇本還沒讀取完成'); return; } openGlossary(); };
$('gearBtn').onclick = openSettings;

async function boot() {
  where('詭鎮劇本朗讀器', '讀取劇本中'); show('home');
  $('loadMsg').hidden = false; $('loadMsg').textContent = '正在從 GitHub 讀取卡爾克薩之路的劇本…'; $('loadBtns').hidden = true;
  try {
    CYCLES = normalize(await loadReal());
    $('loadMsg').hidden = true;
  } catch (e) {
    $('loadMsg').textContent = `讀取失敗：${e.message}。請確認是用瀏覽器直接打開 GitHub Pages 網址（不是預覽視窗），或換個網路再試。`;
    $('loadBtns').hidden = false; return;
  }
  CUR = findSc(store.get('asr.last', '')) || allScenarios()[0]; homeCycle = CUR.cycle.id;
  toHome();
}
$('retryLoad').onclick = boot;
$('useSample').onclick = () => { CYCLES = SAMPLE_CYCLES; CUR = allScenarios()[0]; homeCycle = CUR.cycle.id; $('loadMsg').hidden = true; $('loadBtns').hidden = true; toast('目前是示意劇本'); toHome(); };
boot();
