// Cloudflare Worker to manage the tweet inbox with per-item files (conflict-free).
// Env vars (set in the Worker dashboard, not in the repo):
// - INBOX_PASSWORD: the password you type into inbox.html
// - GITHUB_TOKEN: fine-grained PAT with contents:read/write on the repo
// - REPO_OWNER: e.g., "puccibets"
// - REPO_NAME: e.g., "puccibets.github.io"

const INBOX_DIR = "inbox";
const ITEMS_DIR = `${INBOX_DIR}/items`;
const MANIFEST_PATH = `${INBOX_DIR}/manifest.json`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const encodeJson = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
const decodeContent = (content) => JSON.parse(atob(content.replace(/\n/g, "")));

const makeId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const githubHeaders = (env) => ({
  Authorization: `Bearer ${env.GITHUB_TOKEN}`,
  "User-Agent": "tweet-inbox-worker",
  Accept: "application/vnd.github+json"
});

const apiUrlFor = (env, path) => {
  const owner = env.REPO_OWNER || "puccibets";
  const repo = env.REPO_NAME || "puccibets.github.io";
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
};

async function githubGet(path, env) {
  const resp = await fetch(apiUrlFor(env, path), { headers: githubHeaders(env) });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GitHub GET ${path}: ${resp.status}`);
  return resp.json();
}

async function githubPut(path, content, message, env, sha) {
  const resp = await fetch(apiUrlFor(env, path), {
    method: "PUT",
    headers: githubHeaders(env),
    body: JSON.stringify({ message, content, sha })
  });
  return resp;
}

async function githubDelete(path, message, env, sha) {
  const resp = await fetch(apiUrlFor(env, path), {
    method: "DELETE",
    headers: githubHeaders(env),
    body: JSON.stringify({ message, sha })
  });
  return resp;
}

async function updateManifest(env, mutator, attempt = 0) {
  if (attempt > 4) throw new Error("Failed to update manifest after retries");
  const current = await githubGet(MANIFEST_PATH, env);
  const sha = current?.sha || null;
  let manifest = { version: 1, items: [] };
  if (current?.content) {
    try {
      manifest = decodeContent(current.content);
    } catch {
      manifest = { version: 1, items: [] };
    }
  }
  const next = mutator(manifest);
  const encoded = encodeJson(next);
  const putResp = await githubPut(MANIFEST_PATH, encoded, "Update inbox manifest", env, sha);
  if (putResp.status === 409) {
    return updateManifest(env, mutator, attempt + 1);
  }
  if (!putResp.ok) {
    const text = await putResp.text();
    throw new Error(text || "Failed to write manifest");
  }
  return next;
}

async function addItem(env, url, note) {
  const nowIso = new Date().toISOString();
  const id = makeId();
  const itemPayload = { id, url, note, addedAt: nowIso };
  const encodedItem = encodeJson(itemPayload);
  const itemPath = `${ITEMS_DIR}/${id}.json`;

  const putResp = await githubPut(itemPath, encodedItem, "Add inbox item", env);
  if (!putResp.ok) {
    const text = await putResp.text();
    throw new Error(text || "Failed to write inbox item");
  }
  const putJson = await putResp.json();
  const itemSha = putJson?.content?.sha || null;

  await updateManifest(env, (manifest) => {
    const items = Array.isArray(manifest.items) ? manifest.items : [];
    return {
      version: manifest.version || 1,
      items: [{ id, url, note, addedAt: nowIso, file: itemPath, sha: itemSha }, ...items]
    };
  });
}

async function clearInbox(env) {
  const current = await githubGet(MANIFEST_PATH, env);
  let items = [];
  if (current?.content) {
    try {
      const parsed = decodeContent(current.content);
      items = Array.isArray(parsed?.items) ? parsed.items : [];
    } catch {
      items = [];
    }
  }

  for (const item of items) {
    const filePath = item?.file || (item?.id ? `${ITEMS_DIR}/${item.id}.json` : null);
    if (!filePath) continue;
    let sha = item.sha;
    if (!sha) {
      const file = await githubGet(filePath, env);
      sha = file?.sha;
    }
    if (!sha) continue;
    await githubDelete(filePath, "Clear inbox item", env, sha);
  }

  await updateManifest(env, () => ({ version: 1, items: [] }));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders });
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

    const { url, note = "", password, action = "add" } = body || {};
    if (action !== "add" && action !== "clear") {
      return new Response("Invalid action", { status: 400, headers: corsHeaders });
    }
    if (!password || password !== env.INBOX_PASSWORD) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    if (action === "add" && (!url || typeof url !== "string")) {
      return new Response("Missing url", { status: 400, headers: corsHeaders });
    }

    try {
      if (action === "clear") {
        await clearInbox(env);
      } else {
        await addItem(env, url, note);
      }
      return new Response("ok", { status: 200, headers: corsHeaders });
    } catch (err) {
      return new Response(err?.message || "Failed", { status: 502, headers: corsHeaders });
    }
  }
};
