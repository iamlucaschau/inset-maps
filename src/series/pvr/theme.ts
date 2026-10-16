/** Output format of every Inset Maps episode (9:16 Shorts). Inherited from the original "pvr" series kit. */
export const PVR = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** Hold after the last VO line (tech spec §2). */
  tailSeconds: 1.5,
  /** Loop-ending episodes cut right after the last word so the replay joins seamlessly (style library §2.5). */
  loopTailSeconds: 0.2,
} as const;

/** Side colors (bible §3): POOR always red, RICH always green. */
export const INK = {
  poor: "#D32F2F",
  rich: "#388E3C",
} as const;

/**
 * Platform-UI safe zone for 9:16 (Reels / TikTok / Shorts), Lucas 2026-10-08.
 * Top bar, bottom caption/account/audio/progress stack, right action rail,
 * left edge. Every word, number, face and key shape stays inside
 * x 60–940, y 220–1440. Check with --props='{"safeGuide":true}'.
 */
export const SAFE = { top: 220, bottom: 480, left: 60, right: 140 } as const;
