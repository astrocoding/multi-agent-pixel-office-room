# Panduan Pengujian Otomatis Telegram Bot — Agent Office Room

## 1. Lingkup Pengujian
Pengujian otomatis menggunakan test runner native Node.js (`node:test` dan `node:assert/strict`) yang dieksekusi dengan `tsx`:
- **Unit Tests**:
  - `tests/unit/noEmoji.test.ts`: Pengujian deteksi emoji, stripping emoji, dan penegasan `assertNoEmoji`.
  - `tests/unit/commandParser.test.ts`: Parsing command, handling @bot_username, normalisasi whitespace, argument parsing.
  - `tests/unit/messageFormatter.test.ts`: Pemformatan teks ASCII terstruktur untuk menu start, help, status, task detail, dan approvals.
- **Security Tests**:
  - `tests/security/webhookSecurity.test.ts`: Verifikasi timing-safe secret validator, penolakan token salah (401), penolakan token kosong (401), penolakan malformed payload (400), dan penolakan metode GET (404).
- **Idempotency Tests**:
  - `tests/idempotency/idempotency.test.ts`: Memastikan delivery ulang dari Telegram dengan `update_id` identik diabaikan dan tidak mengeksekusi dispatcher berulang.
- **Integration Tests (18 Perintah Bot)**:
  - `tests/integration/commands.test.ts`: Menjalankan end-to-end seluruh 18 perintah bot (`/start`, `/help`, `/status`, `/agents`, `/task`, `/tasks`, `/task_detail`, `/cancel`, `/chat`, `/approvals`, `/approve`, `/reject`, `/history`, `/activity`, `/models`, `/memory`, `/notifications`, `/settings`) beserta boundary testing otorisasi role non-owner dan guest.

---

## 2. Cara Menjalankan Uji Otomatis

Jalankan seluruh rangkaian tes dari root repositori:
```bash
./apps/server/node_modules/.bin/tsx --test apps/telegram-bot/tests/unit/*.test.ts apps/telegram-bot/tests/security/*.test.ts apps/telegram-bot/tests/idempotency/*.test.ts apps/telegram-bot/tests/integration/*.test.ts
```

Atau menggunakan skrip npm:
```bash
npm --prefix apps/telegram-bot test
```

---

## 3. Hasil Pengujian Terbaru
```
ℹ tests 44
ℹ suites 8
ℹ pass 44
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
Semua 44 tes lulus tanpa kegagalan (100% pass rate).

