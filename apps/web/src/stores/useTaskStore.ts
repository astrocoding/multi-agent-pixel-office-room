import { create } from 'zustand';
import type { Task, ToolExecutionRecord, ClarificationRequest } from '@agent-office/shared';

interface TaskStoreState {
  tasks: Task[];
  activeTaskId: string | null;
  isSubmitting: boolean;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (task: Task) => void;
  setActiveTaskId: (id: string | null) => void;
  setIsSubmitting: (submitting: boolean) => void;
  addTerminalLog: (log: ToolExecutionRecord) => void;
  setClarification: (clarification: ClarificationRequest) => void;
}

export const useTaskStore = create<TaskStoreState>((set) => ({
  tasks: [],
  activeTaskId: null,
  isSubmitting: false,
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) =>
    set((s) => ({
      tasks: [task, ...s.tasks.filter((t) => t.id !== task.id)],
      activeTaskId: task.id,
    })),
  updateTask: (task) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              ...task,
              terminalLogs: task.terminalLogs?.length ? task.terminalLogs : t.terminalLogs,
              attachments: task.attachments?.length ? task.attachments : t.attachments,
              clarification: task.clarification !== undefined ? task.clarification : t.clarification,
            }
          : t
      ),
    })),
  setActiveTaskId: (id) => set({ activeTaskId: id }),
  setIsSubmitting: (isSubmitting) => set({ isSubmitting }),
  addTerminalLog: (log) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === (log.taskId || s.activeTaskId)
          ? {
              ...t,
              terminalLogs: [...(t.terminalLogs || []).filter((l) => l.id !== log.id), log],
            }
          : t
      ),
    })),
  setClarification: (clarification) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === clarification.taskId
          ? { ...t, clarification, status: 'waiting_approval' }
          : t
      ),
    })),
}));
