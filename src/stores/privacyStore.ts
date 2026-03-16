import { create } from "zustand";
import { createMMKV } from "react-native-mmkv";

const mmkv = createMMKV({ id: "actual-privacy" });

type PrivacyState = {
  privacyMode: boolean;
  toggle(): void;
};

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  privacyMode: mmkv.getBoolean("privacyMode") ?? false,
  toggle() {
    const next = !get().privacyMode;
    mmkv.set("privacyMode", next);
    set({ privacyMode: next });
  },
}));
