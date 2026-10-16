import { Audio } from "@remotion/media";
import { interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import catalog from "../../../public/sfx/catalog.json";

/**
 * One real sound effect from the curated Pixabay library (public/sfx,
 * scripts/fetch-sfx.mjs). Every file is levelled from its measured loudness
 * to `level` LUFS so a whoosh and a deep hit sit at the same height under
 * the VO (−14 LUFS). Default −15 (Lucas 2026-10-08: −26 and −18 were too quiet): an accent at about voice level.
 *
 *   <Sfx file="sfx/whoosh/clean-whoosh-382726.mp3" at={at("12")} />
 */
export const Sfx: React.FC<{ file: string; at: number; level?: number }> = ({
  file,
  at,
  level = -15,
}) => {
  const entry = catalog.find((c) => c.file === file);
  if (!entry) throw new Error(`SFX not in public/sfx/catalog.json: ${file}`);
  const gain = Math.min(4, 10 ** ((level - (entry.lufs ?? level)) / 20));
  return (
    <Sequence from={Math.round(at)} name={`SFX ${entry.title}`} layout="none">
      <Audio src={staticFile(file)} volume={gain} />
    </Sequence>
  );
};

/** [file under sfx/, VO line id, fraction through the line, frame offset, LUFS level] */
export type SfxCue = [string, string, number?, number?, number?];

/** A whole SFX track cued from the VO timing (same cues as the visuals). */
export const SfxCues: React.FC<{
  timing: { lines: { id: string; start: number; end: number }[] };
  cues: SfxCue[];
}> = ({ timing, cues }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cues.map(([file, id, k = 0, off = 0, level], i) => {
        const l = timing.lines.find((x) => x.id === id);
        if (!l) throw new Error(`SFX cue: no VO line ${id}`);
        const at = (l.start + (l.end - l.start) * k) * fps + off;
        return <Sfx key={i} file={`sfx/${file}`} at={Math.max(0, at)} level={level} />;
      })}
    </>
  );
};

/**
 * Licensed music bed from the catalog (public/sfx/music, Pixabay Content License), levelled from
 * its measured loudness to `level` LUFS (−28 ≈ the old bed-bright at volume 0.2, ~14 dB under
 * the VO before mastering). Short fades at both ends keep the loop seam soft; `duck(frame)`
 * (0–1) dips it, e.g. under a climax. Tracks are longer than the episodes, so no loop.
 *
 *   <MusicBed file={PILLAR_MUSIC.P2} duck={(f) => …} />
 */
export const MusicBed: React.FC<{ file: string; level?: number; duck?: (f: number) => number }> = ({
  file,
  level = -28,
  duck = () => 1,
}) => {
  const { durationInFrames, fps } = useVideoConfig();
  const entry = catalog.find((c) => c.file === file);
  if (!entry) throw new Error(`Music not in public/sfx/catalog.json: ${file}`);
  const gain = Math.min(4, 10 ** ((level - (entry.lufs ?? level)) / 20));
  const fade = Math.round(0.3 * fps);
  return (
    <Audio
      name={`Music ${entry.title}`}
      src={staticFile(file)}
      volume={(f) =>
        gain * duck(f) * interpolate(f, [0, fade, durationInFrames - fade, durationInFrames], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      }
    />
  );
};

/** One music bed per pillar. Still the Atlas Tí Hon picks (keys = Atlas pillars); re-pick for the Inset Maps pillars at the pilot. */
export const PILLAR_MUSIC = {
  P1: "sfx/music/p1-historical-documentary-music-349042.mp3",
  P2: "sfx/music/p2-explainer-explainer-music-576633.mp3",
  P3: "sfx/music/p3-science-documentary-169621.mp3",
  P4: "sfx/music/p4-cinematic-documentary-115669.mp3",
  P5: "sfx/music/p5-mystery-quirky-355604.mp3",
} as const;
