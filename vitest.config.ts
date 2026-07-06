import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts (build config) so test-only settings never
// affect the production build. Run via `npm run test:unit`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // Vitest's default glob matches any *.test.*/*.spec.* file in the repo,
    // which also picks up scripts/*.test.mjs (run separately via Node's
    // native `node --test` runner, e.g. `npm run test:security`) and
    // e2e/*.spec.ts (Playwright specs, run via `npm run test:e2e`). Running
    // those under Vitest breaks their module resolution and test-framework
    // assumptions, so scope Vitest to only the unit tests it owns.
    include: ['src/test/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'scripts/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.d.ts', 'src/test/**'],
    },
  },
})
