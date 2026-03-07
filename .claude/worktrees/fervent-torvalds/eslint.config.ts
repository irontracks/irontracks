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
])

