/**
 * Karaoke subtitles for the Style Library kits (Lucas 2026-10-10, after the
 * reference videos): a chunk of ≤ 4 words on up to two balanced lines, words
 * turn from "not yet said" to "said" at the moment the VO speaks them, and
 * keywords (*marked* in captions, plus every number) take the accent colour.
 * Word times come from `scripts/words.py` (Whisper on the real VO); without
 * them the line's time is shared out evenly. Each kit supplies the look (Skin).
 */
import { useCurrentFrame, useVideoConfig } from "remotion";

/** said: already spoken · active: being spoken right now · key: keyword / number */
export type SubWord = { text: string; said: boolean; active: boolean; key: boolean };
export type SubSkin = React.FC<{ lines: SubWord[][]; f: number }>;

type Line = { id: string; start: number; end: number; text: string };

const MAX_WORDS = 4;
const MAX_CHARS = 26;
const ONE_LINE = 14;

const parse = (s: string) =>
  s.split(/\s+/).filter(Boolean).map((w) => ({
    text: w.replace(/\*/g, ""),
    key: w.includes("*") || /\d/.test(w),
  }));

/** Split a chunk into two lines of similar length (one line if short). */
const balance = <T extends { text: string }>(ws: T[]): T[][] => {
  const len = (a: T[]) => a.reduce((n, w) => n + w.text.length + 1, -1);
  if (ws.length < 2 || len(ws) <= ONE_LINE) return [ws];
  let best = 1;
  for (let i = 1; i < ws.length; i++) {
    if (Math.abs(len(ws.slice(0, i)) - len(ws.slice(i))) < Math.abs(len(ws.slice(0, best)) - len(ws.slice(best)))) best = i;
  }
  return [ws.slice(0, best), ws.slice(best)];
};

export const KaraokeSubs: React.FC<{
  timing: { lines: Line[] };
  words?: Record<string, number[]>;
  captions?: Record<string, string>;
  Skin: SubSkin;
  /** chunk size; defaults: 4 words / 26 chars on two balanced lines */
  maxWords?: number;
  maxChars?: number;
  oneLine?: boolean;
}> = ({ timing, words = {}, captions = {}, Skin, maxWords = MAX_WORDS, maxChars = MAX_CHARS, oneLine = false }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const lines = timing.lines;
  const i = lines.findIndex((l, k) => t >= l.start - 0.05 && t < (lines[k + 1]?.start ?? l.end + 0.6) - 0.05);
  if (i < 0) return null;
  const line = lines[i];
  const ws = parse(captions[line.id] ?? line.text);
  const heard = words[line.id] ?? [];
  // displayed word k → spoken word at the same relative position
  const at = ws.map((_, k) =>
    heard.length
      ? heard[Math.min(heard.length - 1, Math.floor((k * heard.length) / ws.length))]
      : line.start + ((line.end - line.start) * k) / ws.length,
  );

  // chunks: ≤ MAX_WORDS and ≤ MAX_CHARS
  const chunks: number[][] = [];
  let cur: number[] = [];
  ws.forEach((w, k) => {
    const chars = cur.reduce((n, j) => n + ws[j].text.length + 1, 0) + w.text.length;
    if (cur.length && (cur.length >= maxWords || chars > maxChars)) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(k);
  });
  if (cur.length) chunks.push(cur);
  const c = [...chunks].reverse().find((ch) => t >= at[ch[0]] - 0.05) ?? chunks[0];

  const shown = c.map((k) => ({
    ...ws[k],
    said: t >= at[k] - 0.03,
    active: t >= at[k] - 0.03 && (k === ws.length - 1 || t < at[k + 1] - 0.03),
  }));
  return <Skin lines={oneLine ? [shown] : balance(shown)} f={f} />;
};
