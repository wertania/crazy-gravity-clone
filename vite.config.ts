import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  build: { target: 'es2022', outDir: 'dist', sourcemap: true },
  test: {
    // tests/e2e is Playwright's; vitest must not try to collect it.
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
  },
});
