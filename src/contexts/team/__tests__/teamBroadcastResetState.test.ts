import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regression guard: o provider de treino em dupla é montado uma vez e persiste
 * entre sessões. Sem resetar o estado efêmero ao trocar/encerrar a sessão,
 * `sessionPaused` (e os pendentes) vazavam e a sessão NOVA nascia "pausada",
 * travando o treino. E `exerciseControlUpdates` crescia sem limite (só era limpo
 * no handler `exercise_share_end`). Este guard trava os dois consertos no source.
 */
describe('useTeamBroadcast — reset de estado efêmero entre sessões', () => {
  const src = readFileSync('src/contexts/team/useTeamBroadcast.ts', 'utf8')

  it('tem um effect chaveado em [teamSession?.id] que zera sessionPaused e os pendentes', () => {
    // Recorta do primeiro setSessionPaused(false) até o fecho do effect com a dep.
    const start = src.indexOf('setSessionPaused(false)')
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, src.indexOf('[teamSession?.id]', start) + 20)
    expect(block).toMatch(/setSessionPaused\(false\)/)
    expect(block).toMatch(/setPendingChallenge\(null\)/)
    expect(block).toMatch(/setPendingWorkoutEdit\(null\)/)
    expect(block).toMatch(/setIncomingExerciseShare\(null\)/)
    expect(block).toMatch(/setExerciseControlUpdates\(\[\]\)/)
    expect(block).toMatch(/\}\s*,\s*\[teamSession\?\.id\]\s*\)/)
  })

  it('drena exerciseControlUpdates ao encerrar E ao dispensar o compartilhamento', () => {
    const endShare = src.slice(src.indexOf('const endExerciseShare'), src.indexOf('const dismissExerciseShare'))
    const dismiss = src.slice(src.indexOf('const dismissExerciseShare'), src.indexOf('const sendChatMessage'))
    expect(endShare).toMatch(/setExerciseControlUpdates\(\[\]\)/)
    expect(dismiss).toMatch(/setExerciseControlUpdates\(\[\]\)/)
  })
})
