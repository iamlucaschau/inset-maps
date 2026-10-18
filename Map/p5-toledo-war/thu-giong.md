# Thử giọng — kênh Inset Maps (Cổng 4, bước 1)

*2026-10-17. Mỗi giọng đọc cảnh 1 + cảnh 4 trong **một** request (5 giọng = 5 request).
Lucas nghe 5 file trong `out/voice-test/` rồi chọn một giọng. Giọng đó dùng cố định cho cả kênh (Bible §6).*

- **Model:** chọn sau `npm run tts:check`, loại khác `gemini-3.8-flash-tts` (model của Atlas) để hai kênh không tranh quota.
- **Chỉ dẫn giọng (Bible §6):** "General American accent. Calm, confident documentary narrator with dry wit.
  Conversational, not hyped. Slightly slower on numbers, dates and place names. Never shout."
- **Lời thử:** cảnh 1 + cảnh 4 của `kich-ban-p5-toledo-war-FINAL.md`. Đoạn này có hook, số tiền, câu hỏi treo và câu đùa "Two",
  đủ để nghe nhịp và chất hài.

| # | Giọng | Mô tả của Google | File |
|---|---|---|---|
| 1 | Charon | informative | `out/voice-test/1-charon.wav` |
| 2 | Sadaltager | knowledgeable | `out/voice-test/2-sadaltager.wav` |
| 3 | Iapetus | clear | `out/voice-test/3-iapetus.wav` |
| 4 | Rasalgethi | informative | `out/voice-test/4-rasalgethi.wav` |
| 5 | Kore (nữ) | firm | `out/voice-test/5-kore.wav` |

**Kết quả (Lucas 2026-10-17): Charon.** Model `gemini-3.8-flash-lite-tts`. Cả 5 bản thô ~130 từ/phút → tempo 1.25 cho bản chính.
