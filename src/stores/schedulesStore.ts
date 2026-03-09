import { create } from 'zustand';
import { registerStore } from './storeRegistry';
import {
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  skipNextDate,
  postTransactionForSchedule,
} from '../schedules';
import type { Schedule, RuleCondition } from '../schedules/types';

type SchedulesState = {
  schedules: Schedule[];
  loading: boolean;
  load(): Promise<void>;
  create(opts: {
    schedule?: Partial<Schedule> & { id?: string };
    conditions: RuleCondition[];
  }): Promise<string>;
  update(opts: {
    schedule: Partial<Schedule> & { id: string };
    conditions?: RuleCondition[];
    resetNextDate?: boolean;
  }): Promise<string>;
  delete_(id: string): Promise<void>;
  skip(id: string): Promise<void>;
  postTransaction(id: string): Promise<void>;
};

export const useSchedulesStore = create<SchedulesState>((set) => ({
  schedules: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const schedules = await getSchedules();
      if (__DEV__) console.log('[schedulesStore] loaded', schedules.length, 'schedules', schedules.map(s => ({ id: s.id.slice(0, 8), next_date: s.next_date, _account: s._account?.slice(0, 8), _payee: s._payee?.slice(0, 8), completed: s.completed })));
      set({ schedules });
    } finally {
      set({ loading: false });
    }
  },

  async create(opts) {
    return createSchedule(opts);
  },

  async update(opts) {
    return updateSchedule(opts);
  },

  async delete_(id) {
    return deleteSchedule(id);
  },

  async skip(id) {
    return skipNextDate(id);
  },

  async postTransaction(id) {
    return postTransactionForSchedule(id);
  },
}));

registerStore('schedules', ['schedules', 'schedules_next_date', 'rules'], () =>
  useSchedulesStore.getState().load(),
);
