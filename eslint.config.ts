import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    '.next/**',
    '.vercel/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '_archive/**',
    'claude/**',
    '_macro_mixer_orig/**',
    '_legacy_backup/**',
  ]),
  {
    rules: {
      // Proibir any explícito nas novas adições
      '@typescript-eslint/no-explicit-any': 'warn',
      // Evitar console.log em produção (use o logger)
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Garantir que promises sejam tratadas
      '@typescript-eslint/no-floating-promises': 'off', // ativar quando o projeto estiver 100% tipado
    },
  },
])

