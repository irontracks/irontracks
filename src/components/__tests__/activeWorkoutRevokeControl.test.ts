import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guard do Achado 2 (auditoria do controle professor->aluno): o aluno sob controle ATIVO
 * tem um botão "Retirar controle" na sessão que chama reject() — antes só dava pra sair
 * encerrando o treino.
 */
describe('ActiveWorkout — botão de revogar controle', () => {
  const aw = readFileSync('src/components/ActiveWorkout.tsx', 'utf8')
  const parent = readFileSync('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx', 'utf8')

  it('ActiveWorkout aceita onRevokeControl e mostra o botão que o chama', () => {
    expect(aw).toMatch(/onRevokeControl\?: \(\) => void \| Promise<void>/)
    expect(aw).toMatch(/Retirar controle/)
    expect(aw).toMatch(/onClick=\{\(\) => \{ void props\.onRevokeControl\?\.\(\) \}\}/)
  })

  it('o pai injeta controlNotice.reject como onRevokeControl', () => {
    expect(parent).toMatch(/onRevokeControl=\{controlNotice\.reject\}/)
  })
})
