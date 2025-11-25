tweet archive for now, site might expand at some point.

## Inbox (add tweets from phone)
- `tweet_archive/inbox.json` holds queued tweets; the site shows them above archived tweets.
- Use `inbox.html` (static form) to POST `{ url, password }` to your Worker endpoint (`https://puccibets-password-checker.requests-pucci.workers.dev/`). There’s also a “Clear Inbox” button (sends `{ action: "clear", password }`). The password is not stored in GitHub.
- Cloudflare Worker sample: `inbox_worker.js`. Set env vars in the Worker:
  - `INBOX_PASSWORD`: the password you type into the form.
  - `GITHUB_TOKEN`: fine-grained PAT with `contents:read/write` on this repo (only stored in the Worker).
  - `REPO_OWNER`, `REPO_NAME`: defaults to `puccibets` / `puccibets.github.io`.
- Deploy the Worker (free tier is fine), point `inbox.html` at its URL, and type the password when adding items.
- The native host removes matching inbox entries automatically when you archive a tweet on desktop.
