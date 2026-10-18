# Đề xuất học từ repo `whaleyxbt/claude-motion` (2026-10-17) — Lucas duyệt cả 8, đã áp dụng (giữ SFX thật)

Repo: https://github.com/whaleyxbt/claude-motion (MIT, 443★). Đây là bộ "gu chuyển động" cho AI làm video Remotion:
3 skill (`motion-design`, `review-loop`, `sound-design`), một `timeline.json` chung cho hình + tiếng + kiểm tra,
bộ máy SFX tổng hợp bằng Python, và pipeline mô phỏng web → video 60 fps. Đã đọc README, AGENTS.md, 3 SKILL.md,
`scripts/wave.mjs`, `timeline.json`. Chưa tải / chạy gì.

## Mình đã có (không cần học)

| Họ | Mình |
| --- | --- |
| `timeline.json` gõ tay, hình + tiếng đọc chung | Mốc lấy thẳng từ giọng đọc (`at("id")`), đổi giọng là cả video tự canh lại; tốt hơn |
| Contact sheet + vòng tự soát | `scripts/review.py` (sheet 0,5 s, vùng an toàn, phát hiện khung đứng yên, kiểm chỗ nối vòng) |
| Easing / spring có số | Skill `motion-design` (LottieFiles) + `EASE` presets |
| Master −14 LUFS, đỉnh −2 dBFS | Đã dùng y hệt |
| Thư mục `examples/` lưu prompt + quy trình | Mỗi tập có đủ hồ sơ 5 cổng |

## Mình thiếu, nên học (đề xuất)

| # | Điểm | Học gì | Đụng tới | Công |
| --- | --- | --- | --- | --- |
| 1 | **Checklist soát hình có tiêu chí đạt/trượt** | Viết skill `review-loop` của dự án: khung 0 phải là hình thật (thumbnail khi autoplay tắt tiếng); chữ không được chạy khi người xem đang đọc; một điểm nhìn mỗi khung; chỉ dùng màu trong `NIGHT`; đọc được ở bề ngang 360 px; báo cáo "đã kiểm gì, sửa gì, sheet nào chứng minh", **không nhận đã sửa khi chưa render lại** | `.claude/skills/review-loop/`, AGENTS.md | nhỏ |
| 2 | **Contact sheet theo nhịp** | Thêm vào `review.py`: lấy 1 khung **0,3 s sau đầu mỗi câu VO** (đúng lúc hình vừa ổn định) thay vì chỉ cắt đều 0,5 s; thêm chế độ soi một đoạn (`--from --to --every 0.2`) và soi đúng giây | `scripts/review.py` | nhỏ |
| 3 | **Ảnh sóng âm có vạch nhịp** | `scripts/wave.mjs` kiểu của họ: vẽ waveform + vạch tại mỗi câu VO / mỗi SFX, in LUFS + true peak, cảnh báo nếu lệch −14 ±1 LUFS hoặc đỉnh > −1 dBTP. Nhìn là biết SFX có rơi đúng nhịp không | script mới (chỉ ffmpeg) | nhỏ |
| 4 | **Thời gian đọc tối thiểu** | Giữ chữ ≥ 1 s cho cụm ngắn + 0,25 s mỗi từ quá 3; câu chốt cuối ≥ 2 s. Đưa vào checklist (#1) | Bible §5 | rất nhỏ |
| 5 | **Lối ra nhanh hơn lối vào** | Vào 0,7–1,25 s ease-out; ra ≈ một nửa thời gian, ease-in `bezier(0.6, 0, 0.9, 0.35)`. Kit hiện fade vào/ra đều 5 khung | kit J (`show`, KeyCard, Pin) | nhỏ |
| 6 | **Hạt nhiễu (grain) nhẹ** | Lớp grain ~0,09 độ đục, đổi hạt mỗi 2 khung. Lợi ích thật cho nền tối: **chống vệt dải màu (banding)** khi YouTube nén gradient tối; khung cũng không "chết" | kit J (`NightMap`) | nhỏ |
| 7 | **Một khoảnh khắc đỉnh mỗi video** | Ghi thành luật: chỉ twist được dùng hiệu ứng mạnh nhất (pop đàn hồi + deep hit SFX), không tiêu sớm | Bible §3, beat sheet | rất nhỏ |
| 8 | **`+faststart` khi xuất** | Thêm `-movflags +faststart` vào lệnh master (video phát ngay khi tải lên / xem web) | lệnh master trong AGENTS.md | rất nhỏ |

## Không nên học (trái luật kênh)

- **Bộ SFX tổng hợp bằng Python:** Lucas đã cấm SFX tổng hợp/cartoon (2026-10-08), chỉ dùng SFX thật Pixabay. Chỉ lấy ý "SFX rơi đúng nhịp", đã có ở #3.
- **Pipeline web sims (three.js, 60 fps):** hợp cho mô phỏng 3D, không cần cho bản đồ Shorts; camera bay 3D liên tục trái luật "không camera giả".
- **Font serif display (Instrument Serif):** luật short-form cấm serif cho khối chữ.
- **ElevenLabs MCP:** giọng trả phí; chỉ cân nhắc nếu Gemini lite không ổn (xem ghi chú bên dưới).

## Ghi chú kèm theo

Bản thu Charon (`gemini-3.8-flash-lite-tts`) có lỗi:
- **Cảnh 4 cắt câu lệch:** một lượt đọc 9 câu nên tách sai chỗ.
- **Model lite đọc lẫn chỉ dẫn giọng vào bài:** có cụm "never shout" bị đọc thành tiếng.

Hướng sửa: chia cảnh 4 thành các lượt ngắn và rút gọn chỉ dẫn giọng. Tốn khoảng 3–4 request, làm khi quay lại bước dựng.
