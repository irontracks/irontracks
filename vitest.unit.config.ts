/**
 * vitest.unit.config.ts — Config mínimo para testes de funções puras (sem React, sem jsdom).
 *
 * Use: npx vitest run --config vitest.unit.config.ts src/utils/__tests__/...
 *
 * PROBLEMA: O vitest.config.ts principal (com @vitejs/plugin-react + jsdom) causa
 * timeout de 60s na inicialização do worker em alguns ambientes macOS.
 * Este config alternativo resolve isso usando o ambiente 'node' padrão
 * que não precisa inicializar jsdom nem plugins React.
 *
 * QUANDO USAR ESTE CONFIG:
 * - Testes de funções puras em src/utils/ e src/lib/ que não usam DOM/React.
 * - Desenvolvimento local quando o config principal travar.
 *
 * O config principal (vitest.config.ts) ainda é usado em CI e para testes de componente.
 */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    pool: 'forks',
    maxWorkers: 2,
    testTimeout: 30000,
    include: [
      'src/utils/__tests__/**/*.test.ts',
      'src/utils/calculations/__tests__/**/*.test.ts',
      'src/utils/vip/__tests__/**/*.test.ts',
      'src/lib/__tests__/**/*.test.ts',
      'src/lib/nutrition/__tests__/**/*.test.ts',
      'src/lib/social/__tests__/**/*.test.ts',
      'src/components/**/__tests__/*.logic.test.ts',
      'src/hooks/__tests__/*.logic.test.ts',
    ],
    exclude: ['node_modules'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: [
        'src/utils/**/*.ts',
        'src/lib/**/*.ts',
        'src/hooks/**/*.ts',
      ],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/node_modules/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
})
