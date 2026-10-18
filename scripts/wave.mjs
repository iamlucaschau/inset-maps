#!/usr/bin/env node
/**
 * Sound check (idea from whaleyxbt/claude-motion, MIT): waveform image with a mark at every VO line
 * start (and any extra cue times), plus loudness and true peak of the file.
 *
 *   node scripts/wave.mjs <slug> [file] [--marks 3.2,7.9]
 *     file: default Map/<slug>/<slug>.mp4 (the mastered episode); a .wav / vo.mp3 works too
 *     --marks: extra times in seconds (e.g. SFX cues) drawn in white
 *
 * Writes out/wave-<slug>.png (1800×280): grey waveform, a faint line each second, coral lines at VO
 * line starts, white lines at --marks. A transient that sits between marks means a hand-typed or stale
 * time. Warns when loudness is outside −14 ±1 LUFS or the true peak is above −1 dBTP.
 * Needs only ffmpeg.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const slug = args[0];
if (!slug) throw new Error("usage: wave.mjs <slug> [file] [--marks t1,t2]");
const file = args[1] && !args[1].startsWith("--") ? args[1] : path.join(ROOT, "Map", slug, `${slug}.mp4`);
const mi = args.indexOf("--marks");
const extra = mi >= 0 ? args[mi + 1].split(",").map(Number) : [];

const timing = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "voiceover", `${slug}.timing.json`), "utf8"));
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
const dur = Number(probe.stdout.trim()) || timing.durationInSeconds;

const Wd = 1800;
const Hd = 280;
const x = (t) => Math.round((t / dur) * Wd);
const lines = (ts, color, w) => ts.map((t) => `drawbox=x=${x(t)}:y=0:w=${w}:h=${Hd}:color=${color}:t=fill`).join(",");
const vo = timing.lines.map((l) => l.start);
const marks = [lines(vo, "0xFF6B4A@0.85", 2), ...(extra.length ? [lines(extra, "0xF4F6F8@0.9", 2)] : [])].join(",");
const filter =
  `[0:a]aformat=channel_layouts=mono,showwavespic=s=${Wd}x${Hd}:colors=0x9AA6B2[w];` +
  `color=c=0x0B1420:s=${Wd}x${Hd}[bg];` +
  `[bg][w]overlay=format=auto,drawgrid=w=${(Wd / dur).toFixed(2)}:h=${Hd}:color=0x2A323C@0.9,${marks}`;
const out = path.join(ROOT, "out", `wave-${slug}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const img = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-filter_complex", filter, "-frames:v", "1", out], { encoding: "utf8" });
if (img.status !== 0) throw new Error(`ffmpeg (waveform) failed: ${img.stderr}`);

const loud = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const summary = loud.slice(loud.lastIndexOf("Summary:"));
const I = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
const TP = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
console.log(`✓ ${path.relative(ROOT, out)}  ${vo.length} VO marks${extra.length ? ` + ${extra.length} cue marks` : ""}`);
console.log(`loudness ${I} LUFS · true peak ${TP} dBTP`);
if (!(Math.abs(I + 14) <= 1)) console.warn(`⚠ loudness outside −14 ±1 LUFS (master step skipped or wrong file?)`);
if (TP > -1) console.warn(`⚠ true peak above −1 dBTP: AAC will clip on some players`);
