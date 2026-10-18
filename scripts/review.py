"""
Frame review of a rendered episode (Lucas 2026-10-16: after the render, Luis checks every
frame and fixes what looks bad before handing the video over). Checklist: .claude/skills/review-loop.

  python -P scripts/review.py <slug>                       thumbnails every 0.5 s (whole video)
  python -P scripts/review.py <slug> --beats               one per VO line, 0.3 s after it starts (motion has settled)
  python -P scripts/review.py <slug> --from 3 --to 5 --every 0.2    scrub one moment (a flight, a pop)
  python -P scripts/review.py <slug> --at 3.7 3.75 3.8     exact times
  python -P scripts/review.py <slug> --video out/x.mp4     another file (default Map/<slug>/<slug>.mp4)

Writes out/review/<slug>/sheet-NN.png: contact sheets, 6 × 3 thumbnails each, labelled with the
time and frame number (and the VO line id with --beats), with the 9:16 safe zone (x 60–940,
y 220–1440) drawn on every thumbnail. Prints the checks that need no eyes:
- frame 0: must be a real picture (it is the thumbnail of muted autoplay), not black
- freezes: stretches where the picture does not change for > 2 s (ffmpeg freezedetect)
- seam: how much the last frame differs from the first (soft loop; the first subtitle is expected)
Then look at every sheet; a thumbnail that looks wrong → render that frame full size:
  npx remotion still <CompositionId> out/check.png --frame=<n> --props='{"safeGuide":true}'
Needs: ffmpeg, pip install pillow numpy.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

FPS = 30
W, H = 270, 480  # thumbnail = 1/4 of 1080×1920
COLS, ROWS = 6, 3
SAFE = (60, 220, 940, 1440)
SETTLE = 0.3  # --beats: sample this long after a line starts
sys.stdout.reconfigure(encoding="utf-8")  # Windows console: arrows, ±, …

root = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument("slug")
ap.add_argument("--step", type=float, default=0.5)
ap.add_argument("--beats", action="store_true")
ap.add_argument("--from", dest="t0", type=float)
ap.add_argument("--to", dest="t1", type=float)
ap.add_argument("--every", type=float, default=0.2)
ap.add_argument("--at", type=float, nargs="+")
ap.add_argument("--video")
a = ap.parse_args()

video = Path(a.video) if a.video else root / "Map" / a.slug / f"{a.slug}.mp4"
out = root / "out" / "review" / a.slug
frames = out / "frames"
frames.mkdir(parents=True, exist_ok=True)
for old in [*frames.glob("*.png"), *out.glob("sheet-*.png")]:
    old.unlink()

# 1. which times, with an optional label each
if a.beats:
    timing = json.loads((root / "src" / "voiceover" / f"{a.slug}.timing.json").read_text(encoding="utf-8"))
    picks = [(line["start"] + SETTLE, line["id"]) for line in timing["lines"]]
elif a.at:
    picks = [(t, "") for t in a.at]
elif a.t0 is not None:
    t1 = a.t1 if a.t1 is not None else a.t0 + 2
    picks = [(round(a.t0 + i * a.every, 3), "") for i in range(int((t1 - a.t0) / a.every + 1e-6) + 1)]
else:
    picks = None

if picks is None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf", f"fps=1/{a.step},scale={W}:{H}", str(frames / "%04d.png")], check=True)
    thumbs = sorted(frames.glob("*.png"))
    picks = [(i * a.step, "") for i in range(len(thumbs))]
else:
    thumbs = []
    for i, (t, _) in enumerate(picks):
        p = frames / f"{i + 1:04d}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1", "-vf", f"scale={W}:{H}", str(p)], check=True)
        thumbs.append(p)
    # times past the end of the file give no frame (e.g. a draft shorter than the VO timing)
    late = [t for (t, _), p in zip(picks, thumbs) if not p.exists()]
    if late:
        print(f"skipped {len(late)} time(s) past the end of the video: {', '.join(f'{t:.2f}' for t in late)}")
    picks, thumbs = map(list, zip(*[(k, p) for k, p in zip(picks, thumbs) if p.exists()])) if len(late) < len(thumbs) else ([], [])

# 2. contact sheets with time / frame labels and the safe zone
k = W / 1080
per = COLS * ROWS
for s in range(0, len(thumbs), per):
    sheet = Image.new("RGB", (COLS * W, ROWS * (H + 22)), "white")
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(thumbs[s : s + per]):
        t, label = picks[s + i]
        x, y = (i % COLS) * W, (i // COLS) * (H + 22)
        sheet.paste(Image.open(p), (x, y + 22))
        d.rectangle([x + SAFE[0] * k, y + 22 + SAFE[1] * k, x + SAFE[2] * k, y + 22 + SAFE[3] * k], outline=(255, 0, 255))
        d.text((x + 4, y + 5), f"{t:6.2f}s  f{round(t * FPS)}  {label}", fill="black")
    sheet.save(out / f"sheet-{s // per + 1:02d}.png")


def grab(args):
    """Last decoded frame of the selection, grey, thumbnail size."""
    raw = subprocess.run(["ffmpeg", "-v", "error", *args, "-i", str(video), "-vf", f"scale={W}:{H}", "-f", "rawvideo",
                          "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw[-W * H :], np.uint8).astype(float)


# 3. frame 0 is the muted-autoplay thumbnail: it must show the picture
first = grab(["-t", "0.01"])
# 4. freezes > 2 s
log = subprocess.run(["ffmpeg", "-i", str(video), "-vf", "freezedetect=n=0.002:d=2", "-map", "0:v", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
starts = [float(v) for v in re.findall(r"freeze_start: ([\d.]+)", log)]
ends = [float(v) for v in re.findall(r"freeze_end: ([\d.]+)", log)]
# 5. loop seam: first vs last frame
seam = np.abs(first - grab(["-sseof", "-0.5"]))

print(f"{len(thumbs)} thumbnails → {out.relative_to(root)}/sheet-*.png")
print(f"frame 0: mean brightness {first.mean():.0f}/255, {'OK' if first.mean() > 12 and first.std() > 8 else 'LOOKS EMPTY: frame 0 must be a real picture'}")
print("freezes > 2 s:", ", ".join(f"{s0:.1f}–{s1:.1f} s" for s0, s1 in zip(starts, ends + [None] * len(starts)) if s1) or "none")
print(f"seam: {100 * (seam > 30).mean():.2f} % of pixels differ (≈ 1–2 % = only the first subtitle; more → look at the seam)")
