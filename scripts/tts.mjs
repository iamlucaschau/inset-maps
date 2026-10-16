#!/usr/bin/env node
/**
 * Gemini TTS voiceover generator with multi-key rotation.
 *
 *   node scripts/tts.mjs check
 *       Validate every configured key (lists models, uses no quota).
 *
 *   node scripts/tts.mjs say "Text to speak" --out public/voiceover/line.wav
 *       [--voice Kore] [--style "warm and friendly"] [--model gemini-3.8-flash-tts] [--key 2]
 *
 *   node scripts/tts.mjs build voiceover/example.json [--force]
 *       Generate every line of a voiceover script into public/voiceover/<name>/<id>.wav
 *       and write src/voiceover/<name>.json (durations in seconds) for Remotion.
 *       Unchanged lines are skipped (cached by hash) to save quota.
 *
 * Keys are read (first match wins) from:
 *   1. env GEMINI_API_KEYS="key1,key2"  or  GEMINI_API_KEY_1, GEMINI_API_KEY_2, …  or  GEMINI_API_KEY
 *   2. the same variables in a .env file at the project root
 *   3. gemini_key.txt / gemini_key.txt.txt at the project root, one key per line
 *      ("API KEY 1: <key>" or just "<key>")
 * Keys are never printed; logs refer to them as key #1, key #2, …
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULTS = {
  model: "gemini-3.8-flash-tts",
  voice: "Kore",
  style: "",
};
const KEY_FILES = ["gemini_key.txt", "gemini_key.txt.txt"];

// ---------------------------------------------------------------- keys

const keysFromEnv = (env) => {
  if (env.GEMINI_API_KEYS) {
    return env.GEMINI_API_KEYS.split(/[,\s]+/).filter(Boolean);
  }
  const numbered = Object.keys(env)
    .filter((k) => /^GEMINI_API_KEY_\d+$/.test(k))
    .sort((a, b) => Number(a.split("_").pop()) - Number(b.split("_").pop()))
    .map((k) => env[k])
    .filter(Boolean);
  if (numbered.length) return numbered;
  return env.GEMINI_API_KEY ? [env.GEMINI_API_KEY] : [];
};

const parseDotEnv = (file) => {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
};

const loadKeys = () => {
  let keys = keysFromEnv(process.env);
  if (keys.length) return { keys, source: "environment" };

  const dotEnv = path.join(ROOT, ".env");
  if (fs.existsSync(dotEnv)) {
    keys = keysFromEnv(parseDotEnv(dotEnv));
    if (keys.length) return { keys, source: ".env" };
  }

  for (const name of KEY_FILES) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    keys = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.replace(/^[^:]*:\s*/, "").trim())
      .filter(Boolean);
    if (keys.length) return { keys, source: name };
  }
  throw new Error(
    "No Gemini API key found. Set GEMINI_API_KEYS in .env or create gemini_key.txt (see AGENTS.md).",
  );
};

// ---------------------------------------------------------------- api

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Errors worth retrying on another key / later. */
const isRetryable = (status) =>
  status === 429 ||
  status === 401 ||
  status === 403 ||
  status === 408 ||
  status >= 500;

let nextKey = 0;
/** Keys whose daily quota is used up, per model: "model|index". */
const exhausted = new Set();
/** Earliest time (ms) each key may be retried after a per-minute limit. */
const coolDown = new Map();

/** Parse "retry in 8h12m9s" / "retry in 39s" into milliseconds. */
const parseRetryMs = (msg) => {
  const m = msg.match(/retry in ((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i);
  if (!m || !m[1]) return null;
  const part = (u) =>
    Number(m[1].match(new RegExp(`([0-9.]+)${u}`))?.[1] ?? 0);
  return (part("h") * 3600 + part("m") * 60 + part("s")) * 1000;
};

const MAX_ATTEMPTS = 12;

/**
 * Generate speech. Rotates keys round-robin. Per-minute rate limits wait for
 * the server-suggested delay; keys whose daily quota is gone are skipped for
 * the rest of the run; auth and server errors fall through to the next key.
 */
const synthesize = async (keys, { text, voice, style, model, key }) => {
  const body = {
    model,
    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text,
            ...(style
              ? { annotations: [{ type: "speech_metadata", style }] }
              : {}),
          },
        ],
      },
    ],
    response_format: { type: "audio", mime_type: "audio/wav" },
    generation_config: { speech_config: [{ voice }] },
  };

  const order = key
    ? [key - 1]
    : keys.map((_, i) => (nextKey + i) % keys.length);
  nextKey = (nextKey + 1) % keys.length;

  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const usable = order.filter((i) => !exhausted.has(`${model}|${i}`));
    if (!usable.length) {
      throw new Error(
        `Daily quota for ${model} is used up on every key. Last error: ${lastError}`,
      );
    }
    // Prefer the key that is available soonest (round-robin order breaks ties).
    const i = usable.reduce((best, k) =>
      (coolDown.get(k) ?? 0) < (coolDown.get(best) ?? 0) ? k : best,
    );
    const wait = (coolDown.get(i) ?? 0) - Date.now();
    if (wait > 0) {
      console.warn(`  … rate limited, waiting ${Math.ceil(wait / 1000)}s`);
      await sleep(wait);
    }

    let res;
    try {
      res = await fetch(`${API}/interactions`, {
        method: "POST",
        headers: {
          "x-goog-api-key": keys[i],
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = `key #${i + 1}: network error ${err.message}`;
      console.warn(`  ! ${lastError}`);
      coolDown.set(i, Date.now() + 2000 * 2 ** Math.min(attempt, 4));
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const audio = (json.steps ?? [])
        .filter((s) => s.type === "model_output")
        .flatMap((s) => s.content ?? [])
        .filter((c) => c.type === "audio")
        .pop();
      if (!audio?.data) throw new Error(`key #${i + 1}: response had no audio`);
      let buf = Buffer.from(audio.data, "base64");
      if (buf.subarray(0, 4).toString("latin1") !== "RIFF") buf = pcmToWav(buf);
      return { wav: buf, keyIndex: i + 1, usage: json.usage };
    }

    const msg = json.error?.message ?? res.statusText;
    lastError = `key #${i + 1}: HTTP ${res.status} ${msg}`;
    const badKey = res.status === 400 && /api.?key/i.test(msg);
    if (!isRetryable(res.status) && !badKey) throw new Error(lastError);

    if (res.status === 429) {
      const retryMs = parseRetryMs(msg);
      if (/per day/i.test(msg) || (retryMs ?? 0) > 5 * 60 * 1000) {
        exhausted.add(`${model}|${i}`);
        console.warn(`  ! key #${i + 1}: daily quota for ${model} used up, skipping it`);
      } else {
        coolDown.set(i, Date.now() + (retryMs ?? 20000) + 1000);
      }
    } else {
      console.warn(`  ! ${lastError}, trying next key`);
      if (badKey || res.status === 401 || res.status === 403) {
        exhausted.add(`${model}|${i}`);
      } else {
        coolDown.set(i, Date.now() + 2000 * 2 ** Math.min(attempt, 4));
      }
    }
  }
  throw new Error(`Gave up after ${MAX_ATTEMPTS} attempts. Last error: ${lastError}`);
};

// ---------------------------------------------------------------- wav

/** Wrap raw 24 kHz 16-bit mono PCM in a WAV header. */
const pcmToWav = (pcm, sampleRate = 24000, channels = 1, bits = 16) => {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE((sampleRate * channels * bits) / 8, 28);
  h.writeUInt16LE((channels * bits) / 8, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

/** Duration in seconds, read from the WAV chunks. */
const wavDuration = (buf) => {
  let byteRate = 0;
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = buf.toString("latin1", o, o + 4);
    let size = buf.readUInt32LE(o + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(o + 16);
    if (id === "data") {
      // Streaming-style headers may carry a 0/0xFFFFFFFF placeholder size.
      if (size === 0 || size === 0xffffffff || o + 8 + size > buf.length) {
        size = buf.length - o - 8;
      }
      return byteRate ? size / byteRate : 0;
    }
    o += 8 + size + (size % 2);
  }
  return 0;
};

/**
 * Trim leading/trailing silence from a 16-bit PCM WAV, keeping a little
 * padding so consonants aren't clipped. Returns a new WAV buffer.
 */
const trimSilence = (
  buf,
  { thresholdDb = -45, padStart = 0.03, padEnd = 0.08 } = {},
) => {
  let fmt = null;
  let dataStart = -1;
  let dataSize = 0;
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = buf.toString("latin1", o, o + 4);
    let size = buf.readUInt32LE(o + 4);
    if (id === "fmt ") {
      fmt = {
        channels: buf.readUInt16LE(o + 10),
        sampleRate: buf.readUInt32LE(o + 12),
        bits: buf.readUInt16LE(o + 22),
      };
    }
    if (id === "data") {
      if (size === 0 || size === 0xffffffff || o + 8 + size > buf.length) {
        size = buf.length - o - 8;
      }
      dataStart = o + 8;
      dataSize = size;
      break;
    }
    o += 8 + size + (size % 2);
  }
  if (!fmt || fmt.bits !== 16 || dataStart < 0) return buf;

  const frameBytes = fmt.channels * 2;
  const frames = Math.floor(dataSize / frameBytes);
  const threshold = 32768 * 10 ** (thresholdDb / 20);
  const loud = (f) => {
    for (let c = 0; c < fmt.channels; c++) {
      if (Math.abs(buf.readInt16LE(dataStart + f * frameBytes + c * 2)) > threshold) {
        return true;
      }
    }
    return false;
  };
  let first = 0;
  while (first < frames && !loud(first)) first++;
  let last = frames - 1;
  while (last > first && !loud(last)) last--;

  // Gemini sometimes appends a short click after the speech: drop a final
  // burst (< 0.2 s) that follows ≥ 0.25 s of silence.
  const quietRun = Math.round(0.25 * fmt.sampleRate);
  const maxBurst = Math.round(0.2 * fmt.sampleRate);
  for (let k = last, quiet = 0; k > first && last - k < maxBurst + quietRun; k--) {
    quiet = loud(k) ? 0 : quiet + 1;
    if (quiet >= quietRun) {
      if (last - (k + quietRun) < maxBurst) {
        last = k;
        while (last > first && !loud(last)) last--;
      }
      break;
    }
  }
  if (first >= last) return buf;

  const start = Math.max(0, first - Math.round(padStart * fmt.sampleRate));
  const end = Math.min(frames, last + 1 + Math.round(padEnd * fmt.sampleRate));
  const pcm = buf.subarray(dataStart + start * frameBytes, dataStart + end * frameBytes);
  return pcmToWav(Buffer.from(pcm), fmt.sampleRate, fmt.channels, 16);
};

/** Locate the PCM data of a 16-bit WAV. */
const readPcm = (buf) => {
  let fmt = null;
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = buf.toString("latin1", o, o + 4);
    let size = buf.readUInt32LE(o + 4);
    if (id === "fmt ") {
      fmt = {
        channels: buf.readUInt16LE(o + 10),
        sampleRate: buf.readUInt32LE(o + 12),
        bits: buf.readUInt16LE(o + 22),
      };
    }
    if (id === "data") {
      if (size === 0 || size === 0xffffffff || o + 8 + size > buf.length) {
        size = buf.length - o - 8;
      }
      if (!fmt || fmt.bits !== 16) throw new Error("Expected 16-bit PCM WAV");
      const frameBytes = fmt.channels * 2;
      return { ...fmt, dataStart: o + 8, frameBytes, frames: Math.floor(size / frameBytes) };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
};

/**
 * Split one recording of several lines into one WAV per line.
 *
 * Finds pauses (10 ms windows under `thresholdDb`), then picks the pause
 * combination that best matches each line's expected length (proportional to
 * its character count) while preferring longer pauses. This separates lines
 * reliably even when a comma pause is longer than a sentence break.
 */
const splitByPauses = (buf, texts, { thresholdDb = -40, minGap = 0.08, lambda = 1.2 } = {}) => {
  const pcm = readPcm(buf);
  const win = Math.round(pcm.sampleRate * 0.01);
  const windows = Math.floor(pcm.frames / win);
  const silent = new Array(windows);
  for (let w = 0; w < windows; w++) {
    let sum = 0;
    for (let f = w * win; f < (w + 1) * win; f++) {
      const v = buf.readInt16LE(pcm.dataStart + f * pcm.frameBytes);
      sum += v * v;
    }
    silent[w] = 20 * Math.log10(Math.sqrt(sum / win) / 32768 + 1e-9) < thresholdDb;
  }
  const first = silent.indexOf(false);
  const last = silent.lastIndexOf(false);
  const gaps = [];
  for (let w = first; w <= last; ) {
    if (!silent[w]) {
      w++;
      continue;
    }
    let e = w;
    while (e <= last && silent[e]) e++;
    const dur = (e - w) * 0.01;
    if (dur >= minGap) gaps.push({ mid: ((w + e) / 2) * 0.01, dur });
    w = e;
  }

  const t0 = first * 0.01;
  const t1 = Math.min(last + 1, windows) * 0.01;
  const N = texts.length;
  const weights = texts.map((t) => t.replace(/[^A-Za-z0-9]/g, "").length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const expected = weights.map((w) => (w / total) * (t1 - t0));

  let cuts = [];
  if (N > 1) {
    const C = gaps.length;
    if (C < N - 1) throw new Error(`Found ${C} pauses but need ${N - 1} to split ${N} lines`);
    const cost = (a, b, k) => Math.log((b - a) / expected[k]) ** 2;
    const dp = Array.from({ length: N }, () => new Array(C).fill(Infinity));
    const back = Array.from({ length: N }, () => new Array(C).fill(-1));
    for (let c = 0; c < C; c++) dp[1][c] = cost(t0, gaps[c].mid, 0) - lambda * gaps[c].dur;
    for (let k = 2; k < N; k++) {
      for (let c = 0; c < C; c++) {
        for (let p = 0; p < c; p++) {
          const v = dp[k - 1][p] + cost(gaps[p].mid, gaps[c].mid, k - 1) - lambda * gaps[c].dur;
          if (v < dp[k][c]) {
            dp[k][c] = v;
            back[k][c] = p;
          }
        }
      }
    }
    let best = Infinity;
    let at = -1;
    for (let c = 0; c < C; c++) {
      const v = dp[N - 1][c] + cost(gaps[c].mid, t1, N - 1);
      if (v < best) {
        best = v;
        at = c;
      }
    }
    for (let k = N - 1, c = at; k >= 1; c = back[k][c], k--) cuts.unshift(gaps[c].mid);
  }

  const bounds = [0, ...cuts, pcm.frames / pcm.sampleRate];
  return texts.map((text, i) => {
    const a = Math.round(bounds[i] * pcm.sampleRate);
    const b = Math.round(bounds[i + 1] * pcm.sampleRate);
    const slice = buf.subarray(pcm.dataStart + a * pcm.frameBytes, pcm.dataStart + b * pcm.frameBytes);
    const ratio = (bounds[i + 1] - bounds[i]) / expected[i];
    return { wav: pcmToWav(Buffer.from(slice), pcm.sampleRate, pcm.channels, 16), ratio };
  });
};

/**
 * Speed speech up/down without changing pitch (ffmpeg atempo). Uses the
 * ffmpeg on PATH, or FFMPEG_PATH.
 */
const changeTempo = (buf, tempo) => {
  if (!tempo || tempo === 1) return buf;
  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
  const { sampleRate, channels } = readPcm(buf);
  const res = spawnSync(
    ffmpeg,
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-af", `atempo=${tempo}`,
      "-ar", String(sampleRate), "-ac", String(channels), "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"],
    { input: buf, maxBuffer: 512 * 1024 * 1024 },
  );
  if (res.error || res.status !== 0) {
    throw new Error(
      `ffmpeg atempo failed (${res.error?.message ?? res.stderr?.toString().trim()}). Install ffmpeg or set FFMPEG_PATH.`,
    );
  }
  return pcmToWav(res.stdout, sampleRate, channels, 16);
};

// ---------------------------------------------------------------- cli

const parseArgs = (argv) => {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) args[name] = true;
      else args[name] = argv[++i];
    } else args._.push(a);
  }
  return args;
};

const rel = (p) => path.relative(ROOT, p).replaceAll("\\", "/");

const cmdCheck = async (keys) => {
  let ok = 0;
  for (const [i, key] of keys.entries()) {
    const res = await fetch(`${API}/models?pageSize=1000`, {
      headers: { "x-goog-api-key": key },
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      ok++;
      const tts = (json.models ?? [])
        .map((m) => m.name.replace("models/", ""))
        .filter((n) => n.includes("tts"));
      console.log(`✓ key #${i + 1}: valid. TTS models: ${tts.join(", ")}`);
    } else {
      console.log(
        `✗ key #${i + 1}: HTTP ${res.status} ${json.error?.message ?? ""}`,
      );
    }
  }
  if (ok !== keys.length) process.exitCode = 1;
};

const cmdSay = async (keys, args) => {
  const text = args._[1];
  if (!text || !args.out) {
    throw new Error('Usage: tts.mjs say "text" --out public/voiceover/x.wav');
  }
  const out = path.resolve(ROOT, args.out);
  const { wav, keyIndex } = await synthesize(keys, {
    text,
    voice: args.voice ?? DEFAULTS.voice,
    style: args.style ?? DEFAULTS.style,
    model: args.model ?? DEFAULTS.model,
    key: args.key ? Number(args.key) : undefined,
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, wav);
  console.log(
    `✓ ${rel(out)}  ${wavDuration(wav).toFixed(2)}s  (key #${keyIndex})`,
  );
};

const cmdBuild = async (keys, args) => {
  const scriptPath = args._[1];
  if (!scriptPath)
    throw new Error("Usage: tts.mjs build voiceover/<name>.json");
  const script = JSON.parse(
    fs.readFileSync(path.resolve(ROOT, scriptPath), "utf8"),
  );
  const name = script.name ?? path.basename(scriptPath, ".json");
  const audioDir = path.join(ROOT, "public", "voiceover", name);
  const manifestPath = path.join(ROOT, "src", "voiceover", `${name}.json`);
  const previous = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { lines: [] };
  const prevById = new Map(previous.lines.map((l) => [l.id, l]));
  // Raw (unprocessed) TTS output is cached here so trimming/tempo can be
  // changed later without new API requests.
  const rawDir = path.join(ROOT, "voiceover", ".cache", name);
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });

  const trim = script.trimSilence ?? false;
  const tempo = script.tempo ?? 1;
  const postProcess = (wav) => changeTempo(trim ? trimSilence(wav) : wav, tempo);
  // One request in flight per key by default.
  const concurrency = Math.max(1, Number(args.concurrency ?? keys.length));
  const lines = new Array(script.lines.length);
  let failed = 0;

  const optsFor = (line) => ({
    voice: line.voice ?? script.voice ?? DEFAULTS.voice,
    style: line.style ?? script.style ?? DEFAULTS.style,
    model: line.model ?? script.model ?? DEFAULTS.model,
  });

  // Units of work: one request each. With "batchBy" (e.g. "scene"),
  // consecutive lines sharing that field and the same voice/style/model are
  // read in one request (fewer requests, more natural flow), then split.
  const batchBy = script.batchBy;
  const units = [];
  script.lines.forEach((line, index) => {
    const key = JSON.stringify([batchBy ? line[batchBy] : index, optsFor(line)]);
    const lastUnit = units[units.length - 1];
    if (batchBy && lastUnit?.key === key) lastUnit.indices.push(index);
    else units.push({ key, indices: [index] });
  });

  const processUnit = async ({ indices }) => {
    const group = indices.map((i) => script.lines[i]);
    const opts = optsFor(group[0]);
    const texts = group.map((l) => l.text);
    const hash = createHash("sha1")
      .update(JSON.stringify({ ...opts, texts, trim }))
      .digest("hex")
      .slice(0, 12);
    const files = group.map((l) => path.join(audioDir, `${l.id}.wav`));
    // Raw takes are stored per content hash, so regrouping lines and changing back never
    // needs a new request (2026-10-14: a test regroup overwrote p4's cached take).
    const raws = group.map((l) => path.join(rawDir, hash, `${l.id}.wav`));
    fs.mkdirSync(path.join(rawDir, hash), { recursive: true });
    // older cache layout: <rawDir>/<id>.wav, valid while the manifest still has this hash
    group.forEach((l, k) => {
      const legacy = path.join(rawDir, `${l.id}.wav`);
      if (!fs.existsSync(raws[k]) && fs.existsSync(legacy) && prevById.get(l.id)?.hash === hash) fs.copyFileSync(legacy, raws[k]);
    });
    // a take that only lost its last lines (e.g. a dropped loop fragment) reuses the longer take's
    // raws: same options, our texts are a prefix of the old take's texts (checked by re-hashing)
    const oldHash = prevById.get(group[0].id)?.hash;
    if (oldHash && oldHash !== hash) {
      const oldTexts = previous.lines.filter((l) => l.hash === oldHash).map((l) => l.text);
      const same = createHash("sha1").update(JSON.stringify({ ...opts, texts: oldTexts, trim })).digest("hex").slice(0, 12) === oldHash;
      if (same && texts.every((t, k) => t === oldTexts[k])) {
        group.forEach((l, k) => {
          const old = path.join(rawDir, oldHash, `${l.id}.wav`);
          if (!fs.existsSync(raws[k]) && fs.existsSync(old)) fs.copyFileSync(old, raws[k]);
        });
      }
    }
    const label =
      group.length > 1
        ? `${group[0].id}–${group[group.length - 1].id}`
        : group[0].id;

    // Older builds kept no raw copy; their (already trimmed) output is a
    // fine stand-in because trimming twice is a no-op.
    group.forEach((l, k) => {
      if (!fs.existsSync(raws[k]) && fs.existsSync(files[k]) && prevById.get(l.id)?.hash === hash && !prevById.get(l.id)?.tempo) {
        fs.copyFileSync(files[k], raws[k]);
      }
    });
    const cached =
      !args.force &&
      group.every((_, k) => fs.existsSync(raws[k]));

    try {
      let parts;
      let source;
      if (cached) {
        parts = raws.map((f) => ({ wav: fs.readFileSync(f), ratio: 1 }));
        source = "cached";
      } else {
        const result = await synthesize(keys, { ...opts, text: texts.join("\n") });
        parts =
          group.length > 1
            ? splitByPauses(result.wav, texts)
            : [{ wav: result.wav, ratio: 1 }];
        parts.forEach((p, k) => fs.writeFileSync(raws[k], p.wav));
        source = `key #${result.keyIndex}`;
      }
      const notes = [];
      group.forEach((l, k) => {
        const wav = postProcess(parts[k].wav);
        fs.writeFileSync(files[k], wav);
        const durationInSeconds = Number(wavDuration(wav).toFixed(3));
        if (parts[k].ratio < 0.55 || parts[k].ratio > 1.8) {
          notes.push(
            `${l.id} looks ${parts[k].ratio < 1 ? "short" : "long"} (x${parts[k].ratio.toFixed(2)}), check the split`,
          );
        }
        // Extra fields (e.g. "scene") are passed through to the manifest.
        const { text, voice: _v, style: _s, model: _m, ...extra } = l;
        lines[indices[k]] = {
          ...extra,
          id: l.id,
          text,
          voice: opts.voice,
          src: rel(files[k]).replace(/^public\//, ""),
          durationInSeconds,
          tempo,
          hash,
        };
      });
      const secs = indices
        .map((i) => lines[i].durationInSeconds.toFixed(2))
        .join(" + ");
      console.log(`${cached ? "=" : "✓"} ${label}: ${secs}s (${source})`);
      notes.forEach((n) => console.warn(`  ! ${n}`));
    } catch (err) {
      failed += group.length;
      console.error(`✗ ${label}: ${err.message}`);
    }
  };

  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < units.length) {
        await processUnit(units[cursor++]);
      }
    }),
  );
  // Write the manifest even after failures so finished lines stay cached.
  const done = lines.filter(Boolean);
  const manifest = {
    name,
    model: script.model ?? DEFAULTS.model,
    totalSeconds: Number(
      done.reduce((s, l) => s + l.durationInSeconds, 0).toFixed(3),
    ),
    lines: done,
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `\nManifest: ${rel(manifestPath)} (${manifest.totalSeconds}s total)`,
  );
  if (failed) {
    throw new Error(
      `${failed} line(s) failed and the manifest is incomplete. Re-run the same command to retry; finished lines are cached.`,
    );
  }
};

/**
 * Music with Lyria: node scripts/tts.mjs music "<prompt>" --out public/audio/x.mp3 [--model lyria-3.5]
 * Tries each key in turn; saves the first audio returned (MP3 by default).
 */
const cmdMusic = async (keys, args) => {
  const prompt = args._[1];
  if (!prompt || !args.out) throw new Error('Usage: tts.mjs music "prompt" --out file.mp3');
  const model = args.model ?? "lyria-3.5";
  let lastError;
  for (const [i, key] of keys.entries()) {
    const res = await fetch(`${API}/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ model, input: prompt }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastError = `key #${i + 1}: HTTP ${res.status} ${json.error?.message ?? ""}`;
      console.warn(`  ! ${lastError}`);
      continue;
    }
    const audio = (json.steps ?? [])
      .flatMap((s) => s.content ?? [])
      .filter((c) => c.type === "audio" && c.data)
      .pop();
    if (!audio) throw new Error(`key #${i + 1}: no audio in response`);
    const out = path.resolve(ROOT, args.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(audio.data, "base64"));
    console.log(`✓ ${rel(out)} (${audio.mime_type ?? "audio"}, key #${i + 1})`);
    return;
  }
  throw new Error(`All keys failed. Last error: ${lastError}`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const { keys, source } = loadKeys();
  console.log(`Gemini TTS: ${keys.length} key(s) loaded from ${source}\n`);

  if (cmd === "check") return cmdCheck(keys);
  if (cmd === "say") return cmdSay(keys, args);
  if (cmd === "build") return cmdBuild(keys, args);
  if (cmd === "music") return cmdMusic(keys, args);
  console.log(
    'Commands: check | say "text" --out file.wav | build voiceover/<name>.json',
  );
  process.exitCode = 1;
};

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
});
