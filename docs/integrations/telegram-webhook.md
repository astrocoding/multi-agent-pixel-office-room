# Arsitektur & Operasional Telegram Webhook — Agent Office Room

## 1. Ikhtisar Arsitektur
Layanan integrasi Telegram Bot diimplementasikan sebagai subsistem independen di direktori `apps/telegram-bot`, berjalan pada port `3002` (atau port terkonfigurasi pada `TELEGRAM_BOT_PORT`). 

Arsitektur ini memisahkan secara tegas:
1. **Telegram Webhook Ingestion Layer** (Fastify): Menerima payload update langsung dari Telegram API melalui endpoint `POST /webhooks/telegram` (atau `POST /webhook`).
2. **Security & Idempotency Boundary**: Melakukan verifikasi token rahasia secara timing-safe dan deduplikasi update atomic di PostgreSQL.
3. **Domain & Command Layer**: Mengelola state sesi multi-langkah dan mengeksekusi 18 perintah bot yang didukung.
4. **Internal Service Client**: Berkomunikasi dengan core backend `apps/server` (port 3001) melalui `InternalApiRoutes` yang diamankan token internal `AGENT_OFFICE_SERVICE_TOKEN`.
5. **No Emoji Enforcement**: Memastikan 100% respons bot dan notifikasi murni menggunakan karakter teks ASCII / label status tanpa satupun emoji.

---

## 2. Alur Eksekusi Webhook
```
Telegram Servers
       │
       ▼ (HTTPS POST with X-Telegram-Bot-Api-Secret-Token)
[apps/telegram-bot]
       │
       ├─► 1. Verify Secret Token (timing-safe comparison)
       ├─► 2. Validate Update Schema (Zod)
       ├─► 3. Idempotency Check (bot_identity + telegram_update_id)
       │      └─ Jika duplikat: return HTTP 200 { ok: true, duplicate: true }
       ├─► 4. Return HTTP 200 { ok: true } segera (< 100ms)
       │
       ▼ (Asynchronous Background Task)
[CommandDispatcher / SessionManager]
       │
       ├─► 5. Identity & Permission Mapping (Owner vs Operator vs Guest)
       ├─► 6. Internal API Request to apps/server (port 3001)
       │      Headers: X-Internal-Service-Token, X-Actor-Id, X-Actor-Role
       ▼
[TelegramClient]
       │
       ├─► 7. Assert No Emoji
       ├─► 8. Chunk long text (3500 chars limit)
       └─► 9. Send response to Telegram Chat
```

---

## 3. Daftar 18 Perintah Bot

| Perintah | Deskripsi | Hak Akses |
|---|---|---|
| `/start` | Mulai bot dan tampilkan menu utama | Semua user terotorisasi |
| `/help` | Lihat panduan dan daftar perintah | Semua user terotorisasi |
| `/status` | Pantau status runtime sistem dan AI Agent | Semua user terotorisasi |
| `/agents` | Lihat seluruh AI Agent beserta status kerjanya | Semua user terotorisasi |
| `/task <deskripsi>` | Buat dan delegasikan tugas baru ke Zen / Team | Semua user terotorisasi |
| `/tasks` | Lihat daftar tugas aktif dan antrean pekerjaan | Semua user terotorisasi |
| `/task_detail <id>` | Lihat progres dan detail eksekusi tugas | Semua user terotorisasi |
| `/cancel <id>` | Batalkan tugas yang sedang berjalan atau sesi aktif | Semua user terotorisasi |
| `/chat <agent> <msg>` | Berkomunikasi langsung dengan AI Agent (zen, iky, dll.) | Semua user terotorisasi |
| `/approvals` | Lihat daftar tugas yang menunggu persetujuan Boss | Semua user terotorisasi |
| `/approve <id>` | Setujui eksekusi tugas berisiko | Khusus Owner / Boss |
| `/reject <id>` | Tolak permintaan eksekusi tugas | Khusus Owner / Boss |
| `/history` | Lihat riwayat tugas dan hasil pekerjaan | Semua user terotorisasi |
| `/activity` | Pantau aktivitas dan event realtime AI Agent | Semua user terotorisasi |
| `/models` | Lihat model AI aktif dan status auto-router | Semua user terotorisasi |
| `/memory` | Lihat informasi memori dan konteks tersimpan | Semua user terotorisasi |
| `/notifications [on\|off]` | Atur preferensi notifikasi untuk chat saat ini | Semua user terotorisasi |
| `/settings` | Lihat konfigurasi Agent Office Room | Semua user terotorisasi |

---

## 4. Manajemen Webhook CLI
Skrip CLI pembantu telah disediakan untuk registrasi webhook ke Telegram API:

- **Set Webhook**:
  ```bash
  pnpm --filter @agent-office/telegram-bot webhook:set
  ```
- **Info Webhook**:
  ```bash
  pnpm --filter @agent-office/telegram-bot webhook:info
  ```
- **Delete Webhook**:
  ```bash
  pnpm --filter @agent-office/telegram-bot webhook:delete
  ```

