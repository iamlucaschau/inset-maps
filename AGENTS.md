# AGENTS.md — Inset Maps (kênh bản đồ tiếng Anh)

Hướng dẫn cho AI (Claude Code, Codex, …) làm việc trong dự án này. Đọc hết trước khi làm.

**Kênh:** Inset Maps (@InsetMaps): "The headline changes. The map doesn't."
- Video dọc 9:16 (Shorts / Reels / TikTok), **tiếng Anh (US English)**, cho khán giả Mỹ, Canada, Anh.
- Dài 60–80 s. Mỗi tập giải thích một tin hoặc một sự thật địa chính trị bằng một bản đồ vector tối, một cảnh liền.
- Video là component React render từng khung bằng [Remotion](https://www.remotion.dev) **4.0.532**.

Nguồn sự thật duy nhất: **`Map/00_he-thong/01_CHANNEL-BIBLE.md`**. Nếu file này và Bible khác nhau về luật kênh, Bible thắng.

## Làm việc với Lucas

- Lucas gọi AI là **"Luis"** và viết **tiếng Việt** → trả lời tiếng Việt. Kịch bản, phụ đề, tiêu đề video viết **tiếng Anh**.
- Quy trình **5 cổng** (Bible §11). Hết mỗi cổng **dừng lại chờ "Duyệt Cổng N"**.
  - Tin nóng P1 có làn nhanh: gộp Cổng 1 + 2.
  - Việc nhỏ, hiển nhiên thì tự làm. Chỉ hỏi ở cổng hoặc khi thay đổi ảnh hưởng toàn kênh.
- Khi Lucas hỏi "bạn hiểu ý mình chứ" → tóm lại cách hiểu + các lựa chọn, **chưa làm** cho tới khi Lucas nói làm.
- **Commit / push chỉ khi Lucas bảo.** Trước khi commit, chạy `git status --short` thành **một bước riêng** và đọc kết quả.
  Thấy thư mục mới, video, mp3, key hay tài liệu bên thứ ba → **dừng lại hỏi**. Không bao giờ `--force` khi chưa được đồng ý.
- Báo cáo thật. Số liệu chưa kiểm chứng ghi ⚠️.
- **Kênh riêng, không trộn với Atlas Tí Hon.** Cần code của Atlas thì copy sang đây, không sửa bên Atlas.

## Lệnh

| Việc | Lệnh |
| --- | --- |
| Mở Studio | `npm run dev` → http://localhost:3000 (`.claude/launch.json`: `remotion-studio`) |
| Kiểm tra code | `npm run lint` (sau mỗi thay đổi) |
| Ảnh kiểm tra 1 khung | `npx remotion still <id> out/check.png --frame=<n> --props='{"safeGuide":true}' --scale=0.35` |
| Render tập | `npx remotion render <id> out/<slug>-raw.mp4 --crf=18`, rồi master: `loudnorm=I=-14:TP=-2:LRA=11,aresample=48000,alimiter=limit=0.72:level=false`, AAC 256k, `-movflags +faststart` |
| Soát hình (skill `review-loop`) | `python -P scripts/review.py <slug> --beats` (1 khung / câu VO) · `--from 3 --to 5 --every 0.2` · `--at 12.3` · không cờ = mỗi 0,5 s + kiểm khung 0 / đứng yên / chỗ nối vòng |
| Soát tiếng | `node scripts/wave.mjs <slug> [file] [--marks <giây SFX>]` → `out/wave-<slug>.png` + LUFS / true peak |
| Giọng đọc | `node scripts/episode.mjs prep "Map/<slug>"` → `npm run voiceover -- voiceover/<slug>.json` → `node scripts/episode.mjs export "Map/<slug>" --loop --tail=0.7` → `python -P scripts/words.py <slug> en` |
| Kiểm tra key TTS | `npm run tts:check` (không tốn quota) |

⚠️ Remotion 4.0.532: danh sách khung kiểu `--frames=20,96` có thể lỗi `EINVAL … inline-audio-mixing` → dùng `still` từng khung hoặc dải liên tục.

## Cấu trúc

```
Map/00_he-thong/      01 Channel Bible (định vị, pillar, kịch bản, hình, giọng, luật tin thời sự, xuất bản)
Map/phan-tich-doi-thu/ phân tích đối thủ (CARTOGRAM-EARTH.md)
Map/<slug>/           một tập (sổ nguồn, kịch bản FINAL, spec, Video.tsx, xuat-ban…; mp4 chỉ trên máy)
Style Library/        kit-common.ts, subs.tsx (phụ đề karaoke); I-toy-atlas/toy-atlas.tsx = kit gốc của Atlas, dùng làm lõi cho style J
src/Root.tsx          đăng ký mọi tập (mảng EPISODES)
src/series/pvr/       episode.ts (thời lượng), sfx.tsx (Sfx, MusicBed), safe.tsx (SafeGuide), theme.ts (1080×1920, SAFE)
scripts/              tts.mjs, episode.mjs, words.py, review.py, fetch-sfx.mjs, music-list.json
public/sfx/           SFX + nhạc Pixabay (mp3 chỉ trên máy; catalog.json được commit)
```

**Chưa có, làm ở tập thử P5 Home Turf:**
- **Kit style J:**
  - bảng màu night chart, font Manrope 800;
  - `MeasureTag`, chế độ `flow` cho `Route`, gạch chéo vùng tranh chấp, thẻ ngày.
  - `kit-common.ts` hiện vẫn nạp font Bricolage của Atlas.
- **Nhạc theo pillar mới.**
- **Prompt các cổng bằng tiếng Anh.** Mẫu tham khảo là `Map/00_he-thong/02–04` và `Map/_mau-tap/` bên dự án Atlas Tí Hon.

## Luật Remotion (không được phá)

1. Mọi chuyển động lấy từ `useCurrentFrame()` qua `interpolate`/`spring`/`Easing`. Không CSS transition/animation, không `setTimeout`, không `Math.random()` (dùng `random("seed")`).
2. Thời gian viết theo giây × fps; `from`/`durationInFrames` là số nguyên. Mọi mốc lấy từ thời điểm câu trong giọng đọc.
3. Luôn clamp. Dùng thuộc tính CSS `scale`/`translate`/`rotate`, không chuỗi `transform`.
4. Ảnh / âm thanh trong `public/` qua `staticFile()`; `<Img>`, `<Audio>` của Remotion. Props của composition phải là JSON.

## Luật kênh (tóm tắt, chi tiết ở Bible)

- **Vùng an toàn 9:16:** mọi chữ, số, hình chính trong **x 60–940, y 220–1440**.
- **Camera:** một bản đồ liền; chỉ bay khi đổi nơi (ease in-out, ≥ 20 khung, không vượt đích, không blur) + đẩy chậm ≤ 4 % / 3 s. Không rung, không zoom giật.
- **Chữ:**
  - mỗi khối ≤ 5 từ, ≤ 2 khối cùng lúc ngoài phụ đề, ≥ 48 px;
  - phụ đề karaoke **1–3 từ, ≤ 18 ký tự**;
  - không đưa nguyên câu VO lên màn hình.
- **Kịch bản:** mạch 8 nhịp + 7 luật (Bible §3). Kết bằng câu chữ ký trọn vẹn; nối vòng mềm (khung cuối = khung đầu).
- **Tên nước:** `CountryTag` (tên + cờ + viền loé) cho mọi nước được gọi tên hoặc tô màu.
- **Tin thời sự:** 14 luật ở Bible §8. Mỗi mốc tin cần 2 hãng tin độc lập + văn bản gốc nếu có. Vùng tranh chấp chỉ
  gạch chéo, không tô đặc, và **dừng ở Cổng 2** cho Lucas duyệt cách vẽ.
- **Âm thanh:** chỉ SFX thật (Pixabay, `<Sfx>`, −15 LUFS), tối đa 1 SFX mỗi nhịp. Nhạc nền `MusicBed` −28 LUFS. Master −14 LUFS.

## Giọng đọc (Gemini TTS)

- `scripts/tts.mjs`. **Model khác Atlas Tí Hon** để không tranh quota dù dùng chung key (chọn ở tập thử).
- Thử 5 giọng: Charon, Sadaltager, Iapetus, Rasalgethi, Kore; Lucas chọn một rồi giữ cố định.
- `scripts/episode.mjs` vẫn đặt giọng mặc định `Orus` của Atlas; đổi khi đã chọn giọng.
- Key trong `gemini_key.txt` (không commit, **không in, không log**). Free Tier: 10 request/ngày/key/model.
- Bản thu thô được cache theo nội dung. Đổi tempo, khoảng nghỉ hay bỏ câu cuối của một lượt thì **không tốn request**.

## Kiểm tra trước khi giao

Chạy skill **`review-loop`** (`.claude/skills/review-loop/SKILL.md`) tới khi một vòng soát không còn lỗi: `npm run lint`, sheet theo nhịp, checklist đạt/trượt (khung 0, một điểm nhìn, thời gian đọc, màu, vùng an toàn, bề ngang 360 px), `wave.mjs`. Báo cáo: kiểm gì, sửa gì, sheet nào chứng minh; không nhận đã sửa khi chưa render lại.

## Bản quyền & bảo mật

- Không chép nguyên văn / dịch trọn lời thoại video của kênh khác; chỉ bóc tách cấu trúc bằng lời của mình.
- Không làm diện mạo giống Cartogram Earth (Bible §1).
- Không commit:
  - key;
  - nhạc / SFX Pixabay;
  - video, transcript đối thủ (`Test/`, `Map/doi-thu/`, `Map/phan-tich-doi-thu/_work/`);
  - video render.
- Remotion miễn phí cho cá nhân và công ty ≤ 3 người.
