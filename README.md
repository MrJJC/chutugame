# 詭鎮劇本朗讀器（Arkham Script Reader）

搭配實體《詭鎮奇談：卡牌版》繁中版遊玩的網頁小工具。手機或平板放在桌邊，選關後替你朗讀開場、密謀／場景卡背與結局，並記下戰役日誌。

目前收錄：**卡爾克薩之路**的序章與冒險 I《謝幕》。

## 使用

用瀏覽器打開 GitHub Pages 網址即可，需要連網（劇本文字在打開時才從社群資料庫讀取，本專案不內含任何遊戲原文）。

- 進度、名詞替換表、朗讀設定都存在該裝置的瀏覽器裡；換裝置前到「存檔與日誌」匯出備份。
- 預設用裝置內建語音。要用 Gemini 語音，到「朗讀設定」填自己的 OpenRouter 金鑰（只存在你的瀏覽器）。

## 專案結構

純靜態網頁，沒有建置步驟，也沒有相依套件。

```
index.html      頁面骨架（所有畫面的 HTML）
css/style.css   樣式
js/config.js    設定：共用小工具、要讀哪些循環與關卡（REAL）、資料來源網址
js/sample.js    示意劇本（原創文字，讀取失敗時用來試介面）
js/loader.js    讀取：抓社群資料、解析 .po 翻譯、轉成統一的關卡格式
js/state.js     狀態：朗讀設定、存檔、名詞替換（localStorage）
js/ui.js        切換畫面、標題列、提示訊息
js/audio.js     聲音：裝置語音、Gemini（OpenRouter）、背景音
js/player.js    播放：逐句／逐字朗讀與畫面同步
js/game.js      畫面：選擇關卡、遊戲流程（推進、分支、結局）
js/panels.js    畫面：文本庫、名詞替換、朗讀設定、存檔與日誌
js/main.js      頂端按鈕與啟動
```

各檔是一般的 `<script>`（不是 ES module），共用全域變數，**載入順序就是上表的順序**，由 `index.html` 底部的 `<script>` 標籤決定。新增檔案時留意它用到的變數要先載入。

## 本機開發

因為要連外讀取資料，請用本機伺服器開，不要直接點兩下 `index.html`：

```
python -m http.server 8000
```

然後開 <http://localhost:8000/>。

## 新增關卡

在 `js/config.js` 的 `REAL` 加一行，例如：

```js
{ id: 'the_last_king', code: 'II', pack: 'eotp' }
```

`id` 是 arkham-cards-data 的劇本檔名，`pack` 是卡牌所在的 ArkhamDB 資料包。細節與待辦見 [HANDOFF.md](HANDOFF.md)。

## 部署

推到 `main` 分支後，GitHub Pages（Settings → Pages → Deploy from a branch → `main` / root）會自動更新。

## 資料來源與聲明

- 劇本結構與繁中翻譯：[zzorba/arkham-cards-data](https://github.com/zzorba/arkham-cards-data)
- 場景／密謀卡資料：[Kamalisk/arkhamdb-json-data](https://github.com/Kamalisk/arkhamdb-json-data)

同好自製的非官方工具，與 Fantasy Flight Games 無關。《詭鎮奇談：卡牌版》（Arkham Horror: The Card Game）及其內容的權利屬於原權利人。
