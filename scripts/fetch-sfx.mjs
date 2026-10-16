#!/usr/bin/env node
/**
 * Downloads the curated Pixabay SFX library into public/sfx/<category>/ and
 * writes public/sfx/catalog.json (id, title, author, seconds, loudness, file).
 *
 *   node scripts/fetch-sfx.mjs <list.json>
 *
 * <list.json>: [[category, pixabayId, "Title by Author", seconds, mp3Url, pageUrl?], …]
 * (collected from pixabay.com/sound-effects or /music detail pages; category "music" holds
 * the background beds). New entries are merged into the existing catalog (same file replaced). Pixabay Content
 * License: free for commercial use in videos, no attribution required; do not
 * redistribute the files on their own, so public/sfx/** audio is git-ignored.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "sfx");
const list = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/ by .*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Integrated loudness (LUFS) so the mix can level SFX consistently. */
const lufs = (file) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "ebur128", "-f", "null", "-"], {
    encoding: "utf8",
  });
  const m = [...(r.stderr ?? "").matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  return m ? Number(m[1]) : null;
};

const catalogFile = path.join(OUT, "catalog.json");
const catalog = fs.existsSync(catalogFile) ? JSON.parse(fs.readFileSync(catalogFile, "utf8")) : [];
const upsert = (entry) => {
  const i = catalog.findIndex((c) => c.file === entry.file);
  if (i >= 0) catalog[i] = entry;
  else catalog.push(entry);
};
for (const [category, id, titleBy, seconds, url, pageUrl] of list) {
  const [, title = titleBy, author = ""] = titleBy.match(/^(.*) by (.*)$/) ?? [];
  const rel = `${category}/${slug(title)}-${id}.mp3`;
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://pixabay.com/" } });
    if (!res.ok) {
      console.warn(`✗ ${rel}: HTTP ${res.status}`);
      continue;
    }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  upsert({
    file: `sfx/${rel}`,
    category,
    title,
    author,
    seconds,
    lufs: lufs(file),
    source: pageUrl ?? `https://pixabay.com/sound-effects/${id}/`,
  });
  console.log(`✓ ${rel}`);
}
fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2) + "\n");
console.log(`${catalog.length} entries → public/sfx/catalog.json`);
