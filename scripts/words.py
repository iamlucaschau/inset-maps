"""
Word timestamps for karaoke subtitles: runs faster-whisper on an episode's VO
and writes, per VO line, the start time of every spoken word.

  python -P scripts/words.py <slug> [lang]   (lang: en default, vi, …; reads public/voiceover/<slug>/vo.mp3
                                              and src/voiceover/<slug>.timing.json)

Output: src/voiceover/<slug>.words.json  { "<line id>": [t0, t1, ...] } in seconds,
one entry per word Whisper heard inside that line. The subtitle maps displayed
words onto these times by position, so numerals ("1945") and spelled-out VO
("nineteen forty-five") still line up. Needs: pip install faster-whisper numpy.

It also checks the TTS split: a batched take is cut back into lines at its pauses, and a
missed pause makes one line swallow the start of the next (p4 2026-10-13). For every line of
4+ words, the first and last words Whisper heard inside it must match the script.
  python -P scripts/words.py --selftest
"""
import json
import re
import subprocess
import unicodedata
from difflib import SequenceMatcher
import sys
import wave
from pathlib import Path

# spelled-out numbers in the script come back from Whisper as digits ("hai nghìn" -> "2000")
NUMBER_WORDS = set("một hai ba bốn năm sáu bảy tám chín mười mươi mốt tư lăm trăm nghìn ngàn triệu tỷ linh lẻ không rưỡi phẩy "
                   "one two three four five six seven eight nine ten hundred thousand million billion".split())


def norm(w):
    w = unicodedata.normalize("NFD", w.lower().replace("đ", "d"))
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in w if unicodedata.category(c) != "Mn"))


def same(expected, heard):
    if not heard:
        return False
    bare = re.sub(r"[^\w]", "", expected.lower())
    if bare in NUMBER_WORDS and any(c.isdigit() for c in heard):
        return True
    # loose: Whisper often mishears one letter of a Vietnamese syllable ("sa" -> "xa")
    return SequenceMatcher(None, norm(expected), norm(heard)).ratio() >= 0.5


def split_problems(lines, heard_by_line):
    """Lines (4+ words) whose own audio does not start and end with the script's first / last word."""
    bad = []
    for line in lines:
        words = line["text"].split()
        heard = heard_by_line.get(line["id"], [])
        if len(words) < 4 or not heard:
            continue
        if not (same(words[0], heard[0]) and same(words[-1], heard[-1])):
            bad.append(f"{line['id']}: script \"{words[0]} … {words[-1]}\" / heard \"{heard[0]} … {heard[-1]}\"")
    return bad


if sys.argv[1:] == ["--selftest"]:
    good = {"id": "17", "start": 0, "end": 3, "text": "Năm hai nghìn hai mươi ba, Thái Lan lại đưa ra phương án mới."}
    assert split_problems([good], {"17": ["Năm", "2023,", "Thái", "mới."]}) == []
    # its audio ran on into the next line ("…mới, không đào kênh mà xây cầu đất liền.")
    assert split_problems([good], {"17": ["Năm", "2023,", "mới,", "không", "liền."]})
    print("selftest ok")
    sys.exit(0)

import numpy as np  # noqa: E402 (kept below the self-test so it runs without the model)
from faster_whisper import WhisperModel  # noqa: E402

slug = sys.argv[1]
root = Path(__file__).resolve().parent.parent
mp3 = root / "public" / "voiceover" / slug / "vo.mp3"
timing = json.loads((root / "src" / "voiceover" / f"{slug}.timing.json").read_text(encoding="utf-8"))
wav = root / "voiceover" / ".cache" / f"{slug}-16k.wav"
wav.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-ac", "1", "-ar", "16000", str(wav)], check=True)

w = wave.open(str(wav))
audio = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
model = WhisperModel("small", device="cpu", compute_type="int8")
segs, _ = model.transcribe(audio, language=sys.argv[2] if len(sys.argv) > 2 else "en", word_timestamps=True)
heard_words = [(x.start, x.end, x.word.strip()) for s in segs for x in s.words]
heard = [(s, e) for s, e, _ in heard_words]

out = {}
for line in timing["lines"]:
    a, b = line["start"] - 0.08, line["end"] + 0.08
    out[line["id"]] = [round(s, 3) for s, e in heard if a <= (s + e) / 2 <= b]
dst = root / "src" / "voiceover" / f"{slug}.words.json"
dst.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
print(f"OK {dst.relative_to(root)}: {sum(len(v) for v in out.values())} words in {len(out)} lines")
# split check: Whisper on each line's own audio (word timestamps on the full mix are too coarse for 0.06 s gaps)
heard_by_line = {}
for line in timing["lines"]:
    if len(line["text"].split()) < 4:
        continue
    src = root / "public" / "voiceover" / slug / f"{line['id']}.wav"
    tmp = wav.with_name(f"{slug}-{line['id']}-16k.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-ar", "16000", str(tmp)], check=True)
    lw = wave.open(str(tmp))
    clip = np.frombuffer(lw.readframes(lw.getnframes()), np.int16).astype(np.float32) / 32768
    lw.close()
    tmp.unlink()
    lsegs, _ = model.transcribe(clip, language=sys.argv[2] if len(sys.argv) > 2 else "en", word_timestamps=True)
    heard_by_line[line["id"]] = [x.word.strip() for sg in lsegs for x in sg.words]
problems = split_problems(timing["lines"], heard_by_line)
for p in problems:
    print(f"⚠ check the split, {p}")
if problems:
    print("  Listen to these lines; if one swallowed the next, give the later lines their own take in voiceover/<slug>.json and re-run npm run voiceover.")
