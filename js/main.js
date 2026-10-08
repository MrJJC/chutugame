'use strict';
/* ---------- top bar + tab bar ---------- */
$('autoBtn').onclick = () => { auto = !auto; $('autoBtn').setAttribute('aria-pressed', auto); };
$('menuBtn').onclick = () => { $('ambVol').value = S.ambVol == null ? .5 : S.ambVol; $('playMenu').showModal(); };
$('ambVol').oninput = () => setAmbVol(+$('ambVol').value);
$('playMenuClose').onclick = () => $('playMenu').close();
$('playMenu').addEventListener('click', e => { if (e.target === $('playMenu')) $('playMenu').close(); });
// 背景音預設開；開關的狀態會記住
const ambWanted = () => S.ambOn !== false;
$('soundBtn').setAttribute('aria-pressed', ambWanted());
$('soundBtn').onclick = () => {
  S.ambOn = !ambWanted(); store.set('asr.settings', S); $('soundBtn').setAttribute('aria-pressed', S.ambOn);
  if (S.ambOn) startAmb(); else stopAmb();
};
$('homeBtn').onclick = () => { if (!CYCLES.length) return; toHome(); };
$('tabHome').onclick = () => { if (CYCLES.length) toHome(); else show('home'); };
$('textBtn').onclick = () => { if (!CYCLES.length) { toast('劇本還沒讀取完成'); return; } openLibrary(false); };
$('glossBtn').onclick = () => { if (!CYCLES.length) { toast('劇本還沒讀取完成'); return; } openGlossary(); };
$('gearBtn').onclick = () => { $('playMenu').close(); openSettings(); };
$('tabSet').onclick = openSettings;
// 點對話框外面的暗處＝取消（必須選一項的分支對話框除外）
$('confirm').addEventListener('click', e => { if (e.target === $('confirm')) $('cNo').click(); });
$('resPick').addEventListener('click', e => { if (e.target === $('resPick')) $('resPick').close(); });

/* ---------- 啟動 ----------
   劇本整理好後存一份在這台裝置：下次打開直接用存的那份（馬上看得到關卡），同時在背景抓新的，下次生效。
   REAL 或讀取程式改過就把 CACHE_VER 加一，舊的存檔會作廢重抓。 */
const CACHE_VER = 1;
const cacheSig = () => CACHE_VER + '|' + JSON.stringify(REAL);
function enter() {
  $('loadMsg').hidden = true; $('loadBtns').hidden = true; $('skeleton').hidden = true;
  applyOverrides();
  CUR = findSc(store.get('asr.last', '')) || allScenarios()[0]; homeCycle = CUR.cycle.id;
  toHome();
}
async function boot() {
  where('詭鎮劇本朗讀器', '選擇關卡'); show('home'); renderHome();
  const sig = cacheSig(), cached = store.get('asr.cache', null);
  if (cached && cached.sig === sig && cached.cycles) {
    CYCLES = normalize(cached.cycles); enter();
    loadReal().then(cycles => store.set('asr.cache', { sig, at: Date.now(), cycles })).catch(() => {});
    return;
  }
  $('loadBtns').hidden = true; $('loadMsg').hidden = true; $('skeleton').hidden = false;
  LOADING.done = 0; LOADING.total = 0;
  LOADING.on = () => { $('cycleProg').textContent = `正在讀取劇本 ${LOADING.done}／${LOADING.total}`; $('cycleBar').style.width = (LOADING.total ? LOADING.done / LOADING.total * 100 : 0) + '%'; };
  try {
    const cycles = await loadReal();
    store.set('asr.cache', { sig, at: Date.now(), cycles });   // 要在 normalize 之前存：normalize 會加上互相參照，存不了
    CYCLES = normalize(cycles);
  } catch (e) {
    $('skeleton').hidden = true; $('cycleProg').textContent = '讀取失敗'; $('cycleBar').style.width = '0';
    $('loadMsg').hidden = false; $('loadMsg').textContent = `讀取失敗：${e.message}。請確認是用瀏覽器直接打開 GitHub Pages 網址（不是預覽視窗），或換個網路再試。`;
    $('loadBtns').hidden = false; return;
  } finally { LOADING.on = null; }
  enter();
}
$('retryLoad').onclick = boot;
$('useSample').onclick = () => { CYCLES = SAMPLE_CYCLES; toast('目前是示意劇本'); enter(); };
boot();
