import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Only the pure modules — SQL strings and helpers. Anything importing
    // expo-sqlite needs a device and is out of scope here.
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
