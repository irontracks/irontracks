import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

import { DOM_TEST_FILES } from './vitest.domTests'

const alias = { '@': path.resolve(__dirname, 'src') }

const EXCLUDE = ['node_modules', 'dist', 'build', '.next', '.claude', '.trae', 'ios', 'android', 'scripts']

/**
 * Opções comuns aos dois projetos. `environment` fica de fora de propósito — é
 * justamente o que os diferencia.
 */
const shared = {
  globals: true,
  pool: 'threads' as const,
  setupFiles: ['src/__tests__/setup.ts'],

  /**
   * 15s em vez dos 5s default — a suíte cheia falhava de forma NÃO determinística
   * (ago/2026).
   *
   * Diagnóstico: os testes que quebravam eram sempre o PRIMEIRO caso de um arquivo
   * que faz `await import()` dinâmico do módulo sob teste. Isolado, `authRole` roda
   * em ~1,3s; sob a suíte inteira o mesmo caso levou 6028ms e estourou os 5s. Não há
   * retry nem timer no código testado — é o custo do primeiro carregamento do módulo
   * somado à contenção de CPU entre as threads. Como a ordem de execução varia, os
   * arquivos que falhavam variavam também, o que fazia o problema parecer aleatório.
   *
   * O timeout existe para pegar teste TRAVADO, não teste lento sob carga: 15s ainda
   * falha rápido num deadlock real, sem punir um import pesado.
   */
  testTimeout: 15_000,
  hookTimeout: 15_000,
}

/** Um projeto por ambiente — só mudam `name`, `environment` e o include. */
const project = (
  name: 'dom' | 'node',
  environment: 'jsdom' | 'node',
  include: string[],
  exclude: string[],
) => ({
  plugins: [react()],
  resolve: { alias },
  test: { ...shared, name, environment, include, exclude },
})

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    /**
     * DOIS projetos, separados por ambiente.
     *
     * Antes tudo rodava em jsdom: 371 arquivos montando um DOM inteiro cada, dos
     * quais só 39 usam DOM de fato. O custo aparecia em `environment` — 1813s, num
     * wall-clock de 322s. Separando, a suíte caiu para ~130s (2,5×) e o `environment`
     * para 235s, o que também alivia a contenção de CPU que causava a flakiness
     * descrita em `shared.testTimeout`.
     *
     * Convenção: `.test.tsx` = componente = jsdom · `.test.ts` = node, salvo a
     * exceção de `vitest.domTests.ts` (travada por guard).
     */
    projects: [
      project('dom', 'jsdom', ['src/**/*.{test,spec}.tsx', ...DOM_TEST_FILES], EXCLUDE),
      project('node', 'node', ['src/**/*.{test,spec}.ts'], [...EXCLUDE, ...DOM_TEST_FILES]),
    ],

    // Coverage with c8 (native V8 coverage)
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
        'src/types/**',
        'node_modules/**',
      ],
      // Coverage thresholds — increase as test coverage grows
      thresholds: {
        statements: 1,
        branches: 1,
        functions: 1,
        lines: 1,
      },
    },
  },
})
