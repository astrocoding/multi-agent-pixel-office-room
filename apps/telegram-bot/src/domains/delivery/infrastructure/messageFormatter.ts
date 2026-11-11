import { assertNoEmoji, stripEmoji } from '../../../shared/utils/noEmoji.js';
import type {
  InternalApiStatusResponse,
  InternalApiAgent,
  InternalApiTask,
  InternalApiApproval,
} from '../../../integrations/agent-office/agentOfficeClient.js';

export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class MessageFormatter {
  public static formatStart(actorRole: string): string {
    const text = [
      '<b>AGENT OFFICE ROOM</b>',
      'Multi-Agent System',
      '',
      'Status: Connected',
      'Leader: Zen',
      `Role: <code>${actorRole.toUpperCase()}</code>`,
      '',
      'Gunakan <code>/help</code> untuk daftar perintah.',
    ].join('\n');

    assertNoEmoji(text, 'formatStart');
    return text;
  }

  public static formatHelp(isOwner: boolean): string {
    const lines = [
      '<b>PANDUAN PERINTAH AGENT OFFICE ROOM</b>',
      '(Klik atau tap teks perintah/kode untuk copy instan)',
      '',
      '<b>Umum & Monitoring:</b>',
      '<code>/start</code> - Mulai bot dan tampilkan menu utama',
      '<code>/help</code> - Lihat panduan dan daftar perintah bot',
      '<code>/status</code> - Pantau status sistem dan aktivitas AI Agent',
      '<code>/agents</code> - Lihat seluruh AI Agent beserta statusnya',
      '<code>/activity</code> - Pantau aktivitas dan event AI Agent',
      '',
      '<b>Manajemen Tugas:</b>',
      '<code>/task [deskripsi]</code> - Buat dan delegasikan tugas baru',
      '<code>/tasks</code> - Lihat daftar tugas aktif dan antrean',
      '<code>/task_detail [task_id]</code> - Lihat progres dan detail tugas',
      '<code>/cancel [task_id]</code> - Batalkan tugas yang sedang berjalan',
      '',
      '<b>Komunikasi Agent:</b>',
      '<code>/chat zen [pesan]</code> - Chat dengan Zen (Leader)',
      '<code>/chat iky [pesan]</code> - Chat dengan Iky (Senior Engineer)',
      '<code>/chat dre [pesan]</code> - Chat dengan Dre (Research)',
      '<code>/chat gus [pesan]</code> - Chat dengan Gus (Automation)',
      '<code>/chat rai [pesan]</code> - Chat dengan Rai (QA & Critic)',
      '<code>/chat dhea [pesan]</code> - Chat dengan Dhea (Memory)',
      '',
      '<b>Persetujuan & Kontrol:</b>',
      '<code>/approvals</code> - Lihat tugas menunggu persetujuan Boss',
    ];

    if (isOwner) {
      lines.push(
        '<code>/approve [approval_id]</code> - Setujui permintaan eksekusi',
        '<code>/reject [approval_id]</code> - Tolak permintaan eksekusi'
      );
    }

    lines.push(
      '',
      '<b>Intelijen & Pengaturan:</b>',
      '<code>/history</code> - Lihat riwayat tugas dan hasil pekerjaan',
      '<code>/models</code> - Lihat model AI aktif dan auto-router',
      '<code>/memory</code> - Lihat informasi memori tersimpan',
      '<code>/notifications on</code> | <code>/notifications off</code>',
      '<code>/settings</code> - Kelola konfigurasi Agent Office Room'
    );

    const result = lines.join('\n');
    assertNoEmoji(result, 'formatHelp');
    return result;
  }

  public static formatStatus(status: InternalApiStatusResponse): string {
    const text = [
      '<b>AGENT OFFICE ROOM</b>',
      `Runtime: ${status.runtime === 'online' ? 'Online' : 'Offline'}`,
      `Agents: ${status.agentCount}`,
      `Active Tasks: ${status.activeTasksCount}`,
      `Pending Approvals: ${status.pendingApprovalsCount}`,
      `Active Model: <code>${status.activeModel}</code>`,
      `Uptime: ${Math.floor(status.uptimeSeconds / 60)}m`,
    ].join('\n');

    assertNoEmoji(text, 'formatStatus');
    return text;
  }

  public static formatAgents(agents: InternalApiAgent[]): string {
    const lines = ['<b>DAFTAR AI AGENT:</b>'];
    for (const a of agents) {
      lines.push(
        `- <b>${escapeHtml(a.name)}</b> [<code>${a.state.toUpperCase()}</code>]`,
        `  ID: <code>${a.id}</code>`,
        `  Role: ${escapeHtml(a.role)}`,
        `  Spesialisasi: ${escapeHtml(a.specialty.slice(0, 60))}`
      );
    }
    const text = lines.join('\n');
    assertNoEmoji(text, 'formatAgents');
    return text;
  }

  public static formatTaskCreated(taskId: string, title: string, assignedTo = 'Zen'): string {
    const text = [
      '<b>TASK CREATED</b>',
      `ID: <code>${taskId}</code> (Klik untuk copy)`,
      `Title: ${escapeHtml(stripEmoji(title).slice(0, 80))}`,
      `Status: <code>QUEUED</code>`,
      `Assigned To: ${escapeHtml(assignedTo)}`,
    ].join('\n');

    assertNoEmoji(text, 'formatTaskCreated');
    return text;
  }

  public static formatTasksList(tasks: InternalApiTask[]): string {
    if (tasks.length === 0) {
      return '<b>DAFTAR TUGAS AKTIF</b>\nTidak ada tugas yang sedang aktif.';
    }

    const lines = [
      `<b>DAFTAR TUGAS AKTIF (${tasks.length}):</b>`,
      '(Klik ID di bawah untuk copy langsung)',
    ];
    for (const t of tasks) {
      lines.push(`- ID: <code>${t.id}</code> [<code>${t.status.toUpperCase()}</code>]`);
      lines.push(`  Judul: ${escapeHtml(stripEmoji(t.title).slice(0, 50))}`);
    }
    const text = lines.join('\n');
    assertNoEmoji(text, 'formatTasksList');
    return text;
  }

  public static formatTaskDetail(task: InternalApiTask): string {
    const deliverable = task.outputPayload?.finalDeliverable as string | undefined;
    const lines = [
      '<b>DETAIL TUGAS</b>',
      `ID: <code>${task.id}</code> (Klik untuk copy)`,
      `Judul: ${escapeHtml(stripEmoji(task.title))}`,
      `Status: <code>${task.status.toUpperCase()}</code>`,
      `Agent: ${escapeHtml(task.assignedAgentId || 'Zen')}`,
      `Dibuat: ${new Date(task.createdAt).toLocaleString('id-ID')}`,
    ];

    if (deliverable) {
      lines.push('', '<b>HASIL PEKERJAAN:</b>', escapeHtml(stripEmoji(deliverable).slice(0, 1500)));
    }

    const text = lines.join('\n');
    assertNoEmoji(text, 'formatTaskDetail');
    return text;
  }

  public static formatApprovalsList(approvals: InternalApiApproval[]): string {
    if (approvals.length === 0) {
      return '<b>PERSETUJUAN BOSS</b>\nTidak ada permintaan yang menunggu persetujuan.';
    }

    const lines = [
      `<b>PERMINTAAN PERSETUJUAN (${approvals.length}):</b>`,
      '(Klik ID di bawah untuk copy langsung)',
    ];
    for (const a of approvals) {
      lines.push(`- ID: <code>${a.id}</code>`);
      lines.push(`  Tugas: <code>${a.taskId}</code>`);
      lines.push(`  Tindakan: ${escapeHtml(stripEmoji(a.actionDescription).slice(0, 60))}`);
      lines.push(`  Tingkat Risiko: <code>${a.riskLevel.toUpperCase()}</code>`);
      lines.push(`  Status: <code>${a.status.toUpperCase()}</code>`);
    }
    const text = lines.join('\n');
    assertNoEmoji(text, 'formatApprovalsList');
    return text;
  }

  public static formatApprovalResolved(id: string, status: 'approved' | 'rejected'): string {
    const text = [
      `<b>APPROVAL ${status === 'approved' ? 'GRANTED' : 'REJECTED'}</b>`,
      `ID: <code>${id}</code>`,
      `Status: <code>${status.toUpperCase()}</code>`,
      `Catatan: Keputusan telah dicatat di sistem core.`,
    ].join('\n');

    assertNoEmoji(text, 'formatApprovalResolved');
    return text;
  }

  public static formatHistory(history: InternalApiTask[]): string {
    if (history.length === 0) {
      return '<b>RIWAYAT TUGAS</b>\nBelum ada riwayat tugas yang selesai atau dibatalkan.';
    }

    const lines = [
      `<b>RIWAYAT TUGAS (${history.length}):</b>`,
      '(Klik ID di bawah untuk copy langsung)',
    ];
    for (const h of history) {
      lines.push(`- ID: <code>${h.id}</code> [<code>${h.status.toUpperCase()}</code>]`);
      lines.push(`  Judul: ${escapeHtml(stripEmoji(h.title).slice(0, 50))}`);
    }
    const text = lines.join('\n');
    assertNoEmoji(text, 'formatHistory');
    return text;
  }

  public static formatActivities(activities: unknown[]): string {
    if (!activities || activities.length === 0) {
      return '<b>AKTIVITAS SISTEM</b>\nBelum ada event aktivitas tercatat.';
    }

    const lines = [`<b>AKTIVITAS TERBARU (${activities.length}):</b>`];
    for (const item of activities as Array<{ eventType?: string; message?: string; agentId?: string }>) {
      lines.push(`- [<code>${item.eventType || 'EVENT'}</code>] ${escapeHtml(stripEmoji(item.message || '').slice(0, 70))}`);
    }
    const text = lines.join('\n');
    assertNoEmoji(text, 'formatActivities');
    return text;
  }

  public static formatModels(data: {
    activeModel: string;
    costTier: string;
    isAutoRouter: boolean;
    candidateModels: string[];
  }): string {
    const text = [
      '<b>STATUS AI MODEL & ROUTER</b>',
      `Model Aktif: <code>${data.activeModel}</code>`,
      `Cost Tier: <code>${data.costTier.toUpperCase()}</code>`,
      `Auto-Router: ${data.isAutoRouter ? 'Aktif' : 'Manual Override'}`,
      `Kaskade: <code>${data.candidateModels.join(' -> ')}</code>`,
    ].join('\n');

    assertNoEmoji(text, 'formatModels');
    return text;
  }

  public static formatMemory(data: { activeProjectScope?: string; recentDeliverables?: Array<{ title: string; solver: string; summary: string }> }): string {
    const lines = [
      '<b>INFORMASI MEMORI & KONTEKS</b>',
      `Project Scope: <code>${data.activeProjectScope || 'default'}</code>`,
    ];

    if (data.recentDeliverables && data.recentDeliverables.length > 0) {
      lines.push('', '<b>Memori Proyek Terakhir:</b>');
      for (const d of data.recentDeliverables) {
        lines.push(`- <b>${escapeHtml(stripEmoji(d.title))}</b> (${escapeHtml(d.solver)}): ${escapeHtml(stripEmoji(d.summary).slice(0, 60))}...`);
      }
    } else {
      lines.push('Belum ada konteks tersimpan.');
    }

    const text = lines.join('\n');
    assertNoEmoji(text, 'formatMemory');
    return text;
  }

  public static formatNotifications(enabled: boolean): string {
    const text = [
      '<b>NOTIFIKASI TELEGRAM</b>',
      `Status: <code>${enabled ? 'AKTIF' : 'NONAKTIF'}</code>`,
      '',
      'Gunakan:',
      '<code>/notifications on</code> - Aktifkan notifikasi',
      '<code>/notifications off</code> - Matikan notifikasi',
    ].join('\n');

    assertNoEmoji(text, 'formatNotifications');
    return text;
  }

  public static formatSettings(settings: Record<string, unknown>): string {
    const lines = ['<b>KONFIGURASI AGENT OFFICE ROOM:</b>'];
    for (const [k, v] of Object.entries(settings)) {
      lines.push(`- ${escapeHtml(k)}: <code>${escapeHtml(String(v))}</code>`);
    }
    const text = lines.join('\n');
    assertNoEmoji(text, 'formatSettings');
    return text;
  }

  public static formatError(message: string, label = 'ERROR'): string {
    const text = [`<b>${label}</b>`, escapeHtml(stripEmoji(message))].join('\n');
    assertNoEmoji(text, 'formatError');
    return text;
  }
}
