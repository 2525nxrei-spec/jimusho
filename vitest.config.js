import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['functions/**/*.js', 'workers/**/*.js'],
      exclude: ['**/node_modules/**'],
      reporter: ['text', 'text-summary'],
    },
  },
});
