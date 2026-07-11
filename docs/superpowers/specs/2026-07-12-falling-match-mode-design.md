# 設計：下落配對模式（「落下」）

日期：2026-07-12
狀態：已核准設計，待寫實作計畫
專案：JLPT 單字遊戲（web/，vanilla ES modules，現有三模式 match/typing/quiz 共用 SM-2 SRS）

## 目標

在現有單字遊戲加入第 4 個模式「落下」：日文單字卡與中文意思卡從畫面上方持續往下掉，玩家點兩張相配的（日文 ↔ 它的意思）即可消除；卡落到底線扣一命，3 命扣光 Game Over。配對成功依速度記進 SRS，落地不罰。

## 使用者已確認的決策

- **玩法**：日文卡與意思卡都掉；點兩張相配的消除。
- **失敗**：卡落地扣 1 命，**3 命**扣光才 Game Over。
- **SRS**：折衷——配對成功依速度評分記進 SRS；落地只扣命、**不記 Again**。
- **難度**：起始舒服，**隨分數漸快**（生成變密、下落變快），有上限。
- **v1 範圍**：只做玩法核心；排行榜/歷史最高分之後再說。

## 架構與整合

此模式是**即時連續**的（非回合制），自己跑 `requestAnimationFrame` 迴圈，不走 app.js 的 `next()`。

- 新檔 `web/js/modes/falling.js`，導出 `mountFalling(root, supply, onResult, audio, onGameOver)`，回傳一個 `stop()` 清理函式。
- `web/js/ui.js`：模式分頁多一顆「落下」。
- `web/js/app.js`：`mode==='falling'` 時走 falling 專用路徑（見下）。
- `web/style.css`：落下卡、危險線、HUD、Game Over 畫面的樣式。

## 元件：`web/js/modes/falling.js`

### 介面
```
mountFalling(root, supply, onResult, audio, onGameOver) -> stop()
```
- `root`：掛載元素（stage）；falling 會把它設為定位容器，卡片絕對定位。
- `supply()`：回傳下一張要生成的卡 `{id, word, kana, zh, ...}`（app 提供，無限）。
- `onResult(id, grade)`：**配對成功時**呼叫一次（grade 由耗時決定）。落地**不呼叫**。
- `audio`：`{hit(combo), wrong(), clear()}`。
- `onGameOver(stats)`：命數歸零時呼叫，`stats = {score, maxCombo}`；由 app 渲染結束畫面。
- 回傳 `stop()`：`cancelAnimationFrame` + 移除事件監聽 + 清空 root。app 於切換模式時呼叫。

### 資料模型（模組內）
- **Pair**：一次生成的一對，`{ id, spawnedAt, tiles: [wordTileEl, meaningTileEl], failed:false }`。
- **Tile**（DOM 元素 + 狀態）：`{ el, pairId, type:'word'|'meaning', x, y, cleared }`。y 為距頂 px。

### 純函式（可單元測試，全部導出）
- `gradeFalling(elapsedMs)`：`<2500 → 'easy'`；`<6000 → 'good'`；否則 `'hard'`。**永不回傳 'again'**。
- `nextDifficulty(cleared)`：回傳 `{ fallSpeed, spawnInterval }`。
  - `fallSpeed = min(180, 60 + cleared*2)` px/s。
  - `spawnInterval = max(700, 1800 - cleared*40)` ms。
- `isLanded(tileY, tileH, floorY)`：`tileY + tileH >= floorY`。

### 遊戲迴圈（rAF）
- 狀態：`lives=3, score=0, combo=0, maxCombo=0, cleared=0, selected=null, pairs=[]`, `lastSpawn`, `lastFrame`。
- 每幀（dt = now - lastFrame）：
  1. 依 `nextDifficulty(cleared)` 取 `fallSpeed`/`spawnInterval`。
  2. 若距 `lastSpawn` ≥ `spawnInterval` 且畫面活躍 tile 數 < 8：`const c = supply()`，生成一個 Pair——兩張 tile（`type:'word'` 顯示 `word`，若 `word!==kana` 附讀音；`type:'meaning'` 顯示 `zh`），x 取兩個隨機水平位置，y 從 -tileH（略微錯開起始 y 讓兩張不完全同高）。
  3. 對每個未消除 tile：`y += fallSpeed * dt/1000`；套用 `transform: translateY`。
  4. 落地判定：任一 tile `isLanded(...)` → 該 Pair `failed`：移除該對兩張 tile（動畫消失）、`lives-=1`、`audio.wrong()`、`combo=0`。**不呼叫 onResult**。
  5. `lives<=0` → 停迴圈、`onGameOver({score, maxCombo})`。
- HUD（root 頂部固定層）即時顯示 ❤️×lives、分數、連擊。

### 互動（點擊配對）
- 點一張 tile → 設為 `selected`（highlight）。
- 點第二張：
  - 同一 Pair 且兩張不同 type（word+meaning）→ **消除**：兩張彈開＋粒子＋`audio.hit(combo)`；`combo++`、`maxCombo=max`、`score += 10*combo`、`cleared++`；`onResult(pair.id, gradeFalling(now - pair.spawnedAt))`；移除該 Pair。
  - 否則 → **不相配**：取消 selected、`combo=0`、`audio.wrong()`、被點的兩張各抖一下。**不扣命**（只有落地扣命）。
  - 再點同一張 → 取消 selected。

## app.js 整合

- `ui.js` 模式分頁陣列加入 `{ key:'falling', label:'落下' }`。
- app.js：
  - `let stopFalling = null;`
  - `onResult(id, grade)`：套用 grade + persist **不變**；但推進 `next()` 只在**非 falling**模式才排程（`if (mode !== 'falling') scheduleAdvance()`），因為 falling 自行管理迴圈。
  - `next()`：`if (mode === 'falling') return startFalling();`（其餘回合制邏輯不變）。
  - `startFalling()`：
    - `if (stopFalling) { stopFalling(); stopFalling = null; }`
    - 若 `pool` 空 → `renderDone(stage)`（沿用空範圍提示）。
    - 建 `supply`：先從 `queue` `shift` 出 id（`byId`），空了改用洗牌後的整個 `pool` 循環，無限回傳卡物件。
    - `stopFalling = mountFalling(stage, supply, onResult, audio, onGameOver)`。
  - `onGameOver({score, maxCombo})`：渲染結束畫面（分數＋最高連擊＋「再玩一次」按鈕→`startFalling()`）。
  - 切換模式（`onModeChange`）或離開時：`if (stopFalling) { stopFalling(); stopFalling = null; }`。

## 資料流

boot/切到落下 → `startFalling` → `mountFalling` 開 rAF → 生成成對卡下落 →
- 點對 → `onResult(id, grade)` → `applyGrade`+`persist`（不 advance）→ falling 繼續。
- 落地 → 扣命（無 SRS）→ 迴圈繼續 → 命盡 → `onGameOver` → app 顯示結束畫面。

## 錯誤處理

- `supply()` 理論上無限；若某刻 pool 為空（無級別）→ `startFalling` 直接顯示空範圍提示，不啟動迴圈。
- 切換模式務必 `stopFalling()`，避免 rAF/監聽殘留（記憶體/重複迴圈）。
- rAF 在分頁隱藏時瀏覽器自動節流；不需特別處理（`pagehide` 已有 flush）。

## 測試策略

- 純函式單元測試（`node --test`）：`gradeFalling` 各區間、`nextDifficulty` 的上下限與遞增、`isLanded` 邊界。
- 迴圈/DOM/動畫、落地扣命、Game Over、點擊配對：Playwright（headless）+ 手動——生成→下落→點對消除→放掉一張確認扣命→扣光顯示結束畫面→再玩一次；切走模式確認迴圈停止（無殘留 rAF）。

## v1 範圍（YAGNI）

**做**：下落成對卡、點擊配對消除、3 命落地扣命、漸快難度、成功記 SRS（折衷）、HUD、Game Over＋再玩一次。
**不做（之後）**：排行榜/歷史最高分、關卡、道具/技能、拖曳操作、音樂。
