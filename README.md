# JLPT 學習道場

自製的 JLPT（日本語能力試驗）全級備考系統：一個零依賴的網頁學習 App＋五級單字/文法書 PDF＋Anki 牌組，資料同源、可離線、可跨裝置同步。

**線上版：https://xpick-ed.github.io/JLPT/web/** （push 到 main 即自動部署）

## 網頁 App 功能

**題庫**：五級單字累計 10,079 詞（N5–N1 皆達或超過官方公認詞彙量目標；含例句、中譯、聲調）、文法四選一 681 題、排列重組 564 題——全部經過多 agent 對抗式審稿。

**13 種練習模式**

| 分頁 | 模式 |
|------|------|
| 單字 | 配對・打字・四選一・落下（街機式，含道具與幽靈 PB） |
| 文法 | 四選一（含解說）・排列重組・句型字典（可搜尋、一鍵出題） |
| 特訓 | 混合（interleaving）・例句挖空・助詞填空・同音辨析・聽力・聽寫重組・跟讀・動詞變位・漢字筆順描紅 |
| 閱讀 | 每日日語讀物連結（NHK Easy 等六來源） |

**學習系統**
- **FSRS-4.5 間隔重複排程**（Anki 新預設演算法），弱點自動偵測與一鍵複習
- **一鍵今日課表**：到期複習→弱點→文法→聽力自動接續
- **考前教練**：考試倒數、依實際進度生成今日菜單、30 天複習量預報
- **模擬考**（單級 40 題計時混合卷＋成績單錯題複習）與**詞彙量檢定**（分層抽樣估計）
- **統計**：學習熱力圖、真實記憶保留率、FSRS 難度分佈、各級掌握度
- **遊戲化**：全域連擊計分、成就徽章、每日任務、幽靈對手個人紀錄

**技術特點**
- 純 HTML/CSS/ES modules，**零 npm 依賴**；PWA 可安裝、全部題庫預快取、完全離線可用
- 聽力/跟讀用瀏覽器內建語音合成（無音檔）；音效與 BGM 皆 Web Audio 即時合成（無資產）
- 聲調標記來自 [kanjium](https://github.com/mifunetoshiro/kanjium)（CC BY-SA）；筆順來自 [KanjiVG](https://kanjivg.tagaini.net)（CC BY-SA 3.0）
- 進度存 localStorage，可選 Google 登入經 Cloudflare Worker + KV 跨裝置同步（本地優先）；設定內建 JSON 備份匯出/匯入

## 開發

需求：Python 3、Node.js 20+（僅跑測試/開發伺服器用，App 本身無依賴）。

```bash
npm run dev          # 本機試玩 http://localhost:8000
npm test             # JS 測試 + Python 測試 + 題庫完整性驗證
npm run build:data   # 由 data/ 原始資料重建 web/data/ 全部題庫
```

PDF 書另外建（需 ReportLab 與字型，詳見各 builder）：

```bash
python3 build_vocab_pdf.py n5      # n5–n1
python3 build_grammar_pdf.py n5
python3 build_strokes.py --kanjivg <KanjiVG kanji/ 目錄>   # 重建筆順資料
```

## 架構

```
data/                 原始題庫（單字/文法 chunks、聲調表、練習題原始檔）
web/                  App 本體（GitHub Pages 服務此目錄）
  data/               builder 產出的題庫 JSON（勿手改；ID 為內容雜湊，穩定）
  js/app.js           協調器（模式路由、課表、同步）
  js/srs.js           FSRS-4.5 排程
  js/store.js         持久化與跨裝置合併規則
  js/modes/           各練習模式（純函式＋mount 分離，皆有單元測試）
worker/               Google 登入驗證與 KV 同步（Cloudflare Worker）
tests/                零依賴 Node 測試＋Python 測試
*.pdf / *.csv         產出的單字書/文法書與 Anki 牌組（刻意入庫）
```

慣例與交接規則見 `AGENT.md` 與 `CLAUDE.md`；學習計畫見 `STUDY_PLAN.md`。

## 授權

程式碼為個人專案。資料出處：聲調資料 kanjium（CC BY-SA）、筆順資料 KanjiVG（CC BY-SA 3.0），均已於資料檔頭註記。
