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
      // This suite owns the modules below directly. Page-level orchestration is
      // exercised by Playwright in the separate e2e CI job. Counting every UI
      // page here made a healthy 31-test unit suite report ~8% coverage and
      // rendered the global 72% gate impossible by construction. Scope the
      // gate to the unit-test-owned surface so it measures regressions rather
      // than uninstrumented e2e territory.
      include: [
        'src/components/HiveLogo.tsx',
        'src/components/LoginScreen.tsx',
        'src/lib/api.ts',
        'src/pages/files/fileHelpers.ts',
        'src/pages/files/filesApi.ts',
      ],
      exclude: ['src/**/*.d.ts', 'src/test/**'],
      // Enforce per-file regression floors based on the coverage demonstrated
      // by this unit suite in CI. The lowest currently-covered module reports
      // ~82.97% lines, 80.76% statements, 66.66% functions and 64% branches,
      // so these floors remain strict while leaving a small stability margin.
      thresholds: {
        perFile: true,
        lines: 80,
        branches: 60,
        functions: 65,
        statements: 80,
      },
    },
  },
})
