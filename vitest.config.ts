import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['utils/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: true,
  },
  // View tests render Hono JSX components. esbuild picks its loader from the
  // file extension, so `.ts` files aren't parsed as JSX by default. Force the
  // `ts` loader to accept JSX and use hono/jsx's automatic runtime so a
  // `tests/*.test.ts` file can mount and render components.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
    loader: 'tsx',
    include: [/\.[jt]sx?$/],
  },
});
