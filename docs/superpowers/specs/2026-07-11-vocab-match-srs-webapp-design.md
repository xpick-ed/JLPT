# 設計：日文單字配對消除 SRS 網頁遊戲

日期：2026-07-11
狀態：已核准設計，待寫實作計畫

## 目標

一個好看、活潑的網頁單字遊戲（使用者覺得 Anki 太醜），用「配對消除」玩法包住一套真正的間隔重複（SRS）系統，資料來自本 repo 既有的 6729 詞。手機與電腦皆可用，進度以「同步密碼」跨裝置合一。免費、可自行 host。

## 使用者已確認的決策

- **核心玩法**：配對消除（word ↔ 中文意思）。
- **底層**：真 SRS（間隔重複），非純遊戲。
- **裝置**：手機與電腦都用。
- **同步**：跨裝置同步，採「同步密碼」方式（不註冊帳號）。
- **範圍**：網頁內自由切換級別（N5–N1）與主題。
- **外觀**：活潑遊戲感（鮮明色彩、動畫、連擊、音效）。
- **v1 只做配對消除一種模式**，其他模式之後再加。

## 架構總覽

```
[GitHub Pages 靜態網頁]                    [Cloudflare Worker + KV]
  index.html / app.js / style.css            GET/PUT  /?key=<hash>
  web/data/n5.json … n1.json  (單字資料)  ←→   存取使用者 SRS 進度 JSON
  localStorage: SRS 進度（本機真相來源）
        │  依同步密碼雜湊出 key，定期拉/推、依卡片更新時間合併
        └──────────────────────────────────────────┘
```

- 前端：純 vanilla JS + CSS + Web Audio，**無編譯步驟**，直接 GitHub Pages host。
- 後端：單一 Cloudflare Worker + 一個 KV namespace，只做「用 key 存取一包 JSON」。
- 單字資料隨網站出貨（靜態 JSON），依級別載入。

## 元件與職責（各自可獨立理解/測試）

### 1. 資料建置：`build_web_data.py`
- 讀 `data/n{5,4,3,2,1}_part*.json`，依 `word|kana` 去重（低級別優先，與現有 CSV 相同規則）。
- 每個字產生穩定 `id`（`word|kana` 的短雜湊）。
- 輸出 `web/data/n5.json … n1.json`，每檔為陣列，元素：
  `{ id, level, category, word, kana, romaji, pos, zh, ex, ex_zh }`。
- 產物 commit 進 repo（本機開發即可用，CI 不需重建）。
- 輸入：現有 data JSON。輸出：web/data/*.json。相依：只依 Python 標準庫。

### 2. SRS 引擎：`web/js/srs.js`
- 演算法：SM-2。每張卡狀態：`{ id, ease, interval, due, reps, lapses, updated }`。
  - 新卡初始：`ease=2.5, interval=0, reps=0, lapses=0`。
- 評分（4 級）由配對表現推得，見「玩法 → SRS 對應」。
- `review(card, grade, now)` 回傳更新後的卡：
  - **Again**：`lapses+1`、`interval=0`（進重學）、`ease=max(1.3, ease-0.2)`、下次到期 = now + 10 分鐘（重學當日再現）。
  - **Hard**：`interval = max(1, round(interval*1.2))` 天、`ease=max(1.3, ease-0.15)`。
  - **Good**：新卡→1 天；否則 `interval=round(interval*ease)` 天。
  - **Easy**：新卡→3 天；否則 `interval=round(interval*ease*1.3)` 天、`ease=ease+0.15`。
  - `reps+1`、`due = now + interval 天`（Again 例外如上）、`updated = now`。
- `dueQueue(cards, now, newPerDay)`：回傳今日到期卡 + 至多 `newPerDay` 張新卡（未複習過者），依到期時間排序。
- 純函式、無 DOM、無 I/O，可單獨單元測試。

### 3. 進度儲存：`web/js/store.js`
- 本機真相來源 = `localStorage`（key: `vocabmatch.state`），內容：
  `{ cards: { [id]: SRSCard }, settings: { newPerDay, levels, categories, sound }, updated }`。
- `settings` 預設：`newPerDay=50`、`levels=["n2"]`、`categories=[]`（全部）、`sound=true`。
- `load()/save(state)`；`mergeStates(a, b)`：逐卡取 `updated` 較新者；`settings` 取整體 `updated` 較新者。
- 相依：localStorage。無網路。

### 4. 同步：`web/js/sync.js` + `worker/`
- 使用者在設定輸入「同步密碼」→ 前端 `SHA-256(passphrase)` hex 當 `key`（存 localStorage，不存明碼）。
- Worker（`worker/index.js`，Cloudflare Workers + KV）：
  - `GET /?key=<hash>` → 回傳該 key 的 JSON（無則 `{}`），含 CORS 標頭。
  - `PUT /?key=<hash>`（body = 狀態 JSON）→ 寫入 KV。
  - 僅這兩個路由；key 缺失回 400。
- 前端流程：
  - 啟動：若有密碼與 Worker URL，`GET` 遠端 → `mergeStates(local, remote)` → 存本機 + `PUT` 回遠端。
  - 有變動：debounce 3 秒 `PUT`。
  - 離線/失敗：靜默略過，只用本機（不阻斷遊戲）。
- 前端設定：`web/config.js` 內 `WORKER_URL`（使用者部署後貼上）。
- 安全性：密碼即存取權，刻意低安全（背單字進度低風險）；spec 明列此取捨。

### 5. 遊戲玩法：`web/js/game.js`
- **盤面**：一局 6 對＝12 張卡，於響應式格線（手機 3 欄×4 列）打散排列。每張卡是「單字卡」（顯示漢字＋假名）或「意思卡」（顯示中文）。6 個字取自本次 session 佇列。
- **操作**：點兩張卡；若構成同一字的 word↔meaning → 消除（彈開＋粒子＋音效＋連擊＋1），否則抖動、連擊歸零。
- **計時／juice**：本局計時；連擊倍率影響分數；消除有動畫與短音效。
- **補牌**：清完一盤，從 session 佇列再取 6 字開新盤，直到佇列空或使用者停止。
- **玩法 → SRS 對應**（每字於該盤內追蹤：是否曾配錯、消除耗時）：
  - 該字在消除前**曾被配錯** → `Again`。
  - 未配錯但**耗時偏長**（> 8 秒）→ `Hard`。
  - 未配錯、正常 → `Good`。
  - 未配錯且**極快**（< 2.5 秒，且首次點選即命中）→ `Easy`。
  - 消除即呼叫 `srs.review(...)` 更新該卡並標記 `updated`。
- 相依：srs.js、store.js、DOM、audio.js。

### 6. 介面與外觀：`web/js/ui.js`, `web/style.css`, `web/js/audio.js`
- **視覺野心＝fancy（高完成度、細膩微互動，非陽春）**。實作時走 frontend-design 流程，追求「一眼就覺得精緻、好玩、想一直點」。具體：
  - **微互動/juice**：發牌時卡片依序滑入＋彈簧、選中卡片浮起發光、配對成功卡片爆開成粒子＋短暫畫面震動、連擊時背景脈動、清盤放彩帶（confetti）。
  - **連擊回饋升級**：連擊數越高，特效與音高越強（漸強的正回饋）。
  - **視覺系統**：一致的鮮明漸層配色、圓角＋柔和陰影/玻璃質感點綴、精選字體、動態漸層背景、明暗兼容。
  - **轉場**：開局/清盤/升級皆有流暢轉場，非硬切。
  - **效能**：動畫用 CSS transform/opacity（GPU 友善），維持手機順暢。
- 頂部：級別晶片（N5–N1）＋主題晶片（依所選級別動態產生）＋「今日到期／新字」計數。
- 設定面板：每日新字數、同步密碼、Worker URL、音效開關、（重設進度）。
- `audio.js`：Web Audio 產生分層短音效（命中、錯誤、連擊漸強、清盤），無需音檔；受音效開關控制。
- 手機優先 RWD，電腦亦佳。

### 7. Host 與部署
- 網站原始碼置於 `web/`。
- `.github/workflows/pages.yml`：將 `web/` 發佈到 GitHub Pages（使用者一次性把 Pages 來源設為「GitHub Actions」）。
- Worker：`worker/` 含 `index.js` 與部署說明（免費 Cloudflare 帳號、建立 KV、`wrangler deploy` 或後台貼上）。README 附逐步指令。

## 資料流

1. 建置：`build_web_data.py` → `web/data/*.json`（commit）。
2. 載入：使用者選級別 → 前端 fetch 該級別 JSON → 建卡片池。
3. 開局：`srs.dueQueue()` 產生 session 佇列 → 遊戲取 6 字開盤。
4. 消除：判定 grade → `srs.review()` → `store.save()` → `sync` debounce `PUT`。
5. 換裝置：輸入同一密碼 → `GET` 遠端 → `mergeStates` → 續玩。

## 錯誤處理

- 網路/同步失敗：靜默降級為純本機，遊戲不中斷；設定面板顯示「上次同步時間／失敗」。
- localStorage 不可用（隱私模式）：以記憶體狀態運行並提示「本次進度不會保存」。
- 資料載入失敗：顯示重試。
- 合併衝突：以每卡 `updated` 時間戳 last-write-wins，無需使用者介入。

## 測試策略

- `srs.js`：純函式單元測試（各 grade 的間隔/ease 演算、新卡首評、dueQueue 篩選排序）。
- `store.js`：`mergeStates` 的逐卡時間戳合併測試。
- 玩法→grade 對應：以模擬盤面事件驗證映射。
- 手動：實機（手機＋電腦）跑一輪、設同一密碼驗證同步合一。

## v1 範圍（YAGNI）

**做**：配對消除單一模式、SM-2 SRS、級別/主題篩選、密碼同步、音效/特效、分數連擊、設定面板。
**不做（之後）**：打字競速/四選一等其他模式、發音 TTS、統計儀表板、排行榜、干擾用假意思卡、間隔學習的細緻參數 UI。

## 待辦相依（使用者一次性設定）

1. 開啟 repo 的 GitHub Pages（來源＝GitHub Actions）。
2. 辦免費 Cloudflare 帳號、建立 KV namespace、部署 `worker/`（附逐步說明）。
3. 把 Worker URL 貼進 `web/config.js`；在設定輸入自取的同步密碼（兩台裝置相同）。
