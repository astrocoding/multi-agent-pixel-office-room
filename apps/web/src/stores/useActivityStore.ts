import { create } from 'zustand';
import type { TaskActivity } from '@agent-office/shared';

interface ActivityStoreState {
  activities: TaskActivity[];
  addActivity: (act: TaskActivity) => void;
  setActivities: (acts: TaskActivity[]) => void;
}

export const useActivityStore = create<ActivityStoreState>((set) => ({
  activities: [],
  addActivity: (act) =>
    set((s) => ({
      activities: [act, ...s.activities.slice(0, 49)],
    })),
  setActivities: (acts) => set({ activities: acts }),
}));

