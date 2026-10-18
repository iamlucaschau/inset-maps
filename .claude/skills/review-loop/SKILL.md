---
name: review-loop
description: Self-review of an Inset Maps episode before calling it done — beat-sampled contact sheets, a pass/fail checklist (frame 0, focal point, reading holds, palette, safe zone, phone width) and a waveform/loudness check. Use after any change to visuals or timing, and always before handing a render to Lucas.
---

# Review loop (Inset Maps)

You cannot watch the video. You look at frames. Adapted from whaleyxbt/claude-motion (MIT) for
9:16 map episodes; channel rules win where they differ (`Map/00_he-thong/01_CHANNEL-BIBLE.md`).

## Steps

1. Render a draft: `npx remotion render <id> out/<slug>-draft.mp4 --scale=0.5`
   (final pass: the mastered `Map/<slug>/<slug>.mp4`).
2. Beat sheets: `python -P scripts/review.py <slug> --beats --video out/<slug>-draft.mp4`
   One frame 0.3 s after each VO line starts (motion has settled), labelled with time, frame and line id.
3. Open **every** sheet and go through the checklist below.
4. Zoom in on anything suspicious:
   - a flight or a pop: `python -P scripts/review.py <slug> --from 31 --to 33 --every 0.2 --video …`
   - exact moments: `--at 12.3 12.4`
   - one frame full size with the safe zone:
     `npx remotion still <id> out/check.png --frame=<n> --props='{"safeGuide":true}'`
5. Fix, re-render, go back to step 2. Stop when a full pass finds nothing.
6. Final: master, then run `python -P scripts/review.py <slug>` (0.5 s sheets + freeze/seam/frame-0 checks) and
   `node scripts/wave.mjs <slug> [--marks <SFX times>]`.

## Checklist (any "no" is a fail)

**Frame 0 / loop**
- Frame 0 is a real picture: the muted-autoplay thumbnail. `review.py` prints a frame-0 check.
- Last frame = first frame (soft loop); the seam check is ≈ 1–2 % (the first subtitle only).

**Composition**
- One focal point per frame. The accent (coral) marks it.
- Nothing readable outside x 60–940, y 220–1440; nothing collides, including mid-flight and inside the inset.
- At most 2 text blocks besides subtitles (an inset's labels count).
- The episode has at least one inset (channel signature).

**Type**
- Key text reads at phone width: look at the ¼-size thumbnails (270 px wide); if you squint, it fails.
- No clipped words. Subtitles 1–3 words, ≤ 18 characters, never two lines.
- Text does not move while it is meant to be read.

**Timing**
- Reading holds: ≥ 1 s for a short phrase, + 0.25 s per word beyond three; the final line ≥ 2 s.
  A beat-sheet thumbnail where a card is still popping or fading means the hold is too short.
- Exits are faster than entrances (≈ half, ease-in: `fadeOut` / `show` in the J kit).
- Only one hero moment (the twist) uses the strongest effect: elastic pop + deep hit. Nothing earlier spends it.
- The picture never freezes > 2 s (`review.py` prints freezes).

**Consistency**
- Colours only from `NIGHT`; each side keeps its colour for the whole episode.
- Recurring elements (tags, pins, cards) look the same in every scene.

**Sound** (`scripts/wave.mjs`)
- Loudness −14 ±1 LUFS, true peak ≤ −1 dBTP (the master targets −2).
- SFX transients sit on their `--marks` lines; a hit between marks = a hand-typed or stale time.
- Real SFX only (Pixabay), max one per beat.

## Report

Say what you checked, what you fixed and which sheet shows each fix. Never claim a fix you have
not re-rendered and looked at.
