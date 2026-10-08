# 詭鎮劇本朗讀器（Arkham Script Reader）交接文件

給接手開發的 AI 工具或開發者。目前成果是同一資料夾裡的靜態網頁：`index.html` ＋ `css/` ＋ `js/`（2026-10-08 由單一檔案拆出，程式內容未改；各檔分工與載入順序見 `README.md`）。

## 1. 專案目標

搭配實體《詭鎮奇談：卡牌版》繁中版遊玩的網頁小工具，手機或平板放在桌邊使用。

- 對象循環：**卡爾克薩之路**（台灣繁中版稱「第二循環」；英文社群代碼 `ptc`）。之後可加其他循環。
- 核心功能：選關 → 朗讀開場 → 遊戲中推進場景／密謀卡並朗讀卡背 → 結局朗讀 → 記錄戰役日誌。
- 不做：牌組管理、毀滅／線索數值追蹤（桌上用實體標記）。
- 部署：GitHub Pages，允許只能連網使用。同好小工具，不需要伺服器。

## 2. 現況（功能已完成）

| 功能 | 狀態 |
| --- | --- |
| 讀取真實資料：序章、冒險 I《謝幕》 | 完成，打開時從 GitHub 讀取（失敗改 jsDelivr） |
| 選擇關卡畫面（依循環分頁、顯示進行中／已完成） | 完成 |
| 朗讀：整段顯示、念到哪句亮哪句（預設）；另有整段顯示、逐字打字 | 完成 |
| 語音：Gemini（OpenRouter）＋裝置語音備援（Apple 美佳優先） | 完成；Gemini 未實測 |
| 遊戲畫面：密謀／場景各一疊、推進前確認、回上一張 | 完成 |
| 分支場景卡（同階段不同正面）→「翻到的是哪一張」 | 完成 |
| 同正面不同背面（謝幕的場景 2 有三版）→ 選背面標題 | 完成 |
| 卡背指向多個結局 → 讓玩家選結局 | 完成 |
| 劇情型關卡（序章）＋條件段落（蘿拉·海耶斯） | 完成 |
| 文本庫：所有關卡全文、篩選、搜尋、點段落從那裡開始念 | 完成 |
| 名詞替換：文字＋朗讀／只改讀音、出現次數、常見名字建議、匯出匯入 | 完成 |
| 存檔：多存檔、自動存進度與結局、戰役日誌、備份代碼 | 完成（localStorage） |
| 視覺：暗褐底、Noto Sans TC、置中文字、靜態暗角 | 完成 |
| 示意劇本（讀取失敗時可用來試介面，原創文字） | 完成 |

## 3. 資料來源

不內嵌任何遊戲原文，執行時讀取社群資料。

| 資料 | URL 範例 |
| --- | --- |
| 劇本結構（英文 JSON） | `https://raw.githubusercontent.com/zzorba/arkham-cards-data/master/campaigns/ptc/curtain_call.json` |
| 劇本翻譯（繁中 .po） | `https://raw.githubusercontent.com/zzorba/arkham-cards-data/master/i18n/zh/campaigns/ptc/curtain_call.po` |
| 場景／密謀卡（英文） | `https://raw.githubusercontent.com/Kamalisk/arkhamdb-json-data/master/pack/ptc/ptc_encounter.json` |
| 場景／密謀卡（繁中） | `https://raw.githubusercontent.com/Kamalisk/arkhamdb-json-data/master/translations/zh/pack/ptc/ptc_encounter.json` |

注意：
- 繁中在 `i18n/zh/`（`zh-cn` 是簡體）。社群繁中是簡中轉換而來；人名卡名與台灣官方繁中版一致，劇情文字無法線上驗證，靠名詞替換修正。
- `.po` 是「英文原句 → 繁中」對照，結構要從英文 JSON 取，再用原句查翻譯。
- 卡背英文 `back_text` 中的 `→R1` 用來偵測進入哪個結局。
- 冒險 II–VIII 的卡在神話包：`eotp`、`tuo`、`apot`、`tpm`、`bsr`、`dca`。

## 4. 新增關卡的方式

`js/config.js` 裡的 `REAL` 設定：

```js
const REAL = [
  { id: 'ptc', name: '卡爾克薩之路', folder: 'ptc', extraPo: ['campaign', 'core'], scenarios: [
    { id: 'prologue', code: '序', title: '序章', kind: 'story', optional: [...] },
    { id: 'curtain_call', code: 'I', pack: 'ptc' }
    // { id: 'the_last_king', code: 'II', pack: 'eotp' }, ...
  ] }
];
```

讀取程式 `loadReal()`（`js/loader.js`）會把每關轉成統一格式，所有畫面只讀這個格式：

```
{ id, code, title, kind: 'play'|'story', intro, setup[], extra[],
  agenda:[卡], act:[卡], resolutions:{ R1:{text, log[]}, no_resolution:{...} }, names[] }
卡：{ code, stage, name, backName, flavor, backFlavor, backText, need, res:[] }
```

## 5. 待辦（依優先順序）

1. ~~拆成正式專案結構（設定、讀取、播放、畫面分檔），加 README，部署 GitHub Pages。~~ 完成（2026-10-08）：repo <https://github.com/MrJJC/chutugame>，網站 <https://mrjjc.github.io/chutugame/>，push 到 `main` 即自動更新。
2. 實測 Gemini 語音：台灣口音、語氣指示會不會被念出、`response_format` 是否回 mp3（已寫 PCM→WAV 備援，假設 24kHz）。
3. 補完冒險 II–VIII、幕間故事 I（癲狂獎勵／現實之影二選一）、幕間故事 II、尾聲。
4. 第 VII 關「黑星升起」：兩疊密謀同時進行，遊戲畫面需支援多疊。
5. 戰役日誌的「懷疑」「信念」等累計數值：先做手動加減。
6. 逐句覆寫校對層（目前只有名詞替換）。
7. 待使用者確認：替換表是否依循環分開、卡背效果要不要朗讀、是否需要雲端存檔。

## 6. 限制與原則

- 不要把遊戲劇情原文寫進程式或 repo；一律執行時讀取。
- 金鑰只存在使用者瀏覽器（localStorage），不寫進程式。
- 存檔、替換表、設定的 localStorage key：`asr.saves`、`asr.glossary`、`asr.settings`、`asr.last`。
- 在預覽視窗或部分公司網路中開啟會因擋外網出現「Failed to fetch」，需用瀏覽器直接開 GitHub Pages 網址。

## 7. 相關文件

- 規劃書 v2（Claude Docs）：https://claude.ai/code/artifact/0a30a4a6-f13b-4114-a896-d60f25858d78
- 介面試玩 demo（示意劇本）：https://claude.ai/artifact/EtY3mEWDdmrFPfZTDsJF5a
