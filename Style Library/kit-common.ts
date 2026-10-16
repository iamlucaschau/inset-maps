/**
 * Shared basics for the Style Library kits (F, G, H): 9:16 canvas, platform
 * safe zone, the one sans family, frame-driven progress helpers.
 * E (Map Story) predates this file and stays self-contained.
 */
import { loadFont } from "@remotion/google-fonts/BricolageGrotesque";
import { Easing, interpolate } from "remotion";

export const CANVAS = { width: 1080, height: 1920 } as const;
/** Platform UI (Reels / TikTok / Shorts): keep every word, number and face inside. */
export const SAFE = { top: 220, bottom: 480, left: 60, right: 140 } as const;
/** Centre of the safe zone, x. */
export const CX = (SAFE.left + CANVAS.width - SAFE.right) / 2;
/** Bottom edge of the karaoke subtitle box (bottom line of the safe zone); it grows upward to ≈ y 1250. */
export const SUB_BOTTOM = CANVAS.height - SAFE.bottom - 12;

export const FONT = loadFont("normal", {
  weights: ["700", "800"],
  subsets: ["latin", "latin-ext", "vietnamese"],
}).fontFamily;

export const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** 0→1 over d frames starting at `at` (eased out). */
export const prog = (
  f: number,
  at: number,
  d: number,
  easing: (t: number) => number = Easing.out(Easing.cubic),
) => interpolate(f, [at, at + d], [0, 1], { ...CLAMP, easing });

/** Scale for a quick pop-in with a small overshoot. */
export const pop = (f: number, at: number) =>
  interpolate(f, [at - 0.001, at, at + 5, at + 10], [0, 0.6, 1.06, 1], CLAMP);

/** Visible between `from` and `to` (frames), 4-frame fades. */
export const showing = (f: number, from: number, to = Infinity) =>
  Math.min(prog(f, from, 4), to === Infinity ? 1 : 1 - prog(f, to, 4));
