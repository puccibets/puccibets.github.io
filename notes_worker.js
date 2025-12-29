// Cloudflare Worker to manage personal notes in GitHub (conflict-safe).
// Env vars (set in the Worker dashboard, not in the repo):
// - NOTES_PASSWORD: the password you type into notes_inbox.html
// - GITHUB_TOKEN: fine-grained PAT with contents:read/write on the repo
// - REPO_OWNER: e.g., "puccibets"
// - REPO_NAME: e.g., "puccibets.github.io"

const NOTES_DIR = "notes";
const ITEMS_DIR = `${NOTES_DIR}/items`;
const MANIFEST_PATH = `${NOTES_DIR}/manifest.json`;

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
  "User-Agent": "notes-worker",
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
  const putResp = await githubPut(MANIFEST_PATH, encoded, "Update notes manifest", env, sha);
  if (putResp.status === 409) {
    return updateManifest(env, mutator, attempt + 1);
  }
  if (!putResp.ok) {
    const text = await putResp.text();
    throw new Error(text || "Failed to write manifest");
  }
  return next;
}

async function addNote(env, title, text) {
  const nowIso = new Date().toISOString();
  const id = makeId();
  const notePayload = { id, title, text, createdAt: nowIso };
  const encodedNote = encodeJson(notePayload);
  const notePath = `${ITEMS_DIR}/${id}.json`;

  const putResp = await githubPut(notePath, encodedNote, "Add note", env);
  if (!putResp.ok) {
    const body = await putResp.text();
    throw new Error(body || "Failed to write note");
  }
  const putJson = await putResp.json();
  const noteSha = putJson?.content?.sha || null;

  await updateManifest(env, (manifest) => {
    const items = Array.isArray(manifest.items) ? manifest.items : [];
    return {
      version: manifest.version || 1,
      items: [{ id, createdAt: nowIso, file: notePath, sha: noteSha }, ...items]
    };
  });
}

async function clearNotes(env) {
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
    await githubDelete(filePath, "Clear note", env, sha);
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

    const { title = "", text = "", password, action = "add" } = body || {};
    if (action !== "add" && action !== "clear") {
      return new Response("Invalid action", { status: 400, headers: corsHeaders });
    }
    if (!password || password !== env.NOTES_PASSWORD) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    if (action === "add" && (!text || typeof text !== "string")) {
      return new Response("Missing text", { status: 400, headers: corsHeaders });
    }

    try {
      if (action === "clear") {
        await clearNotes(env);
      } else {
        await addNote(env, title, text);
      }
      return new Response("ok", { status: 200, headers: corsHeaders });
    } catch (err) {
      return new Response(err?.message || "Failed", { status: 502, headers: corsHeaders });
    }
  }
};
