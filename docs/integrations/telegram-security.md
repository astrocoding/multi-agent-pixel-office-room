# Panduan Keamanan Integrasi Telegram — Agent Office Room

## 1. Prinsip Keamanan Utama
1. **Pemisahan Boundary (Isolation)**: Telegram Bot tidak terhubung langsung ke model AI atau eksekusi bash secara liar. Semua interaksi melewati `apps/server` melalui internal authenticated API.
2. **Timing-Safe Token Comparison**: Verifikasi secret token webhook menggunakan `crypto.timingSafeEqual` untuk mencegah serangan timing-attack.
3. **Least Privilege & Role-Based Access Control (RBAC)**:
   - `owner`: Memiliki wewenang penuh termasuk menyetujui (`/approve`) atau menolak (`/reject`) approval tugas berisiko.
   - `operator`: Dapat membuat tugas, chat, dan melihat status, tetapi tidak bisa memutus approval.
   - `guest`: Akses ditolak secara default jika ID Telegram tidak tercantum dalam `TELEGRAM_OWNER_USER_IDS` atau `TELEGRAM_ALLOWED_USER_IDS`.
4. **Idempotency & Anti-Replay**:
   - Setiap update Telegram diverifikasi di tabel `telegram_processed_updates`.
   - Kunci unik: `${bot_identity}_${telegram_update_id}`.
   - Keputusan approval di PostgreSQL dieksekusi dalam transaksi dengan row-level lock (`FOR UPDATE`), mencegah persetujuan ganda / race conditions.
5. **Enforcement Tanpa Emoji (Zero-Emoji Policy)**:
   - Seluruh teks keluaran bot difilter melalui `assertNoEmoji()` dan `stripEmoji()`.
   - Menggunakan format ASCII terstruktur: `[STATUS: OK]`, `[PENDING]`, `[APPROVED]`, `[REJECTED]`.

---

## 2. Parameter Lingkungan Keamanan (.env)

```env
# Token Rahasia Webhook Telegram
TELEGRAM_WEBHOOK_SECRET=your_super_secret_webhook_token_here

# Token Autentikasi Internal Antar-Service
AGENT_OFFICE_SERVICE_TOKEN=your_secure_internal_service_token

# Otorisasi ID Pengguna Telegram (Numeric IDs dipisahkan koma)
TELEGRAM_OWNER_USER_IDS=123456789
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
```

---

## 3. Penanganan Serangan Umum
- **Spoofed Webhook Requests**: Ditolak dengan HTTP 401 jika header `X-Telegram-Bot-Api-Secret-Token` tidak cocok secara timing-safe.
- **Large Payload Bombing**: Ukuran body Fastify dibatasi maksimal 1 MB (`bodyLimit: 1048576`).
- **Telegram Update Flooding**: Webhook mengembalikan HTTP 200 segera setelah verifikasi idempotensi, mengalihkan pemrosesan berat ke background queue sehingga Telegram API tidak mengulangi request.

