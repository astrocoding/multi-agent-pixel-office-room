import type { InternalApiTask, InternalApiApproval } from '../../../integrations/agent-office/agentOfficeClient.js';
import { assertNoEmoji } from '../../../shared/utils/noEmoji.js';

export class KeyboardBuilder {
  public static buildMainMenuKeyboard(isOwner: boolean): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    const rows = [
      [
        { text: 'STATUS', callback_data: '/status' },
        { text: 'AGENTS', callback_data: '/agents' },
      ],
      [
        { text: 'TASKS', callback_data: '/tasks' },
        { text: 'APPROVALS', callback_data: '/approvals' },
      ],
      [
        { text: 'MODELS', callback_data: '/models' },
        { text: 'ACTIVITY', callback_data: '/activity' },
      ],
      [
        { text: 'HISTORY', callback_data: '/history' },
        { text: 'MEMORY', callback_data: '/memory' },
      ],
      [
        { text: 'HELP', callback_data: '/help' },
        { text: 'SETTINGS', callback_data: '/settings' },
      ],
    ];

    for (const row of rows) {
      for (const btn of row) {
        assertNoEmoji(btn.text, 'mainMenuKeyboard');
      }
    }

    return { inline_keyboard: rows };
  }

  public static buildTasksKeyboard(tasks: InternalApiTask[]): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];

    // Up to 5 actionable task rows
    for (const t of tasks.slice(0, 5)) {
      rows.push([
        { text: `VIEW: ${t.id}`, callback_data: `/task_detail ${t.id}` },
        { text: `CANCEL`, callback_data: `/cancel ${t.id}` },
      ]);
    }

    rows.push([
      { text: 'REFRESH TASKS', callback_data: '/tasks' },
      { text: 'MAIN MENU', callback_data: '/start' },
    ]);

    for (const row of rows) {
      for (const btn of row) {
        assertNoEmoji(btn.text, 'tasksKeyboard');
      }
    }

    return { inline_keyboard: rows };
  }

  public static buildTaskDetailKeyboard(taskId: string): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    const rows = [
      [
        { text: 'REFRESH DETAIL', callback_data: `/task_detail ${taskId}` },
        { text: 'CANCEL TASK', callback_data: `/cancel ${taskId}` },
      ],
      [
        { text: 'ALL TASKS', callback_data: '/tasks' },
        { text: 'MAIN MENU', callback_data: '/start' },
      ],
    ];

    return { inline_keyboard: rows };
  }

  public static buildApprovalsKeyboard(approvals: InternalApiApproval[]): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];

    for (const a of approvals.slice(0, 4)) {
      rows.push([
        { text: `APPROVE: ${a.id}`, callback_data: `/approve ${a.id}` },
        { text: `REJECT: ${a.id}`, callback_data: `/reject ${a.id}` },
      ]);
    }

    rows.push([
      { text: 'REFRESH APPROVALS', callback_data: '/approvals' },
      { text: 'MAIN MENU', callback_data: '/start' },
    ]);

    for (const row of rows) {
      for (const btn of row) {
        assertNoEmoji(btn.text, 'approvalsKeyboard');
      }
    }

    return { inline_keyboard: rows };
  }

  public static buildStatusKeyboard(): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    return {
      inline_keyboard: [
        [
          { text: 'REFRESH STATUS', callback_data: '/status' },
          { text: 'VIEW AGENTS', callback_data: '/agents' },
        ],
        [
          { text: 'VIEW TASKS', callback_data: '/tasks' },
          { text: 'VIEW APPROVALS', callback_data: '/approvals' },
        ],
        [
          { text: 'MAIN MENU', callback_data: '/start' },
        ],
      ],
    };
  }

  public static buildAgentsKeyboard(): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    return {
      inline_keyboard: [
        [
          { text: 'CHAT ZEN', callback_data: '/chat zen Siap mulai tugas?' },
          { text: 'CHAT IKY', callback_data: '/chat iky Status arsitektur?' },
        ],
        [
          { text: 'CHAT DRE', callback_data: '/chat dre Status riset?' },
          { text: 'CHAT GUS', callback_data: '/chat gus Status otomasi?' },
        ],
        [
          { text: 'CHAT RAI', callback_data: '/chat rai Status audit QA?' },
          { text: 'CHAT DHEA', callback_data: '/chat dhea Status memori?' },
        ],
        [
          { text: 'STATUS', callback_data: '/status' },
          { text: 'MAIN MENU', callback_data: '/start' },
        ],
      ],
    };
  }

  public static buildModelsKeyboard(): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    return {
      inline_keyboard: [
        [
          { text: 'REFRESH MODELS', callback_data: '/models' },
          { text: 'VIEW MEMORY', callback_data: '/memory' },
        ],
        [
          { text: 'MAIN MENU', callback_data: '/start' },
        ],
      ],
    };
  }

  public static buildNotificationsKeyboard(): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    return {
      inline_keyboard: [
        [
          { text: 'TURN ON', callback_data: '/notifications on' },
          { text: 'TURN OFF', callback_data: '/notifications off' },
        ],
        [
          { text: 'MAIN MENU', callback_data: '/start' },
        ],
      ],
    };
  }
}

