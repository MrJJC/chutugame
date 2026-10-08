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
| 讀取真實資料：卡爾克薩之路完整循環（序章、I–VIII、幕間 I／II、尾聲） | 完成，打開時從 GitHub 讀取（失敗改 jsDelivr） |
| 戰役指南流程：朗讀、設置／結算指示、玩家選擇、依冒險日誌分支 | 完成（不追蹤日誌：有劇情的分支問玩家，只有指示的分支全列並標條件） |
| 多疊牌（黑星升起雙密謀＋密謀換成場景）、開局卡版本選擇、背面是另一張卡 | 完成 |
| 選擇關卡畫面（依循環分頁、顯示進行中／已完成） | 完成 |
| 朗讀：整段顯示、念到哪句亮哪句（預設）；另有整段顯示、逐字打字 | 完成 |
| 語音：Gemini（OpenRouter）＋裝置語音備援（Apple 美佳優先） | 完成；2026-10-08 用真金鑰打 API 驗證請求格式可用（pcm、instructions），瀏覽器內實際聽感未驗 |
| 線上語音整段一次產生（不是一句一句）：Gemini 這類生成式語音每次請求的音高會飄（實測同一句 92 Hz／119 Hz），分句要會像換人；亮句改用播放進度估算 | 完成 |
| 遊戲畫面：密謀／場景各一疊、推進前確認、回上一張 | 完成 |
| 分支場景卡（同階段不同正面）→「翻到的是哪一張」 | 完成 |
| 同正面不同背面（謝幕的場景 2 有三版）→ 選背面標題 | 完成 |
| 卡背指向多個結局 → 讓玩家選結局 | 完成 |
| 劇情型關卡（序章）＋條件段落（蘿拉·海耶斯） | 完成 |
| 文本庫：所有關卡全文、篩選、搜尋、點段落從那裡開始念 | 完成 |
| 名詞替換：文字＋朗讀／只改讀音、出現次數、常見名字建議、匯出匯入 | 完成 |
| 存檔：多存檔、自動存進度與結局、戰役日誌、備份代碼 | 完成（localStorage） |
| 語音存檔：線上語音的音訊存 IndexedDB（`asr-voice`／`clips`），鍵＝模型｜聲音｜語氣｜文字 | 完成；非 Google 模型要 mp3、Gemini 只能 pcm（24kHz 約 2.9 MB／分鐘，玩完整輪約 300 MB） |
| 線上語音可換模型：用下拉選單選實測過的組合（選了就套用並試聽），選「自訂」才出現自由輸入欄（`TTS_PRESETS` 在 `js/panels.js`） | 完成；2026-10-08 實測可用：gemini-3.8-flash-tts、gemini-3.8-flash-lite-tts、mai-voice-2.1-flash、fish-audio/s2.1-pro(-free)、qwen-audio-3.0-tts-flash、kokoro-82m |
| 視覺與操作（2026-10-08 重做）：首頁是節目單、朗讀是暗場舞台、密謀／場景是米色實體卡（推進時翻面）；主色為黃；標題 Noto Serif TC、內文 Noto Sans TC | 完成 |
| 導覽：選單層用底部分頁（關卡／文本庫／名詞替換／設定），遊玩層只留返回、自動、背景音、設定；對話框從底部滑上 | 完成 |
| 劇本快取：整理好的劇本存 localStorage `asr.cache`，下次打開直接用、背景更新 | 完成；改了 `REAL` 會自動作廢，改了讀取程式要把 `js/main.js` 的 `CACHE_VER` 加一 |
| 示意劇本（讀取失敗時可用來試介面，原創文字） | 完成 |
| 背景音：即時合成。底層很輕（不和諧低音、風、唱片雜訊），氣氛靠不定時事件（走音音樂盒、下滑高音、吐氣聲、遠處的鐘、管風琴、悶雷），遊玩選單有音量滑桿（`S.ambVol`） | 完成；`buildAmb()` 在 `js/audio.js`，可接 OfflineAudioContext 離線算圖量音量 |
| 畫面背景：卡爾克薩夜景（雙日、黑星、月亮後的高塔、哈利湖），inline SVG＋兩層霧＋顆粒，上面壓一層暗幕保持文字可讀 | 完成；SVG 由腳本產生後貼進 `index.html` 的 `.backdrop` |

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

`js/config.js` 裡的 `REAL` 加一行（特殊欄位 `sets`／`decks`／`swap`／`mute` 的說明在該檔註解）：

```js
{ id: 'the_last_king', code: 'II', pack: 'ptc' }        // 一般冒險
{ id: 'lost_soul', code: '幕II', kind: 'story' }         // 只有朗讀的關卡
```

讀取程式 `loadReal()`（`js/loader.js`）會把每關轉成統一格式，所有畫面只讀這個格式：

```
{ id, code, title, kind: 'play'|'story', tag, mute,
  flow: [節點],                       // 開場＋設置
  decks: [{ kind:'agenda'|'act', label, cards:[卡] }],
  swap: { 卡號: 換上的卡號 },
  resolutions: { R1: { flow:[節點] }, no_resolution: {...} }, names[] }
節點：{ k:'read', text } 朗讀｜{ k:'note', text } 指示｜{ k:'ask', q, opts:[{label, nodes}] } 提問｜{ k:'goto', res } 轉到別的結局
卡：{ code, stage, name, backName, flavor, backFlavor, backText, need, res:[] }
```

節點由 `guideWalker()` 從劇本檔的步驟圖走出來；`runFlow()`（`js/game.js`）負責執行。存檔的進度格式是 `{ scenarioId, phase, pos:[各疊位置], history }`（舊版 `ag`／`ac` 會自動轉換）。

已知的資料特性：
- 翻譯檔的原句與劇本檔偶有 Unicode 寫法差異（é 等），查表前一律 NFC 正規化。
- 通用句子（經驗值結算、「不進行變動」等）卡爾克薩的翻譯檔沒有，從 `commonPo` 列的別循環翻譯檔補。
- 仍無翻譯的兩句設置指示寫在 `FALLBACK_TR`（自行翻譯，非官方用字）。
- App 內部記帳用的隱藏旗標分支（`hidden` 區，`reprint_language`／`possessed` 除外）整段略過。
- 資料用語是「冒險日誌」「混亂袋」，程式自己產生的句子跟著用。

## 5. 待辦（依優先順序）

1. ~~拆成正式專案結構（設定、讀取、播放、畫面分檔），加 README，部署 GitHub Pages。~~ 完成（2026-10-08）：repo <https://github.com/MrJJC/chutugame>，網站 <https://mrjjc.github.io/chutugame/>，push 到 `main` 即自動更新。
2. Gemini 語音：請求格式已修正並驗證（只支援 pcm；語氣走 `instructions`；取樣率讀 Content-Type）。尚待使用者實際聽：台灣口音、語氣是否合適。
3. ~~補完冒險 II–VIII、幕間故事 I、幕間故事 II、尾聲。~~ 完成（2026-10-08）。自動試玩過每關兩輪無錯誤；尚未有人實際對照實體卡玩過 II–VIII。
4. ~~第 VII 關「黑星升起」：兩疊密謀同時進行，遊戲畫面需支援多疊。~~ 完成（2026-10-08）。
   - 待改進：部分卡背的劇情寫在 `back_text`（混著條件句，例如蒼白面具場景 2、真相幻影場景 1），目前顯示在「照卡面執行」方框、不會朗讀。
5. 戰役日誌的「懷疑」「信念」等累計數值：先做手動加減。
6. 逐句覆寫校對層（目前只有名詞替換）。
7. 待使用者確認：替換表是否依循環分開、卡背效果要不要朗讀、是否需要雲端存檔。

## 6. 限制與原則

- 不要把遊戲劇情原文寫進程式或 repo；一律執行時讀取。
- 金鑰只存在使用者瀏覽器（localStorage），不寫進程式。
- 存檔、替換表、設定的 localStorage key：`asr.saves`、`asr.glossary`、`asr.settings`、`asr.last`；`asr.cache` 是劇本快取，可隨時刪。語音存檔在 IndexedDB `asr-voice`，不包含在備份代碼裡。
- `_tts_samples/` 是各模型的試聽檔，已列入 .gitignore，不進 repo。
- 在預覽視窗或部分公司網路中開啟會因擋外網出現「Failed to fetch」，需用瀏覽器直接開 GitHub Pages 網址。

## 7. 相關文件

- 規劃書 v2（Claude Docs）：https://claude.ai/code/artifact/0a30a4a6-f13b-4114-a896-d60f25858d78
- 介面試玩 demo（示意劇本）：https://claude.ai/artifact/EtY3mEWDdmrFPfZTDsJF5a
