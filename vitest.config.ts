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
    include: ["src/**/*.test.ts"],
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
      // Path aliases matching tsconfig.json
      "@": path.resolve(__dirname, "src"),
      // Stub native modules that can't run in Node
      "expo-sqlite": path.resolve(__dirname, "src/__mocks__/expo-sqlite.ts"),
      "expo-secure-store": path.resolve(__dirname, "src/__mocks__/expo-secure-store.ts"),
      "expo-localization": path.resolve(__dirname, "src/__mocks__/expo-localization.ts"),
      "expo-file-system/legacy": path.resolve(
        __dirname,
        "src/__mocks__/expo-file-system/legacy.ts",
      ),
      "react-native-mmkv": path.resolve(__dirname, "src/__mocks__/react-native-mmkv.ts"),
    },
  },
});
