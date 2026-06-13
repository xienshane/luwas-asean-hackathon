import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Mirrors the "@/*" path alias from tsconfig.json so lib code imports the same way in tests.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    environment: 'node',
  },
});
