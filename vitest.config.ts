import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        // Prevent vitest from trying to parse react-native's Flow syntax
        external: [/react-native/, /@react-native/],
      },
    },
  },
  resolve: {
    alias: {
      // Stub native modules that can't run in Node
      'expo-sqlite': new URL('src/__mocks__/expo-sqlite.ts', import.meta.url).pathname,
      'expo-crypto': new URL('src/__mocks__/expo-crypto.ts', import.meta.url).pathname,
      'expo-secure-store': new URL('src/__mocks__/expo-secure-store.ts', import.meta.url).pathname,
      'react-native-mmkv': new URL('src/__mocks__/react-native-mmkv.ts', import.meta.url).pathname,
    },
  },
});
