import { create } from 'zustand';
import { registerStore } from './storeRegistry';
import { getTags, createTag, updateTag, deleteTag } from '../tags';
import type { Tag } from '../tags/types';

type TagsState = {
  tags: Tag[];
  loading: boolean;
  load(): Promise<void>;
  create(fields: Pick<Tag, 'tag'> & Partial<Pick<Tag, 'color' | 'description'>>): Promise<string>;
  update(id: string, fields: Partial<Pick<Tag, 'tag' | 'color' | 'description'>>): Promise<void>;
  delete_(id: string): Promise<void>;
};

export const useTagsStore = create<TagsState>((set) => ({
  tags: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const tags = await getTags();
      set({ tags });
    } finally {
      set({ loading: false });
    }
  },

  async create(fields) {
    return createTag(fields);
  },

  async update(id, fields) {
    return updateTag(id, fields);
  },

  async delete_(id) {
    return deleteTag(id);
  },
}));

registerStore('tags', ['tags'], () => useTagsStore.getState().load());
