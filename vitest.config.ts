import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // fileParallelism is disabled to prevent Windows SQLite file lock contention across test suites
    fileParallelism: false,
  },
});

