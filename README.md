tweet archive for now, site might expand at some point.

## Notes (personal blog)
- Notes live under `notes/` with `notes/manifest.json` and per-note files in `notes/items/`.
- Use `notes_inbox.html` to POST `{ title, text, password }` to your Notes Worker endpoint. There is also a clear action `{ action: "clear", password }`.
- Cloudflare Worker sample: `notes_worker.js`. Set env vars in the Worker:
  - `NOTES_PASSWORD`: the password you type into the form.
  - `GITHUB_TOKEN`: fine-grained PAT with `contents:read/write` on this repo (only stored in the Worker).
  - `REPO_OWNER`, `REPO_NAME`: defaults to `puccibets` / `puccibets.github.io`.

## Inbox (add tweets from phone)
- Inbox is now conflict-safe and lives outside the archive: each queued tweet lives in `inbox/items/<id>.json`, and a manifest at `inbox/manifest.json` lists them. The site reads this manifest. Old `tweet_archive/inbox` paths are still read as a fallback only if the manifest is missing.
- Use `inbox.html` (static form) to POST `{ url, password }` to your Worker endpoint (`https://puccibets-password-checker.requests-pucci.workers.dev/`). There’s also a “Clear Inbox” button (sends `{ action: "clear", password }`). The password is not stored in GitHub.
- Cloudflare Worker sample: `inbox_worker.js`. Set env vars in the Worker:
  - `INBOX_PASSWORD`: the password you type into the form.
  - `GITHUB_TOKEN`: fine-grained PAT with `contents:read/write` on this repo (only stored in the Worker).
  - `REPO_OWNER`, `REPO_NAME`: defaults to `puccibets` / `puccibets.github.io`.
- Deploy the Worker (free tier is fine), point `inbox.html` at its URL, and type the password when adding items.
- The native host removes matching inbox entries automatically when you archive a tweet on desktop.

## Archive layout (scaled for >1k tweets)
- The homepage loads a small feed `tweet_archive/index.json` (latest ~200) and older shards under `tweet_archive/pages/page-XXXX.json` (newest-to-oldest). `tweet_archive/manifest.json` lists the shard files.
- Per-user indices under `tweet_archive/<user>/index.json` remain unchanged.
- Migration helper: `node tools/migrate_archive.js` will split the legacy `index.json` into feed + pages and convert `inbox.json` into per-item files, leaving backups (`index_legacy.json`, `inbox_legacy.json`).
