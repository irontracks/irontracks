import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Source-guard do builder de `reportHistory` para exercícios UNILATERAIS.
 *
 * O builder morava dentro de `useWorkoutDeload` (daí o guard ser de FONTE) e em
 * 12/09/2026 saiu para `lib/workout/reportHistoryFromWorkouts` — função pura que
 * o servidor também importa. O guard seguiu o CÓDIGO, não o arquivo antigo.
 *
 * Bug (beta do autoload, 23/07/2026): o builder lia reps/rpe assim —
 *
 *   const reps = toNumber(log.reps ?? null) ?? avgSideValues(log.L_reps, log.R_reps)
 *
 * `toNumber` devolve **0** (não null) para campo ausente, então o `??` NUNCA caía no
 * fallback por lado. O unilateral entrava no histórico com peso, mas reps=0 → o motor
 * descarta a série → autoload e watermark ficavam sem sugestão ("Flexora em pé").
 * O fix anterior (PR #521/#522) corrigiu só o PESO; reps/rpe seguiram quebrados.
 */
describe('builder de reportHistory — leitura de reps/rpe do unilateral', () => {
  const src = readFileSync('src/lib/workout/reportHistoryFromWorkouts.ts', 'utf8')

  it('usa os extractors dedicados (que checam > 0 antes de cair no fallback L/R)', () => {
    expect(src).toMatch(/const\s+reps\s*=\s*extractLogReps\(log\)/)
    expect(src).toMatch(/const\s+rpe\s*=\s*extractLogRpe\(log\)/)
  })

  it('não volta ao padrão `toNumber(...) ?? avgSideValues(...)` (o `??` nunca dispara)', () => {
    expect(src).not.toMatch(/toNumber\([^)]*\)\s*\?\?\s*avgSideValues/)
  })
})

/**
 * O `reportHistory` fica em cache no localStorage (TTL 15 min) e a rede é PULADA
 * enquanto o cache está fresco. Toda mudança no formato/preenchimento do histórico
 * precisa bumpar a chave, senão caches antigos (construídos pelo builder velho)
 * sobrevivem e o bug continua na tela do usuário mesmo com o código já corrigido.
 */
describe('REPORT_CACHE_KEY acompanha o builder', () => {
  const src = readFileSync('src/components/workout/utils.ts', 'utf8')

  it('está na v4 (v3 = builder sem reps/rpe do unilateral)', () => {
    expect(src).toMatch(/REPORT_CACHE_KEY\s*=\s*'irontracks\.report\.history\.v4'/)
  })
})
