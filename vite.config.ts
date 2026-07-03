/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Growth/decay tests tick the full pipeline thousands of times.
    testTimeout: 30000,
  },
});
