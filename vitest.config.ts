import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['utils/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: true,
  },
});
