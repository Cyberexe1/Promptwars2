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
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
});
