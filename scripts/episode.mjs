#!/usr/bin/env node
/**
 * Poor vs Rich Daily episode helpers.
 *
 *   node scripts/episode.mjs prep   "Poor vs Rich Daily/episodes/ep01-buy-their-tools"
 *     Reads kich-ban-*-FINAL.md (English VO) + 01_EPISODE-SPEC_*.md, checks the
 *     spec's VO matches the FINAL script word for word, and writes
 *     voiceover/<slug>.json (one line per sentence, tagged with its scene).
 *
 *   node scripts/episode.mjs export "Poor vs Rich Daily/episodes/ep01-buy-their-tools"
 *     After `npm run voiceover -- voiceover/<slug>.json`: lays the lines out with
 *     their pauses, writes <episode>/vo.mp3 (local listening copy, git-ignored) + vo-timestamps.md, and
 *     src/voiceover/<slug>.timing.json for Remotion. Add --loop when the script
 *     ends on a fragment that runs into the hook (no end hold, style library §2.5).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Pauses after a line, in seconds. Tune here, then re-run `export`. */
const GAP = { sentence: 0.15, paragraph: 0.35, scene: 0.6 };
const LEAD = 0.3; // silence before the first line
const LOOP_LEAD = 0.05; // loop endings: the replay must join the last word with no gap
const MAX_TAKE = 8; // sentences per TTS request (keeps pause-splitting reliable)

const norm = (s) => s.replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

const episode = (dir) => {
  const abs = path.resolve(ROOT, dir);
  const files = fs.readdirSync(abs);
  const find = (re) => {
    const f = files.find((x) => re.test(x));
    if (!f) throw new Error(`No file matching ${re} in ${dir}`);
    return path.join(abs, f);
  };
  return {
    abs,
    slug: path.basename(abs).replace(/^ep\d+-/, ""),
    name: path.basename(abs),
    script: find(/^kich-ban-.*-FINAL\.md$/),
    spec: find(/^01_EPISODE-SPEC_.*\.md$/),
  };
};

/** English VO paragraphs between "## VOICEOVER (English)" and the next "---". */
const finalParagraphs = (md) => {
  const start = md.indexOf("## VOICEOVER (English)");
  if (start < 0) throw new Error("FINAL script has no '## VOICEOVER (English)' section");
  const body = md.slice(start).split("\n---")[0].split("\n").slice(1);
  return body
    .join("\n")
    .split(/\n\s*\n/)
    .map(norm)
    .filter((p) => p && !p.startsWith("**[") && !p.startsWith("["));
};

const sentences = (p) => p.split(/(?<=[.!?])\s+/).filter(Boolean);

const prep = (dir) => {
  const ep = episode(dir);
  const paras = finalParagraphs(fs.readFileSync(ep.script, "utf8"));
  const scenes = [...fs.readFileSync(ep.spec, "utf8").matchAll(/^## SCENE (\d+)[^\n]*\n- \*\*VO:\*\* "(.+)"\s*$/gm)].map(
    (m) => ({ n: Number(m[1]), vo: norm(m[2]) }),
  );
  if (!scenes.length) throw new Error("Spec has no '## SCENE n' blocks with '- **VO:** \"...\"'");

  // Walk FINAL paragraphs through the spec scenes; both must consume each other exactly.
  const lines = [];
  let s = 0;
  let consumed = "";
  paras.forEach((para, pi) => {
    const expected = scenes[s]?.vo ?? "";
    const next = norm(`${consumed} ${para}`);
    if (!expected.startsWith(next)) {
      throw new Error(
        `Spec SCENE ${scenes[s]?.n ?? "?"} VO does not match the FINAL script at:\n  "${para}"\nFix the spec (the FINAL script is locked).`,
      );
    }
    const sent = sentences(para);
    sent.forEach((text, k) =>
      lines.push({ scene: `s${scenes[s].n}`, text, para: pi, last: k === sent.length - 1 }),
    );
    consumed = next;
    if (consumed === expected) {
      lines[lines.length - 1].sceneEnd = true;
      s++;
      consumed = "";
    }
  });
  if (s !== scenes.length) throw new Error(`FINAL script ended inside SCENE ${scenes[s].n}`);

  // Pauses: series defaults, or a tighter set from the episode's VO json ("gaps": {sentence, paragraph, scene}).
  const voPathEarly = path.join(ROOT, "voiceover", `${ep.slug}.json`);
  const gaps = { ...GAP, ...(fs.existsSync(voPathEarly) ? JSON.parse(fs.readFileSync(voPathEarly, "utf8")).gaps ?? {} : {}) };

  // Group into TTS takes: within a scene, at paragraph boundaries, ≤ MAX_TAKE sentences.
  let take = 0;
  let inTake = 0;
  const out = lines.map((l, i) => {
    const prev = lines[i - 1];
    const paraStart = !prev || prev.para !== l.para;
    const paraLen = lines.filter((x) => x.para === l.para).length;
    if (!prev || prev.scene !== l.scene || (paraStart && inTake + paraLen > MAX_TAKE)) {
      take++;
      inTake = 0;
    }
    inTake++;
    return {
      id: String(i + 1).padStart(2, "0"),
      scene: l.scene,
      take: `t${String(take).padStart(2, "0")}`,
      gapAfter: l.sceneEnd ? gaps.scene : l.last ? gaps.paragraph : gaps.sentence,
      text: l.text,
    };
  });

  const words = out.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const voPath = path.join(ROOT, "voiceover", `${ep.slug}.json`);
  const existing = fs.existsSync(voPath) ? JSON.parse(fs.readFileSync(voPath, "utf8")) : {};
  const json = {
    name: ep.slug,
    model: existing.model ?? "gemini-3.8-flash-tts",
    voice: existing.voice ?? "Orus",
    style:
      existing.style ??
      // Series voice direction (bible §6, 2026-10-07). Keep tempo 1.0: forcing speed kills the emotion.
      "You are a seasoned storyteller narrating a short documentary-style money lesson for adults. Warm, grounded, human, like telling a friend a hard truth over coffee. Unhurried natural pace. Slow down on every number and let it land. Take a small pause before the punchline. A hint of dry irony about the mistake. Never rushed, never shouty, never robotic.",
    trimSilence: true,
    tempo: existing.tempo ?? 1,
    ...(existing.gaps && { gaps: existing.gaps }),
    batchBy: "take",
    // keep hand-tuned pauses (e.g. a beat after "Không.") for lines whose text did not change
    lines: out.map((l) => {
      const old = existing.lines?.find((x) => x.id === l.id && x.text === l.text);
      return old ? { ...l, gapAfter: old.gapAfter } : l;
    }),
  };
  fs.writeFileSync(voPath, JSON.stringify(json, null, 2) + "\n");
  console.log(
    `✓ VO matches spec (${scenes.length} scenes). ${out.length} sentences, ${words} words, ${take} TTS requests → ${path.relative(ROOT, voPath)}`,
  );
};

const exportVo = (dir) => {
  const ep = episode(dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "voiceover", `${ep.slug}.json`), "utf8"));
  const sr = 24000;
  const chunks = [];
  const rows = [];
  const lead = process.argv.includes("--loop") ? LOOP_LEAD : LEAD;
  // --tail=0.7: music-only seconds after the last word (map "soft loop", Lucas 2026-10-14: the VO ends
  // on a whole sentence and the picture returns to the opening frame in the tail)
  const tail = Number(process.argv.find((x) => x.startsWith("--tail="))?.slice(7)) || 0;
  let t = lead;
  chunks.push(Buffer.alloc(Math.round(lead * sr) * 2));
  for (const line of manifest.lines) {
    const wav = fs.readFileSync(path.join(ROOT, "public", line.src));
    const pcm = wav.subarray(44);
    rows.push({ id: line.id, scene: line.scene, start: t, end: t + line.durationInSeconds, text: line.text });
    chunks.push(pcm, Buffer.alloc(Math.round(line.gapAfter * sr) * 2));
    t += pcm.length / 2 / sr + line.gapAfter;
  }
  const pcm = Buffer.concat(chunks);
  const words = manifest.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const total = pcm.length / 2 / sr;

  const mp3 = path.join(ep.abs, "vo.mp3");
  const ff = spawnSync(
    process.env.FFMPEG_PATH ?? "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ar", String(sr), "-ac", "1", "-i", "pipe:0",
      "-af", "acompressor=threshold=-24dB:ratio=3:attack=5:release=80:makeup=3,loudnorm=I=-14:TP=-1.5:LRA=20,volume=1.2dB,alimiter=limit=0.79:attack=2:release=50:level=false", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k", mp3],
    { input: pcm, maxBuffer: 512 * 1024 * 1024 },
  );
  if (ff.status !== 0) throw new Error(`ffmpeg failed: ${ff.stderr?.toString()}`);
  // Remotion reads it from public/
  fs.copyFileSync(mp3, path.join(ROOT, "public", "voiceover", ep.slug, "vo.mp3"));

  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
  const md = [
    `# VO timestamps — ${ep.name}`,
    "",
    `Voice: ${manifest.lines[0]?.voice} · model: ${manifest.model} · tempo ×${manifest.lines[0]?.tempo ?? 1}`,
    `Duration: **${total.toFixed(2)} s** (${fmt(total)}) · ${words} words · **${Math.round((words / total) * 60)} wpm** overall`,
    "",
    "| # | Scene | Start | End | Text |",
    "|---|-------|-------|-----|------|",
    ...rows.map((r) => `| ${r.id} | ${r.scene.toUpperCase()} | ${fmt(r.start)} | ${fmt(r.end)} | ${r.text.replace(/\|/g, "\\|")} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ep.abs, "vo-timestamps.md"), md);
  fs.writeFileSync(
    path.join(ROOT, "src", "voiceover", `${ep.slug}.timing.json`),
    JSON.stringify({ durationInSeconds: total, ...(process.argv.includes("--loop") && { loop: true }), ...(tail && { tail }), lines: rows }, null, 2) + "\n",
  );
  console.log(`✓ ${path.relative(ROOT, mp3)}  ${total.toFixed(2)}s, ${Math.round((words / total) * 60)} wpm\n✓ vo-timestamps.md`);

  // A batched TTS take is split back into lines at its pauses; when a pause is missed one line
  // swallows part of the next (p4: line 17 at 2.5 words/s, line 18 at 5.7). Flag lines far off the median pace.
  const pace = manifest.lines
    .filter((l) => l.text.split(/\s+/).length >= 5) // "Vì sao?" and loop fragments are naturally off-pace
    .map((l) => ({ id: l.id, wps: l.text.split(/\s+/).length / l.durationInSeconds }));
  const sorted = pace.map((p) => p.wps).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const odd = pace.filter((p) => p.wps < median * 0.7 || p.wps > median * 1.4);
  if (odd.length) {
    console.warn(`⚠ check the split (pace vs median ${median.toFixed(1)} words/s): ${odd.map((p) => `${p.id} ${p.wps.toFixed(1)}`).join(", ")}`);
  }
};

const [cmd, dir] = process.argv.slice(2);
try {
  if (cmd === "prep" && dir) prep(dir);
  else if (cmd === "export" && dir) exportVo(dir);
  else {
    console.log('Usage: node scripts/episode.mjs prep|export "<episode dir>" [--loop] [--tail=0.7]');
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
}
