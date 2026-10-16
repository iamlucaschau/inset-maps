"""
Frame review of a rendered episode (Lucas 2026-10-16: after the render, Luis checks every
frame and fixes what looks bad before handing the video over).

  python -P scripts/review.py <slug> [step_seconds]   (default step 0.5 s; reads Map/<slug>/<slug>.mp4)

Writes out/review/<slug>/sheet-NN.png: contact sheets, 6 × 3 thumbnails each, labelled with the
time and frame number, with the 9:16 safe zone (x 60–940, y 220–1440) drawn on every thumbnail.
Prints the checks that need no eyes:
- freezes: stretches where the picture does not change for > 2 s (ffmpeg freezedetect)
- seam: how much the last frame differs from the first (soft loop; the first subtitle is expected)
Then look at every sheet; a thumbnail that looks wrong → render that frame full size:
  npx remotion still <CompositionId> out/check.png --frame=<n> --props='{"safeGuide":true}'
Needs: ffmpeg, pip install pillow numpy.
"""
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

root = Path(__file__).resolve().parent.parent
slug = sys.argv[1]
step = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
video = root / "Map" / slug / f"{slug}.mp4"
out = root / "out" / "review" / slug
frames = out / "frames"
frames.mkdir(parents=True, exist_ok=True)
for old in frames.glob("*.png"):
    old.unlink()

# 1. thumbnails every `step` seconds
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf", f"fps=1/{step},scale={W}:{H}", str(frames / "%04d.png")], check=True)
thumbs = sorted(frames.glob("*.png"))

# 2. contact sheets with time / frame labels and the safe zone
k = W / 1080
per = COLS * ROWS
for s in range(0, len(thumbs), per):
    sheet = Image.new("RGB", (COLS * W, ROWS * (H + 22)), "white")
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(thumbs[s : s + per]):
        n = s + i
        t = n * step
        x, y = (i % COLS) * W, (i // COLS) * (H + 22)
        sheet.paste(Image.open(p), (x, y + 22))
        d.rectangle([x + SAFE[0] * k, y + 22 + SAFE[1] * k, x + SAFE[2] * k, y + 22 + SAFE[3] * k], outline=(255, 0, 255))
        d.text((x + 4, y + 5), f"{t:5.1f}s  f{round(t * FPS)}", fill="black")
    sheet.save(out / f"sheet-{s // per + 1:02d}.png")

# 3. freezes > 2 s
log = subprocess.run(["ffmpeg", "-i", str(video), "-vf", "freezedetect=n=0.002:d=2", "-map", "0:v", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
starts = [float(v) for v in re.findall(r"freeze_start: ([\d.]+)", log)]
ends = [float(v) for v in re.findall(r"freeze_end: ([\d.]+)", log)]

# 4. loop seam: first vs last frame
def grab(args):
    """Last decoded frame of the selection, grey, thumbnail size."""
    raw = subprocess.run(["ffmpeg", "-v", "error", *args, "-i", str(video), "-vf", f"scale={W}:{H}", "-f", "rawvideo",
                          "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw[-W * H :], np.uint8).astype(float)

seam = np.abs(grab(["-t", "0.01"]) - grab(["-sseof", "-0.5"]))

print(f"{len(thumbs)} thumbnails every {step} s → {out.relative_to(root)}/sheet-*.png")
print("freezes > 2 s:", ", ".join(f"{a:.1f}–{b:.1f} s" for a, b in zip(starts, ends + [None] * len(starts)) if b) or "none")
print(f"seam: {100 * (seam > 30).mean():.2f} % of pixels differ (≈ 1–2 % = only the first subtitle; more → look at the seam)")
