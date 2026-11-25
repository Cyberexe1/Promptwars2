import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
      // Floors set just under current coverage, so a module slipping in
      // untested fails the build. Not targets: the uncovered remainder is
      // mostly live AWS client code, which would need the SDK mocked wholesale
      // to reach, and mock-only coverage of it would prove little.
      thresholds: {
        statements: 84,
        branches: 76,
        functions: 86,
        lines: 84,
      },
    },
  },
});
