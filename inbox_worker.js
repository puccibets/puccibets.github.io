// Cloudflare Worker to append to tweet inbox.
// Env vars (set in the Worker dashboard, not in the repo):
// - INBOX_PASSWORD: the password you type into inbox.html
// - GITHUB_TOKEN: fine-grained PAT with contents:read/write on the repo
// - REPO_OWNER: e.g., "puccibets"
// - REPO_NAME: e.g., "puccibets.github.io"

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response("ok", { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("POST only", { status: 405, headers: corsHeaders });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }

    const { url, note = "", password } = body || {};
    if (!password || password !== env.INBOX_PASSWORD) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    if (!url || typeof url !== "string") {
      return new Response("Missing url", { status: 400, headers: corsHeaders });
    }

    const owner = env.REPO_OWNER || "puccibets";
    const repo = env.REPO_NAME || "puccibets.github.io";
    const path = "tweet_archive/inbox.json";
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "tweet-inbox-worker",
      Accept: "application/vnd.github+json"
    };

    const nowIso = new Date().toISOString();
    const newItem = { url, note, addedAt: nowIso };

    const getResp = await fetch(apiUrl, { headers });
    let sha = null;
    let items = [];
    let version = 1;

    if (getResp.status === 200) {
      const existing = await getResp.json();
      sha = existing.sha;
      try {
        const decoded = atob(existing.content.replace(/\n/g, ""));
        const parsed = JSON.parse(decoded);
        items = Array.isArray(parsed?.items) ? parsed.items : [];
        version = parsed.version || 1;
      } catch {
        // fall back to empty list
      }
    } else if (getResp.status !== 404) {
      return new Response("Failed to fetch inbox", { status: 502, headers: corsHeaders });
    }

    const next = {
      version,
      items: [newItem, ...items]
    };

    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(next, null, 2))));
    const putResp = await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "Add tweet to inbox",
        content: encoded,
        sha
      })
    });

    if (!putResp.ok) {
      const text = await putResp.text();
      return new Response(text || "Failed to update inbox", { status: 502, headers: corsHeaders });
    }

    return new Response("ok", { status: 200, headers: corsHeaders });
  }
};
