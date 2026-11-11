import { TelegramDb } from '../../../infrastructure/database/telegramDb.js';
import { DeliveryService } from '../../delivery/application/deliveryService.js';
import { MessageFormatter } from '../../delivery/infrastructure/messageFormatter.js';
import { Logger } from '../../../infrastructure/logging/logger.js';

export interface TaskCompletedNotification {
  taskId: string;
  title: string;
  solverName: string;
  deliverableSnippet?: string;
}

export interface TaskFailedNotification {
  taskId: string;
  title: string;
  reason: string;
}

export interface ApprovalRequiredNotification {
  approvalId: string;
  taskId: string;
  actionDescription: string;
  riskLevel: string;
  reason?: string;
}

export class NotificationService {
  private deliveryService: DeliveryService;

  constructor(deliveryService: DeliveryService) {
    this.deliveryService = deliveryService;
  }

  public async notifyTaskCompleted(chatId: number, data: TaskCompletedNotification): Promise<void> {
    const pref = await TelegramDb.getNotificationPreferences(chatId);
    if (!pref.enabled || !pref.notifyTaskCompleted) return;

    const message = [
      'TASK COMPLETED',
      `ID: ${data.taskId}`,
      `Judul: ${data.title.slice(0, 60)}`,
      `Dikerjakan Oleh: ${data.solverName}`,
      data.deliverableSnippet ? `Ringkasan: ${data.deliverableSnippet.slice(0, 150)}` : '',
    ].filter(Boolean).join('\n');

    await this.deliveryService.sendNotification(chatId, message);
  }

  public async notifyTaskFailed(chatId: number, data: TaskFailedNotification): Promise<void> {
    const pref = await TelegramDb.getNotificationPreferences(chatId);
    if (!pref.enabled || !pref.notifyTaskFailed) return;

    const message = [
      'TASK FAILED',
      `ID: ${data.taskId}`,
      `Judul: ${data.title.slice(0, 60)}`,
      `Penyebab: ${data.reason.slice(0, 100)}`,
    ].join('\n');

    await this.deliveryService.sendNotification(chatId, message);
  }

  public async notifyApprovalRequired(chatId: number, data: ApprovalRequiredNotification): Promise<void> {
    const pref = await TelegramDb.getNotificationPreferences(chatId);
    if (!pref.enabled || !pref.notifyApprovalRequired) return;

    const message = [
      'APPROVAL REQUIRED',
      `ID: ${data.approvalId}`,
      `Tugas: ${data.taskId}`,
      `Tindakan: ${data.actionDescription.slice(0, 80)}`,
      `Tingkat Risiko: ${data.riskLevel.toUpperCase()}`,
      `Gunakan /approve ${data.approvalId} atau /reject ${data.approvalId}`,
    ].join('\n');

    await this.deliveryService.sendNotification(chatId, message);
  }
}

