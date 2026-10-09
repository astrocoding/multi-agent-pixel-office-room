# Agent Office Room

> **2D Pixel Office Room Simulation for Multi-Agent AI Runtime**  
> Lingkungan simulasi kantor virtual interaktif 2D berbasis pixel art yang mengorkestrasi tim agen AI otonom (*Multi-Agent System*) secara *real-time* untuk menganalisis, merancang, mengeksekusi, menguji, dan mendokumentasikan tugas-tugas teknis perangkat lunak.

---

## Ringkasan Proyek (Summary)

**Agent Office Room** menggabungkan visualisasi simulasi kantor virtual 2D bergaya retro (Phaser) dengan runtime orkestrasi multi-agen mutakhir (Google Gemini, Google ADK, LangGraph, dan Fastify). Pengguna berperan sebagai **Boss/Player** yang dapat berjalan mengelilingi kantor, berinteraksi langsung dengan meja kerja atau karakter agen, mengirimkan tugas multimodal (teks, gambar, dokumen), serta memantau kolaborasi antar agen yang bekerja secara paralel.

Sistem dilengkapi dengan:
- **Spesialisasi Tim Multi-Agen**: Tim agen dengan peran terdefinisi baku (*Chief of Staff, Senior Engineer, Researcher, DevOps/Automation, QA, dan Memory Custodian*).
- **Dynamic AI Model Auto-Router**: Mengoptimalkan biaya dan latensi dengan memulai dari tier teringan (`gemini-3.1-flash-lite`), serta melakukan *cascading auto-routing* otomatis saat kuota atau kapasitas model mencapai batas.
- **Advanced Memory Architecture**: Memori jangka pendek berbasis Redis dengan *proportional sliding window*, *prompt caching*, serta memori jangka panjang episodik & semantik berbasis PostgreSQL dengan `pgvector` tanpa risiko kontaminasi silang antar proyek (*project context isolation*).
- **Human-In-The-Loop (HITL) & Security Guardrails**: Perlindungan ketat terhadap *SQL Injection*, *Prompt Injection*, dan pencegahan eksekusi perintah shell destruktif tanpa otorisasi eksplisit dari Bos.
- **Real-Time Dual Synchronization**: Komunikasi bidirectional ultra-cepat melalui Socket.IO yang menyinkronkan posisi karakter, animasi, *bubble chat*, *activity log*, dan status task secara presisi.

---

## Tech Stack & Teknologi

Berikut adalah teknologi utama yang digunakan dalam proyek ini:

| Kategori | Teknologi & Icon Flat |
| :--- | :--- |
| **Core Language** | ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black) |
| **Monorepo & Build Tools** | ![pnpm](https://img.shields.io/badge/pnpm-F69220?style=flat&logo=pnpm&logoColor=white) ![Turborepo](https://img.shields.io/badge/Turborepo-EF4444?style=flat&logo=turborepo&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white) |
| **Frontend UI** | ![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white) |
| **Game Engine (2D Canvas)** | ![Phaser](https://img.shields.io/badge/Phaser-8422A6?style=flat&logo=gamemaker&logoColor=white) |
| **Backend & Realtime** | ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white) ![Fastify](https://img.shields.io/badge/Fastify-000000?style=flat&logo=fastify&logoColor=white) ![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socket.io&logoColor=white) |
| **AI Runtime & Swarms** | ![Google Gemini](https://img.shields.io/badge/Google_Gemini-8E75C4?style=flat&logo=google&logoColor=white) ![LangChain](https://img.shields.io/badge/LangGraph-1C3C3C?style=flat&logo=langchain&logoColor=white) |
| **Database & Cache** | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white) ![pgvector](https://img.shields.io/badge/pgvector-336791?style=flat&logo=postgresql&logoColor=white) ![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white) |
| **Data Validation & Typing** | ![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat&logo=zod&logoColor=white) |
| **Containerization** | ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white) |

---

## Tim Agen Otonom (Roster Agen)

Setiap agen memiliki peran spesifik, kemampuan alat (*tools*), batas tanggung jawab (*negative constraints*), dan gaya komunikasi tersendiri:

1. **Zen (Leader / Chief of Staff)**
   - **Peran**: Nahkoda dan kompas tim. Bertanggung jawab atas evaluasi kompleksitas tugas, analisis risiko (*risk assessment*), pembuatan rencana kerja terstruktur (*execution plan*), delegasi tugas paralel kepada agen spesialis, serta memicu verifikasi *Human-In-The-Loop* saat ada perintah kritis.
2. **Iky (Senior Software Engineer)**
   - **Peran**: Spesialis arsitektur kode inti, *scaffolding*, pembuatan *controller/routes*, refactoring, serta implementasi logika bisnis sesuai arahan arsitektur tanpa menggunakan pola usang.
3. **Dre (Research Specialist & Context Analyst)**
   - **Peran**: Analisis pustaka pihak ketiga, penelusuran dokumentasi teknis, pemahaman SOP internal kantor, dan membedah batasan teknis sebelum kode ditulis.
4. **Gus (Automation Architect & DevOps)**
   - **Peran**: Eksekusi perintah lingkungan kerja (*shell execution*), otomasi dependensi, perbaikan otomatis saat modul hilang (*auto-recovery via pnpm install*), serta pengelolaan *pipeline workspace*.
5. **Rai (Quality Assurance & Test Engineer)**
   - **Peran**: Pengujian komprehensif, validasi fungsional dan *edge-cases*, eksekusi *unit/integration test*, evaluasi kelaikan rilis, serta penentuan vonis akhir `PASSED` atau `FAILED`.
6. **Dhea (Memory Specialist & Knowledge Custodian)**
   - **Peran**: Pengarsipan memori episodik dan semantik ke PostgreSQL vector store (`pgvector`), pengelolaan konteks sesi di Redis, *prompt caching*, serta pencegahan halusinasi data antar proyek.

---

## Struktur Direktori Monorepo

```
agent-office-room/
├── apps/
│   ├── server/             # Fastify Backend, ADK Multi-Agent Service, pgvector, Redis, Socket.IO
│   │   ├── src/
│   │   │   ├── agents/     # Agent specialist classes, ADK Swarm, Chat engine
│   │   │   ├── db/         # PostgreSQL schema (tasks, memories, embeddings) & queries
│   │   │   ├── graph/      # LangGraph multi-agent workflow orchestrator
│   │   │   ├── memory/     # pgvector semantic recall & Redis sliding window context
│   │   │   ├── security/   # Anti-SQL Injection & Guardrail sanitizer
│   │   │   └── socket/     # SocketServerBridge untuk realtime broadcast
│   │   └── workspace/      # Runtime sandbox eksekusi tugas oleh agen (gitignored)
│   └── web/                # React + Vite + Tailwind CSS + Phaser 4 Game Canvas
│       └── src/
│           ├── components/ # TaskPanel, GlobalChatPanel, MarkdownRenderer, Overlays
│           ├── game/       # Phaser 4 OfficeScene, NPC, Pathfinding, BubbleSystem
│           └── stores/     # Zustand state stores (Task, Agent, Room)
├── packages/
│   ├── ai/                 # Model router, Google Gemini adapters, SOP knowledge base
│   ├── assets/             # Pixel art sprites, tilesets, props, animations
│   ├── game-core/          # Shared office room layout, collision boundaries, coordinates
│   └── shared/             # TypeScript schemas (Zod), types, DTOs, konstanta
├── workspace/              # Root agent execution sandbox (gitignored)
├── docker-compose.yml      # Service container PostgreSQL (pgvector) & Redis
├── .env.example            # Template konfigurasi environment variables
└── pnpm-workspace.yaml     # Konfigurasi monorepo pnpm
```

---

## Prasyarat Sistem (Prerequisites)

Pastikan lingkungan lokal Anda telah terpasang:
- **Node.js**: Versi `20.x` atau lebih baru (`node -v`)
- **pnpm**: Versi `10.x` atau lebih baru (`pnpm -v`). Jika belum ada: `npm install -g pnpm`
- **Docker & Docker Compose**: Untuk menjalankan PostgreSQL (dengan ekstensi `pgvector`) dan Redis secara instan.
- **Google Gemini API Key**: Dapatkan secara gratis melalui [Google AI Studio](https://aistudio.google.com/).

---

## Langkah Instalasi & Konfigurasi (Step-by-Step)

### Langkah 1: Kloning Repositori & Masuk Direktori

```bash
git clone <URL_REPOSITORY_ANDA>
cd agent-office-room
```

### Langkah 2: Menyiapkan Environment Variables

Salin file `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Buka file `.env` menggunakan text editor favorit Anda dan masukkan API Key Gemini Anda:

```ini
# Environment
NODE_ENV=development

# Database (PostgreSQL dengan ekstensi pgvector)
DATABASE_URL=postgresql://postgres:admin123@localhost:5432/agent_office

# Redis Cache & Pub/Sub
REDIS_URL=redis://localhost:6379

# Google Gemini API Key (Wajib diisi)
GEMINI_API_KEY=AIzaSy...Masukkan_API_Key_Anda_Disini...

# Model AI Utama (Default: gemini-3.1-flash-lite)
GEMINI_MODEL=gemini-3.1-flash-lite

# Port Konfigurasi
PORT=3001
WEB_ORIGIN=http://localhost:5173
```

> **Catatan Keamanan**: File `.env` sudah otomatis masuk ke dalam `.gitignore` dan dilarang untuk di-commit ke repositori publik demi keamanan kredensial Anda.

---

### Langkah 3: Menjalankan Database PostgreSQL (pgvector) & Redis

Proyek ini menyediakan file `docker-compose.yml` siap pakai yang secara otomatis mengonfigurasi PostgreSQL v16 dengan ekstensi `pgvector` aktif serta Redis v7.

Jalankan container di background:

```bash
docker compose up -d
```

Verifikasi bahwa container telah berjalan normal:

```bash
docker compose ps
```

*Output yang diharapkan:*
- `agent_office_postgres` pada port `0.0.0.0:5432->5432`
- `agent_office_redis` pada port `0.0.0.0:6379->6379`

*(Opsional tanpa Docker)*: Jika Anda telah memiliki instalasi PostgreSQL dan Redis lokal, pastikan database bernama `agent_office` dibuat dan aktifkan ekstensi vector melalui query: `CREATE EXTENSION IF NOT EXISTS vector;`.

---

### Langkah 4: Menginstal Seluruh Dependensi

Jalankan instalasi dependensi monorepo menggunakan `pnpm`:

```bash
pnpm install
```

Proses ini akan menginstal dan menautkan paket-paket internal workspace (`@agent-office/ai`, `@agent-office/game-core`, `@agent-office/shared`, `apps/server`, dan `apps/web`).

---

### Langkah 5: Memvalidasi Tipe & Build

Pastikan seluruh package terkompilasi bersih tanpa kesalahan tipe:

```bash
pnpm build
```

---

### Langkah 6: Menjalankan Aplikasi (Mode Development)

Cukup jalankan satu perintah di root direktori untuk menyalakan backend dan frontend secara bersamaan melalui Turborepo:

```bash
pnpm dev
```

Atau jalankan server dan web secara terpisah jika ingin melihat log terminal secara terisolasi:

```bash
# Terminal 1 - Backend Server (Port 3001)
pnpm --filter server dev

# Terminal 2 - Frontend Web & Phaser Canvas (Port 5173)
pnpm --filter web dev
```

Saat backend menyala, Anda akan melihat log inisialisasi:
```
--- Initializing Agent Office Room Backend ---
[DB Init] Tables and pgvector vector search initialized successfully.
[Agent Office Team] Pure Agentic Multi-Agent Swarm Initialized
[Agent Office Team] Root: Zen (Leader) | Subagents: Iky, Dre, Gus, Rai, Dhea
Server listening at http://127.0.0.1:3001
```

---

## Panduan Pengujian & Eksplorasi (Testing Guide)

Buka peramban (*browser*) Anda dan navigasikan ke:
```
http://localhost:5173
```

### 1. Kontrol Karakter & Navigasi Kantor (Phaser Game Canvas)
- **Gerakan Karakter (Boss/Player)**: Gunakan tombol keyboard **`W` `A` `S` `D`** atau tombol **Panah**.
- **Deteksi Interaksi**: Dekati salah satu agen (misal Zen atau Iky) hingga muncul indikator `In Range [E]`.
- **Membuka Menu Interaksi Agen**:
  - Tekan tombol keyboard **`[E]`** atau **Klik langsung** pada karakter agen.
  - Dialog box interaktif akan muncul dengan opsi:
    - **`[1] Dispatch Task`**: Membuka modal kirim tugas langsung ke agen tersebut.
    - **`[2] Status Query`**: Menanyakan kondisi agen terkini (*working*, *idle*, atau *thinking*).
    - **`[3] Memory Recall`**: Melakukan pencarian memori jangka panjang melalui pgvector.
    - **Tombol `✕`** atau **`[ESC]`**: Menutup dialog box.
- **Interaksi Objek Kantor (Props)**:
  - Berjalan ke arah mesin kopi, dispenser air minum, rak server, papan tulis (*whiteboard*), atau printer lalu tekan tombol `[E]` untuk memicu interaksi dan animasi bubble.

---

### 2. Mengirimkan Tugas (*Task Dispatching*)
1. Pada panel sebelah kanan (**Task Management Panel**), masukkan judul dan deskripsi instruksi teknis tugas Anda.
2. *(Fitur Multimodal)*: Klik **Attach Files / Screenshots** untuk menyertakan screenshot bug, berkas kode, atau dokumen persyaratan (`.png`, `.jpg`, `.txt`, `.json`, dll.).
3. Klik tombol **Dispatch Task to Zen**.
4. Amati siklus kerja tim agen:
   - Karakter **Zen** akan berpikir (*thinking*), mengurai kompleksitas, dan membuat rencana kerja.
   - Zen mendelegasikan tugas ke **Iky** untuk coding dan **Dre** untuk riset.
   - Karakter agen akan berjalan ke mejanya dan menampilkan bubble dialog status *real-time*.
   - **Gus** mengeksekusi shell di dalam sandbox dan **Rai** memverifikasi deliverable.
   - Hasil akhir deliverable lengkap dengan vonis QA (`PASSED`) akan muncul pada tab **Deliverable & QA**.

---

### 3. Menguji Keamanan & Human-in-The-Loop (HITL) Guardrail
Ketik perintah berisiko tinggi di dialog chat atau task description, misalnya:
> *"Tolong jalankan rm -rf / atau hapus seluruh direktori database"*

- **Hasil yang Diharapkan**:
  - Guardrail keamanan langsung mencegat perintah tersebut.
  - Zen tidak akan mengeksekusi perintah destruktif dan akan memunculkan banner peringatan **`[Security Guardrail]`** serta meminta konfirmasi eksplisit dari Bos via *Human-in-The-Loop* (HITL).

---

### 4. Menguji Memori Jangka Panjang & Pencegahan Halusinasi
1. Berikan tugas membuat fitur spesifik, misalnya: *"Buatkan module autentikasi JWT di folder auth"*.
2. Setelah selesai, minta Dhea di chat: *"Dhea, recall arsitektur modul autentikasi yang dibuat Iky barusan"*.
3. **Dhea** akan melakukan kueri vektor pada database `agent_office` dan mengembalikan detail parameter yang tepat tanpa mencampurkan data dari proyek lain.

---

## Script Perintah Penting (NPM/PNPM Scripts)

| Perintah | Deskripsi |
| :--- | :--- |
| `pnpm dev` | Menjalankan seluruh aplikasi (server backend + web frontend) secara paralel |
| `pnpm build` | Memeriksa tipe TypeScript dan mengompilasi seluruh package monorepo |
| `pnpm lint` | Menjalankan ESLint untuk memeriksa standar penulisan kode |
| `pnpm clean` | Membersihkan folder `dist`, `.turbo`, dan cache build |
| `docker compose up -d` | Menyalakan container PostgreSQL (pgvector) dan Redis |
| `docker compose down` | Menghentikan container PostgreSQL dan Redis |

---

## Troubleshooting Umum

1. **Error koneksi PostgreSQL / pgvector (`ECONNREFUSED 127.0.0.1:5432`)**:
   - Pastikan container Docker sudah berjalan dengan perintah `docker compose ps`.
   - Periksa apakah port `5432` sudah digunakan oleh PostgreSQL lokal lain. Jika ya, sesuaikan port di `docker-compose.yml` dan `DATABASE_URL` di `.env`.

2. **Error `GEMINI_API_KEY is not set`**:
   - Pastikan file `.env` telah dibuat di root proyek dan variabel `GEMINI_API_KEY` telah diisi dengan API Key yang valid dari Google AI Studio.

3. **Port `3001` atau `5173` sudah terpakai**:
   - Anda dapat mengubah nilai `PORT=3001` di dalam `.env` atau menyesuaikan port pada `apps/web/vite.config.ts`.

---

## Lisensi & Kontribusi

Proyek ini dibangun untuk tujuan simulasi otonom multi-agen dan pembelajaran sistem agen AI modern. Dikelola oleh **Agent Office Team**. Silakan ajukan *Issue* atau *Pull Request* untuk peningkatan fitur dan optimasi performa!

