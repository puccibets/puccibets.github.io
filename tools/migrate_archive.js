#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const ARCHIVE_DIR = path.join(ROOT, "tweet_archive");
const FEED_LIMIT = 200;
const PAGE_SIZE = 500;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function copyIfMissing(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
  }
}

function migrateIndex() {
  const manifestPath = path.join(ARCHIVE_DIR, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    console.log("manifest.json already exists; skipping index sharding");
    return;
  }

  const indexPath = path.join(ARCHIVE_DIR, "index.json");
  if (!fs.existsSync(indexPath)) {
    console.warn("No index.json found; skipping index migration");
    return;
  }

  const data = readJson(indexPath, null);
  const tweets = Array.isArray(data?.tweets) ? data.tweets : [];
  if (!tweets.length) {
    console.warn("index.json has no tweets; skipping index migration");
    return;
  }

  copyIfMissing(indexPath, path.join(ARCHIVE_DIR, "index_legacy.json"));

  const feed = tweets.slice(0, FEED_LIMIT);
  const rest = tweets.slice(FEED_LIMIT);
  const pages = [];

  for (let i = 0; i < rest.length; i += PAGE_SIZE) {
    const chunk = rest.slice(i, i + PAGE_SIZE);
    const pageNum = String(pages.length + 1).padStart(4, "0");
    const relName = path.join("pages", `page-${pageNum}.json`);
    writeJson(path.join(ARCHIVE_DIR, relName), { version: 3, tweets: chunk });
    pages.push({ name: relName, count: chunk.length });
  }

  writeJson(indexPath, { ...data, tweets: feed, version: 3 });
  writeJson(manifestPath, {
    version: 3,
    feedPath: "index.json",
    feedSize: FEED_LIMIT,
    pageDir: "pages",
    pageSize: PAGE_SIZE,
    pages
  });

  console.log(`Migrated index.json into feed (${feed.length}) with ${pages.length} page(s).`);
}

function migrateInbox() {
  const manifestPath = path.join(ARCHIVE_DIR, "inbox", "manifest.json");
  if (fs.existsSync(manifestPath)) {
    console.log("inbox manifest already exists; skipping inbox migration");
    return;
  }

  const inboxPath = path.join(ARCHIVE_DIR, "inbox.json");
  if (!fs.existsSync(inboxPath)) {
    console.warn("No inbox.json found; skipping inbox migration");
    return;
  }

  const data = readJson(inboxPath, { items: [] });
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    console.log("Inbox is empty; writing empty manifest");
    writeJson(manifestPath, { version: 1, items: [] });
    return;
  }

  copyIfMissing(inboxPath, path.join(ARCHIVE_DIR, "inbox_legacy.json"));

  const itemsDir = path.join(ARCHIVE_DIR, "inbox", "items");
  ensureDir(itemsDir);

  const manifestItems = [];
  let counter = 0;

  for (const item of items) {
    const id =
      item.id ||
      (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${counter++}`);
    const payload = {
      id,
      url: item.url || item.tweetUrl || "",
      note: item.note || item.text || "",
      addedAt: item.addedAt || item.createdAt || item.timestamp || null
    };
    const relFile = path.join("inbox", "items", `${id}.json`);
    writeJson(path.join(ARCHIVE_DIR, relFile), payload);
    manifestItems.push({
      id,
      url: payload.url,
      note: payload.note,
      addedAt: payload.addedAt,
      file: relFile
    });
  }

  manifestItems.sort((a, b) => (a.addedAt || "").localeCompare(b.addedAt || "")).reverse();
  writeJson(manifestPath, { version: 1, items: manifestItems });
  console.log(`Migrated ${manifestItems.length} inbox item(s) to per-file storage.`);
}

function main() {
  migrateIndex();
  migrateInbox();
}

main();
