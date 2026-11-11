export const TELEGRAM_COMMANDS = [
  { command: 'start', description: 'Mulai Agent Office Room dan tampilkan menu utama' },
  { command: 'help', description: 'Lihat panduan dan daftar perintah bot' },
  { command: 'status', description: 'Pantau status sistem dan aktivitas AI Agent' },
  { command: 'agents', description: 'Lihat seluruh AI Agent beserta statusnya' },
  { command: 'task', description: 'Buat dan delegasikan tugas baru ke AI Agent' },
  { command: 'tasks', description: 'Lihat daftar tugas aktif dan antrean pekerjaan' },
  { command: 'task_detail', description: 'Lihat progres dan detail eksekusi tugas' },
  { command: 'cancel', description: 'Batalkan tugas yang sedang berjalan' },
  { command: 'chat', description: 'Berkomunikasi langsung dengan AI Agent' },
  { command: 'approvals', description: 'Lihat tugas yang menunggu persetujuan Boss' },
  { command: 'approve', description: 'Setujui permintaan eksekusi tugas' },
  { command: 'reject', description: 'Tolak permintaan eksekusi tugas' },
  { command: 'history', description: 'Lihat riwayat tugas dan hasil pekerjaan' },
  { command: 'activity', description: 'Pantau aktivitas dan event AI Agent' },
  { command: 'models', description: 'Lihat model AI aktif dan status auto-router' },
  { command: 'memory', description: 'Lihat informasi memori dan konteks tersimpan' },
  { command: 'notifications', description: 'Atur notifikasi tugas dan aktivitas' },
  { command: 'settings', description: 'Kelola konfigurasi Agent Office Room' },
] as const;

export type BotCommandName = (typeof TELEGRAM_COMMANDS)[number]['command'];

export const BOT_LABELS = {
  STATUS: 'STATUS',
  TASK: 'TASK',
  AGENT: 'AGENT',
  APPROVAL: 'APPROVAL',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  COMPLETED: 'COMPLETED',
  PENDING: 'PENDING',
} as const;

