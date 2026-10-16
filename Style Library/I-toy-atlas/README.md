# I — Toy Atlas

*Thêm 2026-10-10, học từ kênh EasyHistories (V3 "Why Alaska Is American", V4 "Why Napoleon Sold the Middle of America"). Phân tích đầy đủ: `Map/phan-tich-V3-V4-EasyHistories.md`; ảnh tham chiếu: `Map/phan-tich/`. Trạng thái: **kit v1 (đang thử)**.*

- **Look:** bản đồ quốc gia **thật** (Natural Earth) có vân địa hình nhẹ, viền nước nông quanh bờ, viền tối 4 góc; lãnh thổ tô màu phẳng theo phe, đổi chủ bằng **vết loang tròn**; **quân cờ chibi** (búp bê con tốt) đứng trên bản đồ kèm cờ; sticker đạo cụ (tàu, rương tiền, TV, cẩu cảng…); **số lớn vàng** viền tối; **ruy băng năm** đỏ hiện to giữa rồi thu về góc trên trái.
- **Mạnh:** **Historical Timeline có yếu tố tiền** — "vì sao X hôm nay thuộc/không thuộc Y", mua bán đất, tách nhập quốc gia, món hời lịch sử; dễ hiểu, vui, giữ chân tốt.
- **Yếu:** cần ranh giới đúng từng thời kỳ (ranh giới lịch sử phải vẽ/tra riêng); cần bộ ảnh nhân vật cho mỗi tập.
- **Máy quay (ngoại lệ, Lucas 2026-10-10):** được **bay mỗi lần đổi nơi** — ease in-out, ≥ 28 frame (dài hơn với quãng xa), bay xa thì "cất cánh" (zoom ra) giữa đường; **không blur, không nảy, không rung**. Giữa các cú bay: **đẩy chậm, đều** về chủ thể (Lucas 2026-10-13, sau khi xem 20 video đối thủ): ≤ 5 % zoom mỗi 3 s, có trần, không rung, không giật, không "thở" (`camAt(..., push, cap)`).
- **Phụ đề:** karaoke **1 dòng; từ khoá + con số vàng nhạt suốt cụm, chữ đang đọc vàng đậm và to hơn 10 %** (Lucas 2026-10-13) (`AtlasSub`, `<KaraokeSubs oneLine maxWords={3} maxChars={18} />`), đặt ở đáy vùng an toàn (mẫu gốc đặt thấp hơn, đã nâng lên).
- **Font:** Bricolage Grotesque 800 cho mọi chữ, kể cả năm trong ruy băng (mẫu V4 dùng serif — không dùng).
- **Âm thanh:** whoosh Pixabay ở mỗi cú bay, click khi sticker hiện, deep hit ở con số chốt; nhạc nền sáng ~11 dB dưới giọng. Không pop/ding hoạt hình.
- **An toàn bản đồ:** chỉ tô màu các quốc gia trong câu chuyện; nước khác để màu đất trung tính, **không gắn nhãn**, nhất là quanh vùng tranh chấp (Biển Đông). Lãnh thổ tranh chấp trong câu chuyện → dừng ở Evidence Gate để Lucas duyệt cách vẽ.
- **Chuyển động trong khung (v2, Lucas 2026-10-12):** khung không bao giờ đứng yên — sóng biển trôi, cờ phấp phới, quân cờ nhún + lắc, sticker bồng bềnh, vòng `Pulse` đánh dấu nơi chính, tàu chạy liên tục trên tuyến; mỗi 1,5–2 s một sự kiện (sticker, nhãn, số đếm). Khoảnh khắc chính phải có hành động riêng (vd. đường cắt + đảo trôi ra khi "tách").
- **Tiếng Việt:** mỗi chữ là một âm tiết → phụ đề **tối đa 4 chữ** / 20 ký tự (`maxWords={4} maxChars={20}`; 2026-10-14: 22 ký tự cộng lề chừa cho chữ phóng to thì lấn mép vùng an toàn, Lucas 2026-10-13: 5 chữ là dài), ~1 s mỗi cụm. Nhạc nền ~11 dB dưới giọng (volume ≈ 0.2). Mọi chữ ≥ 48 px (ruy băng ở góc 0.82×).
- **Code (kit v1):** `toy-atlas.tsx`: `Atlas` (bản đồ + vân + loang màu + hatch), `camAt(keys, f, push, cap)` / `seamKeys(keys, end, push, cap)` (khung cuối = khung đầu cho video lặp) / `toScreen` (camera địa lý; `push` = đẩy chậm mỗi beat, Lucas 2026-10-13: ≤ 0.05 mỗi 3 s), `DataCard` (thẻ số to + nhãn), `Track` (đường liền, `glow` phát sáng nhấp nháy), `YearRibbon`, `BigGold`, `MapLabel`, `Peg` (quân cờ vector dự phòng), `PegImg` (quân cờ từ ảnh cắt nền + cờ), `ImgSticker`, `Pulse`, `routeHead`, `Flag` (UK / Singapore / Malaysia / Việt Nam / Thái Lan / Trung Quốc / Brunei giản lược), `CountryTag` (tên nước 52 px + cờ cắm trên lãnh thổ, đi theo camera, viền vàng–trắng loé khi lời đọc gọi tên — bắt buộc cho mọi nước được gọi tên / tô màu, Lucas 2026-10-14), `VnIslands` (Hoàng Sa, Trường Sa — bắt buộc khi khung có Biển Đông; kiểu ghim bản đồ: chấm đỏ viền trắng + tên trắng viền tối 42 px, chỉ hiện khi camera tới (ghim trong vùng an toàn, đủ gần) — Lucas 2026-10-14; tô thêm `"Paracel Is."`, `"Spratly Is."` cùng màu Việt Nam trong `fills`), `Sticker`, `Route` (+ `Ship`), `CountryShape` (viền phóng to, vd. lấn biển), `CoastBand` (dải màu ôm bờ biển trong một vòng lon/lat — vùng ảnh hưởng ven biển minh hoạ, vd. Brunei cổ), `RegionFill` (vùng minh hoạ trong một nước, cắt theo đất liền — vd. đồng bằng, vệt mặn), `Stamp` (mộc đóng), `Question` (dấu hỏi), `AtlasSub`. Dữ liệu: `world-atlas` 50m (10m cho các nước cần zoom sâu — sửa `FINE`), `d3-geo` Mercator, `topojson-client`.
- **Video mẫu:** `Map/i-singapore/` (tiếng Việt, Lucas 2026-10-10: làm tiếng Việt trước), composition `Map-Singapore`. Tập kênh đầu tiên: `Map/p2-duong-sat-cao-toc/` (`Map-P2-DuongSatCaoToc`, bản đồ toàn Việt Nam + tuyến sơ đồ). Bộ prompt nhân vật: `Map/i-singapore/image-prompts.md` (10 ảnh Lucas đã tạo, đang dùng trong v2).

## Vùng bố cục (`ZONE`, Lucas 2026-10-14)

| Vùng | Toạ độ (khung 1080×1920) | Dùng cho |
|---|---|---|
| `top` | y 240–440, tâm y = 330 | chữ lớn (`BigGold`), thẻ số (`DataCard`), ruy băng năm |
| `stage` | y 470–1100 | nhân vật, đạo cụ, hành động trên bản đồ |
| `rows` | y 1140–1320 | cột / hàng so sánh, thẻ số thấp |
| `subs` | đáy vùng an toàn (~1330–1430) | chỉ phụ đề karaoke |

Mỗi lớp đặt trong đúng vùng của nó; mỗi vùng một nội dung tại một thời điểm.
