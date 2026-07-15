# TODO

## Current  (overwrite this section at every handoff)

- Doing: Phase 1（N4+N3 文法速通，至 8/30）— 見 STUDY_PLAN.md。五級單字書（N5 793/N4 994/N3 1954/N2 1770/N1 1763）＋五級文法句型書（N5 90/N4 122/N3 157/N2 172/N1 130）＋聽力菜單＋N1 計畫皆完成
- Next: 8 月底做 N3 模擬題 → 決定報 N2 或 N3；9 月初完成 LTTC 報名。素材齊全，靠每天執行（聽力見 LISTENING_PLAN.md）；讀解技巧＋考古題於 Phase 3-4
- 待審稿（可選）: N1 單字/文法只做了程式驗證，未經對抗式 agent 審稿（因額度上限中止）；想要時補跑 15 個審稿 agent（同 N2 流程）
- 網頁學習道場: 已完成（web/，單字四模式＋文法兩模式＋閱讀＋SM-2 SRS＋Google 登入同步）。本機試玩：`npm run dev`。
  - 2026-07-15 學習進度改版: 新增今日目標進度條、正確率、連續天數、弱點題數與一鍵弱點複習；活動按裝置彙總，跨裝置合併不重複計數；舊 localStorage/遠端資料自動補預設值。弱點由最近 again/hard、反覆失誤或低 ease 判定。PWA v10 預快取五級全部單字/文法題庫（約 2.6 MB），真正首次安裝即可離線。品牌改為「JLPT 學習道場」，新增 `npm run dev/test/build:data`，專案說明補入 CLAUDE.md。19 個 JS 測試檔＋14 個 Python unit tests＋資料重建驗證全過。
  - 背景音樂（BGM，程式合成、無版權/無檔案、可選樣式）已上線: web/js/bgm.js makeBgm(style)＝Web Audio 即時生成的平緩環境樂（C 大調五聲琶音＋sustained pad＋LFO 呼吸＋feedback delay，音量低、consonant）。BGM_STYLES＝off/空靈(ambient)/lo-fi 慵懶(lofi)/輕快(bright)，同引擎不同參數（filter cutoff/octave/tempo/delay/osc 型別）；設定改成「背景音樂」下拉選單（settings.bgm＝樣式字串，預設 'off'）。normalizeStyle 相容舊 boolean（true→ambient、false→off）。app.js setStyle 切換（一個 AudioContext 重用、換樣式淡出淡入）＋reload 若非 off 則第一次 gesture 才啟動（autoplay 政策）。sw.js CACHE 升 v7。midiToFreq/ARP_NOTES/BGM_STYLES/normalizeStyle 有純函式測試。65/65 測試，Playwright 驗過（4 選項、預設 off 無 context、三樣式皆在同一重用 context 上 running、off↔樣式切換正常、除 GIS 環境噪音外 0 error）。想再調各樣式手感（更慢/更亮…）隨時說。
  - 落下模式（falling.js）: 成對卡下落、點兩張相配消除、3 命落地扣命、成功依耗時記 SRS、漸快、Game Over+再玩一次；發卡用 queue.slice() 快照不動 session 佇列
  - 配對內容切換（settings.pairMode meaning/reading）: 讀音模式＝漢字↔假名讀音、只出漢字詞（word≠kana）、藏讀音；套用配對＋落下＋四選一（quiz 讀音模式：出漢字、四個假名讀音選一，pickDistractors 加 field 參數）
  - 視覺已現代化改版（現代基底＋日文點綴）: style.css 全 token 化、Inter+Zen Kaku Gothic New+Noto Sans TC 字型、乾淨近白/近黑雙主題、去飄動背景、柔陰影、朱紅單一強調色；新增手動主題鈕 ☀/☾/◐（settings.theme system/dark/light，app.js applyTheme 設 root data-theme）。Playwright 對照圖已驗證、0 console error
  - 文法四選一（grammar cloze）已上線: 頂部「單字/文法」大切換、文法獨立 SRS；例句挖空選句型、振假名 ruby、中文意思提示。web/js/modes/grammar-cloze.js（gradeCloze/furiganaToRuby）+ build_grammar_cloze.py（驗證/輸出）+ store content 設定 + app/ui/css。spec/plan 於 docs/superpowers/。opus 終審 Ready、修了 reset-in-grammar desync。
    - 答完顯示解說面板（句型/接續/用法/中譯）＋手動「下一題」；接續(connection)已進資料與 build。
    - 題庫已生五級全量共 623 題（N5 86／N4 113／N3 152／N2 164／N1 108），data/grammar_cloze_items/<lv>.json → web/data/grammar_<lv>.json。用 generate→對抗式 verify 的 workflow（44 chunk、88 agent）產出；重建檢查＋validator 丟掉無法還原原句者（N1 最多）與句首型（empty before），不出壞題。要重生用 build_grammar_cloze.py。
    - 小事: renderDone 空池文案寫死「沒有單字」，文法模式下也顯示單字字樣（可改）。
  - 排列重組（grammar order / 並べ替え）已上線: 文法第二模式，deck 概念（vocab/grammar/grammar_order 各自題庫）。點選 4 片段排序、填滿自動判定整句、答完顯示完整句＋解說＋下一題。web/js/modes/grammar-order.js（gradeOrder/checkOrder）+ build_grammar_order.py + furiganaToRuby 抽成 web/js/furigana.js。opus 終審 Ready、修了 stale-chrome deck binding（renderChrome 改吃 getter）。
    - 題庫已生五級全量共 506 題（N5 47／N4 90／N3 118／N2 153／N1 98），data/grammar_order_items/<lv>.json → web/data/grammar_order_<lv>.json。generate→unique-order verify workflow（46 chunk、92 agent）；verify 強制修正雙解後保留剛好 4 片段（本輪 0 掉在非4片段）；重建檢查丟掉無法還原原句者（N1 最多）。N5 良率低＝短句難切出唯一解 4 段。
  - 每日閱讀（C，改版為連結啟動器）已上線: 頂部第三個切換「閱讀」，選它時隱藏遊戲 chrome，顯示 6 個外部日語閱讀來源卡（NHK Web Easy／Watanoc／MATCHA／福娘童話集／NHK 一般／青空文庫，涵蓋 N5–N1），開新分頁 rel=noopener。web/js/modes/reading.js（SOURCES + mountReading）；閱讀走 next()/onContentChange guard 繞過 deck。純連結、無題庫/後端/理解題。Playwright 驗過、0 error、40/40。
  - 每模式專屬音效已上線: audio.js makeAudio 改成「同事件不同 voice」——每個模式各有音色/手勢的 hit()/wrong()/clear()（配對＝圓潤 pop、打字＝打字機 tick+ding、四選一＝上行雙音、落下＝街機 zap、文法四選一＝木質 marimba、排列重組＝完成和弦），call site 不動，app.js next() 呼叫 audio.setMode(mode) 依當前模式切換。VOICE_IDS 匯出＋單元測試（68/68）；Playwright 實機驗過六模式 correct 0.13–0.20／wrong 0.07–0.11 皆可聞、0 error。sw.js CACHE 升 v9。
  - 三大支柱全到位: 單字（4 模式）、文法（四選一 623／排列重組 506）、閱讀（每日連結）。
  - 更新模式決定: 閱讀採 approach ①（連現成每日日語新聞），不做即時生成/後端/AI 生文（版權與成本考量）。
  - Google 登入 + 每人同步 已上線（取代 passphrase）: GIS 登入→Worker /session 用 tokeninfo 驗 ID token→發 60 天 session→同步帶 Bearer，資料存 user:<sub>。worker/index.js（validateClaims + /session//data//logout，CORS 鎖 ALLOWED_ORIGIN）+ web/js/auth.js（session/owner 存取 + GIS glue）+ sync.js Bearer + app.js（onCredential/signOut/syncNow）+ ui 設定帳號區。本地優先不變、登入為選配。opus 終審＋2 輪加固：帳號感知同步（applySync，換帳號不混、有純函式回歸測試防漏）、signOut 打 /logout、name/email escape。59/59 測試、Playwright 驗過、0 error。spec/plan 於 docs/superpowers/2026-07-13-*。
    - Google Client ID、Worker URL、KV 與 allowed origin 已填入 repo；仍應依 docs/deploy/google-login-setup.md 在正式站做一次雙裝置登入 smoke test。
  - PWA（可安裝 + 離線）已上線: web/manifest.json（standalone、相對路徑）+ build_icons.py 生朱紅「字」印章 icon（192/512/maskable/apple-touch，commit 進 web/icons）+ web/sw.js（precache app shell + 同源 GET stale-while-revalidate；跨源 Worker 同步/GIS/字型一律走網路不快取）+ index.html manifest/apple-touch/iOS metas + app.js 註冊 SW。手機可「加到主畫面」全螢幕、離線可玩。61/61 測試、Playwright 驗過離線重載仍渲染、0 error（一次 GIS 第三方腳本 transient 錯誤、clean rerun 無、不影響功能）。spec/plan 於 docs/superpowers/2026-07-14-*。改版記得 bump web/sw.js 的 CACHE。
  - 部署待確認: GitHub Pages workflow 範本仍在 docs/deploy/pages.yml，尚未放入 `.github/workflows/`；正式站 Google 登入與雙裝置同步需人工 smoke test。
- 素材: build_vocab_pdf.py / build_grammar_pdf.py（level 參數 n5-n1）、data/(grammar_)<lv>_part*.json、<LV>單字書/文法句型書.pdf、JLPT_N5-N1_*.csv（單字普通+Anki、文法 Anki）
- Blocked / to decide: 每日可投入時數尚未確認（計畫以 4–5h/日為前提）
- Relevant files: STUDY_PLAN.md, N5/N4/N3單字書.pdf, build_vocab_pdf.py, data/n[345]_part*.json
- Note: build_vocab_pdf.py 吃 level 參數（n5/n4/n3）；兩階段建構（先收集頁碼再附索引，索引不進目錄故不位移頁碼）；分類標題／目錄用 Noto Sans CJK（日＋繁全包，OTF→TTF 自動轉檔快取於 assets/fonts，已 gitignore），本文日文用 IPAGothic。2923 詞例句經 20 個 agent 審稿

---

<!--
History lives in `git log`. Keep only the "Current" block here, always short.
To pick up work: read this section + `git log --oneline -15`.
-->
