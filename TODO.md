# TODO

## Current  (overwrite this section at every handoff)

- Doing: Phase 1（N4+N3 文法速通，至 8/30）— 見 STUDY_PLAN.md。五級單字書（N5 793/N4 994/N3 1954/N2 1770/N1 1763）＋五級文法句型書（N5 90/N4 122/N3 157/N2 172/N1 130）＋聽力菜單＋N1 計畫皆完成
- Next: 8 月底做 N3 模擬題 → 決定報 N2 或 N3；9 月初完成 LTTC 報名。素材齊全，靠每天執行（聽力見 LISTENING_PLAN.md）；讀解技巧＋考古題於 Phase 3-4
- 待審稿（可選）: N1 單字/文法只做了程式驗證，未經對抗式 agent 審稿（因額度上限中止）；想要時補跑 15 個審稿 agent（同 N2 流程）
- 網頁單字遊戲: 已完成（web/，四模式 配對/打字/四選一/落下 + SM-2 SRS + 密碼同步）。29/29 測試，opus 終審 Ready。設計/計畫於 docs/superpowers/。本機試玩：python3 -m http.server -d web 8000
  - 落下模式（falling.js）: 成對卡下落、點兩張相配消除、3 命落地扣命、成功依耗時記 SRS、漸快、Game Over+再玩一次；發卡用 queue.slice() 快照不動 session 佇列
  - 配對內容切換（settings.pairMode meaning/reading）: 讀音模式＝漢字↔假名讀音、只出漢字詞（word≠kana）、藏讀音；套用配對＋落下＋四選一（quiz 讀音模式：出漢字、四個假名讀音選一，pickDistractors 加 field 參數）
  - 視覺已現代化改版（現代基底＋日文點綴）: style.css 全 token 化、Inter+Zen Kaku Gothic New+Noto Sans TC 字型、乾淨近白/近黑雙主題、去飄動背景、柔陰影、朱紅單一強調色；新增手動主題鈕 ☀/☾/◐（settings.theme system/dark/light，app.js applyTheme 設 root data-theme）。Playwright 對照圖已驗證、0 console error
  - 文法四選一（grammar cloze）已上線: 頂部「單字/文法」大切換、文法獨立 SRS；例句挖空選句型、振假名 ruby、中文意思提示。web/js/modes/grammar-cloze.js（gradeCloze/furiganaToRuby）+ build_grammar_cloze.py（驗證/輸出）+ store content 設定 + app/ui/css。spec/plan 於 docs/superpowers/。opus 終審 Ready、修了 reset-in-grammar desync。
    - 題庫: 目前只生了 N3 fixture（39 題，agent 生成＋對抗式審稿，抓掉 10 個雙解誘答）→ web/data/grammar_n3.json。N5/N4/N2/N1 仍是空陣列。**待使用者點頭生五級全量**（用 data/grammar_cloze_items/_source 抽題→generate→adversarial verify→build_grammar_cloze.py）。
    - 小事: renderDone 空池文案寫死「沒有單字」，文法模式下也顯示單字字樣（可改）。
  - 待決定（B、C 子專案）: 句子排列重組（★ 並べ替え，需生成 4 片段題庫）、閱讀（読解，最大、需撰寫文章+題目，獨立專案最後做）
  - 待使用者一次性設定: (1) 給 GitHub PAT workflow scope 才能推 .github/workflows/pages.yml（現為本機提交）+ Pages 來源設 GitHub Actions；(2) 部署 Cloudflare Worker（worker/README.md）+ 填 web/config.js 的 WORKER_URL + 設同步密碼
- 素材: build_vocab_pdf.py / build_grammar_pdf.py（level 參數 n5-n1）、data/(grammar_)<lv>_part*.json、<LV>單字書/文法句型書.pdf、JLPT_N5-N1_*.csv（單字普通+Anki、文法 Anki）
- Blocked / to decide: 每日可投入時數尚未確認（計畫以 4–5h/日為前提）
- Relevant files: STUDY_PLAN.md, N5/N4/N3單字書.pdf, build_vocab_pdf.py, data/n[345]_part*.json
- Note: build_vocab_pdf.py 吃 level 參數（n5/n4/n3）；兩階段建構（先收集頁碼再附索引，索引不進目錄故不位移頁碼）；分類標題／目錄用 Noto Sans CJK（日＋繁全包，OTF→TTF 自動轉檔快取於 assets/fonts，已 gitignore），本文日文用 IPAGothic。2923 詞例句經 20 個 agent 審稿

---

<!--
History lives in `git log`. Keep only the "Current" block here, always short.
To pick up work: read this section + `git log --oneline -15`.
-->
