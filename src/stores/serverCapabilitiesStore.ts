import { create } from "zustand";
import { persist } from "zustand/middleware";
import { mmkvStorage } from "./prefsStorage";
import { resolveFeatures, type ServerFeatures } from "../services/serverFeatures";

// ---------------------------------------------------------------------------
// Server capabilities store — the connected server version + derived features.
// ---------------------------------------------------------------------------
// `serverFeatures` is derived from `serverVersion` via resolveFeatures. Only the
// version is persisted; features are recomputed on rehydrate (see `merge`) so a
// hydrated version always yields the correct feature set.

const DEFAULT_VERSION = "0.0.0";

type ServerCapabilitiesState = {
  serverVersion: string;
  serverFeatures: ServerFeatures;

  setServerVersion(version: string): void;
  reset(): void;
};

export const useServerCapabilitiesStore = create<ServerCapabilitiesState>()(
  persist(
    (set) => ({
      serverVersion: DEFAULT_VERSION,
      serverFeatures: resolveFeatures(DEFAULT_VERSION),

      setServerVersion(version: string) {
        set({ serverVersion: version, serverFeatures: resolveFeatures(version) });
      },

      reset() {
        set({
          serverVersion: DEFAULT_VERSION,
          serverFeatures: resolveFeatures(DEFAULT_VERSION),
        });
      },
    }),
    {
      name: "server-capabilities",
      storage: mmkvStorage,
      partialize: (state) => ({ serverVersion: state.serverVersion }),
      // Recompute derived features from the persisted version on rehydrate.
      merge: (persisted, current) => {
        const version =
          (persisted as { serverVersion?: string } | undefined)?.serverVersion ??
          current.serverVersion;
        return { ...current, serverVersion: version, serverFeatures: resolveFeatures(version) };
      },
    },
  ),
);
