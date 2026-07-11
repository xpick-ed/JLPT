# TODO

## Current  (overwrite this section at every handoff)

- Doing: Phase 1（N4+N3 文法速通，至 8/30）— 見 STUDY_PLAN.md。五級單字書（N5 793/N4 994/N3 1954/N2 1770/N1 1763）＋五級文法句型書（N5 90/N4 122/N3 157/N2 172/N1 130）＋聽力菜單＋N1 計畫皆完成
- Next: 8 月底做 N3 模擬題 → 決定報 N2 或 N3；9 月初完成 LTTC 報名。素材齊全，靠每天執行（聽力見 LISTENING_PLAN.md）；讀解技巧＋考古題於 Phase 3-4
- 待審稿（可選）: N1 單字/文法只做了程式驗證，未經對抗式 agent 審稿（因額度上限中止）；想要時補跑 15 個審稿 agent（同 N2 流程）
- 網頁單字遊戲: 已完成（web/，四模式 配對/打字/四選一/落下 + SM-2 SRS + 密碼同步）。29/29 測試，opus 終審 Ready。設計/計畫於 docs/superpowers/。本機試玩：python3 -m http.server -d web 8000
  - 落下模式（falling.js）: 成對卡下落、點兩張相配消除、3 命落地扣命、成功依耗時記 SRS、漸快、Game Over+再玩一次；發卡用 queue.slice() 快照不動 session 佇列
  - 待決定: 視覺風格目前偏「日系沉穩」，使用者要的是「活潑/鮮明」——待確認是否重上色
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
