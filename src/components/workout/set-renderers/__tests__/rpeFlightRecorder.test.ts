import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard: o flight-recorder do bug "digito e some" (RPE/reps) tem que
 * continuar fiado no normalSet.
 *
 * CONTEXTO: o usuário relatou perda intermitente do RPE digitado. As 4 camadas de
 * merge defensivo (useInputField → updateLog → handleUpdateSessionLog → reconciliação)
 * deveriam impedir isso, e não reproduz em dev. Em vez de reverter em SILÊNCIO, o
 * `useInputField` reporta ao Sentry (logWarnRemote) quando um valor DIGITADO é
 * descartado pro vazio — pra pegar a corrida no device real. Se alguém remover esse
 * repórter, o bug volta a ser invisível. Este guard trava a instrumentação.
 */
const SRC = readFileSync(
  join(process.cwd(), 'src/components/workout/set-renderers/normalSet.tsx'),
  'utf8',
)

describe('normalSet — flight-recorder do RPE/reps digitado', () => {
  it('importa o repórter remoto (logWarnRemote)', () => {
    expect(SRC).toMatch(/import\s*\{\s*logWarnRemote\s*\}\s*from\s*'@\/lib\/logger'/)
  })

  it('useInputField aceita um label e reporta quando descarta valor digitado', () => {
    // A assinatura precisa carregar o label pra identificar o campo no Sentry.
    expect(SRC).toMatch(/function useInputField\([\s\S]*?label\?:\s*string/)
    // O repórter dispara no caminho do descarte (valor digitado + externo vazio).
    expect(SRC).toMatch(/logWarnRemote\('workout\.input\.typed-value-discarded'/)
    // Só dispara com label E valor local não-vazio E externo vazio (não em sync legítimo).
    expect(SRC).toMatch(/if\s*\(label\s*&&\s*localValue\s*&&\s*!externalValue\)/)
  })

  it('os campos digitáveis (reps/rpe, incl. unilaterais) passam o label', () => {
    for (const label of ['reps', 'rpe', 'L_reps', 'R_reps', 'L_rpe', 'R_rpe']) {
      expect(SRC).toContain(`'${label}'`)
    }
  })
})
