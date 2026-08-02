import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const postModal = read('src/components/workout/Modals.tsx')
const preModal = read('src/app/(app)/dashboard/DashboardModals.tsx')
const scale = read('src/components/workout/CheckinScale.tsx')

describe('check-out (pós-treino) — rótulo correto (guard)', () => {
  it('o eyebrow é CHECK-OUT, não CHECK-IN', () => {
    // Bug: o modal de PÓS-treino vinha rotulado "Check-in" — contraditório.
    const header = postModal.slice(0, postModal.indexOf('Pós-treino') + 40)
    expect(header).toContain('>Check-out<')
  })

  it('não usa mais o anglicismo "Soreness" (app é pt-BR)', () => {
    expect(postModal).not.toContain('Soreness')
    expect(postModal).toContain('Dor muscular')
  })
})

describe('check-out — escalas padronizadas (guard)', () => {
  it('RPE, Satisfação e Dor usam o MESMO componente de escala (1 toque)', () => {
    const uses = postModal.match(/<CheckinScale/g) || []
    expect(uses.length).toBe(3)
    // e não voltaram a ser <select>
    expect(postModal).not.toContain('checkin-rpe-label')
    expect(postModal).not.toContain('checkin-soreness-label')
  })

  it('a escala tem alvo de toque de 44px e preserva o "não informar" (Limpar)', () => {
    expect(scale).toContain('min-h-[44px]')
    expect(scale).toContain('Limpar')
  })

  it('o RPE tem âncora explicando a escala (alimenta a progressão)', () => {
    expect(postModal).toContain('falha total')
  })
})

describe('check-in (pré-treino) — peso editável (guard)', () => {
  it('o campo de peso é SEMPRE renderizado (não só quando o perfil não tem peso)', () => {
    // Bug: `{!profileBodyWeightKg ? (<input…/>) : (<card read-only/>)}` — quem já tinha
    // peso no perfil nunca conseguia atualizar o peso do dia aqui.
    expect(preModal).not.toContain('{!profileBodyWeightKg ? (')
    expect(preModal).toContain('id="precheckin-weight"')
  })

  it('o peso confirmado é salvo ao continuar (senão a tendência se perde)', () => {
    expect(preModal).toContain('preCheckinResolvedDraft()')
  })

  it('exibe o peso em pt-BR (vírgula decimal)', () => {
    expect(preModal).toContain('formatKgPtBr')
    expect(preModal).toContain("toLocaleString('pt-BR'")
  })
})
