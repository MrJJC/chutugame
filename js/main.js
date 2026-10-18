'use strict';
/* ---------- top bar + tab bar ---------- */
$('autoBtn').onclick = () => { auto = !auto; $('autoBtn').setAttribute('aria-pressed', auto); };
$('menuBtn').onclick = () => { $('ambVol').value = S.ambVol == null ? .5 : S.ambVol; $('playMenu').showModal(); };
$('ambVol').oninput = () => setAmbVol(+$('ambVol').value);
$('prepBtn').onclick = () => { if (PREP.running && PREP.sc === CUR.id) { PREP.stop = true; renderPrep(); } else prepVoices(); };
$('playMenuClose').onclick = () => $('playMenu').close();
$('playMenu').addEventListener('click', e => { if (e.target === $('playMenu')) $('playMenu').close(); });
// 背景音每次打開網頁都是關的；按喇叭打開後所有畫面都播，再按一次才停（首頁和遊戲畫面各有一個開關）
function setAmb(on) {
  ambOn = on;
  if (on) { ensureCtx(); startAmb(); } else stopAmb();
  document.querySelectorAll('.amb-toggle').forEach(b => b.setAttribute('aria-pressed', on));
}
document.querySelectorAll('.amb-toggle').forEach(b => { b.onclick = () => setAmb(!ambOn); });
// 點語音圖示是播放／暫停；點文字其他地方還是「跳過這一段」，所以不讓點擊往外傳
$('vico').addEventListener('click', e => { e.stopPropagation(); togglePause(); });
$('vico').addEventListener('keydown', e => e.stopPropagation());
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
const CACHE_VER = 3;
const cacheSig = () => CACHE_VER + '|' + JSON.stringify(REAL);
function enter() {
  $('loadMsg').hidden = true; $('loadBtns').hidden = true; $('skeleton').hidden = true;
  applyOverrides();
  CUR = findSc(store.get('asr.last', '')) || allScenarios()[0]; homeCycle = CUR.cycle.id;
  toHome();
  takeTransfer();
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
