# 同步 Worker 部署（免費，一次性）

1. 註冊免費 Cloudflare 帳號，安裝 Node，然後 `npm i -g wrangler` 並 `wrangler login`。
2. 建 KV：`wrangler kv namespace create KV` → 把回傳的 `id` 貼進 `wrangler.toml` 的 `id`。
3. 在 `worker/` 執行 `wrangler deploy`。
4. 複製部署後的網址（如 `https://vocab-sync.<you>.workers.dev`），貼到 `web/config.js` 的 `WORKER_URL`。
5. 在遊戲設定輸入一組「同步密碼」；另一台裝置輸入同一組即自動合一。

> 安全性：密碼即存取權，刻意從簡（背單字進度低風險）。
