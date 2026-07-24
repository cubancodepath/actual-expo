import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    // React Native provides this global at build time (Metro/Babel); Node
    // has no equivalent, so tests that exercise code paths gated on it
    // (e.g. src/core/db logging) need it defined explicitly.
    __DEV__: "false",
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    server: {
      deps: {
        // Prevent vitest from trying to parse react-native's Flow syntax
        external: [/react-native(?!-mmkv)/, /@react-native/],
      },
    },
  },
  resolve: {
    alias: {
      // Swap platform capabilities at the seam: tests run against the
      // index.node.ts implementation of each capability's interface, so the
      // suite depends on OUR contract, never on a native package's API shape.
      // ORDER MATTERS: these must come before the "@" prefix alias below.
      "@/core/platform/crypto": path.resolve(__dirname, "src/core/platform/crypto/index.node.ts"),
      "@/core/platform/keyStore": path.resolve(
        __dirname,
        "src/core/platform/keyStore/index.node.ts",
      ),
      "@/core/platform/location": path.resolve(
        __dirname,
        "src/core/platform/location/index.node.ts",
      ),
      "@/core/platform/asyncStorage": path.resolve(
        __dirname,
        "src/core/platform/asyncStorage/index.node.ts",
      ),
      "@/core/platform/fs": path.resolve(__dirname, "src/core/platform/fs/index.node.ts"),
      "@/core/platform/sqlite": path.resolve(__dirname, "src/core/platform/sqlite/index.node.ts"),
      // Path aliases matching tsconfig.json
      "@": path.resolve(__dirname, "src"),
      // Stub native modules that can't run in Node
      // expo-secure-store stays stubbed for APP-layer consumers outside the
      // platform seam (stores/sessionStore, stores/prefsStorage) — core goes
      // through @/core/platform/keyStore, which swaps to index.node.ts above.
      "expo-secure-store": path.resolve(__dirname, "src/__mocks__/expo-secure-store.ts"),
      "expo-localization": path.resolve(__dirname, "src/__mocks__/expo-localization.ts"),
      "react-native-mmkv": path.resolve(__dirname, "src/__mocks__/react-native-mmkv.ts"),
    },
  },
});
