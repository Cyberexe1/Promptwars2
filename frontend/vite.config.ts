import react from '@vitejs/plugin-react';
// `vitest/config` re-exports Vite's defineConfig and adds the `test` key.
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Content-hashed filenames let CloudFront cache assets aggressively while
    // still picking up new deployments immediately.
    sourcemap: false,
    rollupOptions: {
      output: {
        // React and the router change far less often than application code,
        // so splitting them keeps those cache entries valid across
        // deployments that only touch our own source.
        manualChunks(id: string) {
          // Router first: its paths also contain "react".
          if (id.includes('node_modules/react-router')) return 'router';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
    // Needed so `?raw` stylesheet imports resolve to their contents. With the
    // default of false they resolve to an empty string, which would let the
    // stylesheet guard tests pass without checking anything.
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vitest.d.ts'],
      // Floors set just under current coverage, so a component or module
      // slipping in untested fails the build.
      thresholds: {
        statements: 93,
        branches: 86,
        functions: 95,
        lines: 94,
      },
    },
  },
});
