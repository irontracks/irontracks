import { describe, it, expect } from 'vitest'
import { reassignWorkoutDaysByOrder } from '@/utils/workout/reassignDaysByOrder'

const t = (...titles: string[]) => titles.map((title, i) => ({ id: String(i), title, sort_order: i }))
const titles = (items: { title: string }[]) => items.map((i) => i.title)

describe('reassignWorkoutDaysByOrder — a ordem manda no dia', () => {
  it('o caso do dono: arrastar a QUI pra cima da QUA troca os dias', () => {
    // Lista real: SEG/TER/QUA/QUI. O usuário arrasta a quinta pra frente da quarta.
    const afterDrag = t(
      'SEG · LOWER B - POSTERIOR',
      'TER · UPPER A — COSTAS + OMBRO',
      'QUI · LOWER A — QUADRÍCEPS',   // veio da 4ª posição
      'QUA · PUMP - OMBROS + BRAÇOS',
    )
    expect(titles(reassignWorkoutDaysByOrder(afterDrag))).toEqual([
      'SEG · LOWER B - POSTERIOR',
      'TER · UPPER A — COSTAS + OMBRO',
      'QUA · LOWER A — QUADRÍCEPS',   // ← agora é quarta
      'QUI · PUMP - OMBROS + BRAÇOS', // ← agora é quinta
    ])
  })

  it('não INVENTA dias — reaproveita só os que já existiam', () => {
    // Quem treina SEG/TER/QUI/SEX continua com SEG/TER/QUI/SEX (não vira SEG/TER/QUA/QUI).
    const afterDrag = t('SEX · D', 'SEG · A', 'QUI · C', 'TER · B')
    expect(titles(reassignWorkoutDaysByOrder(afterDrag))).toEqual(['SEG · D', 'TER · A', 'QUI · C', 'SEX · B'])
  })

  it('treino SEM prefixo não ganha dia e não entra no rodízio', () => {
    const afterDrag = t('QUA · Pump', 'Cardio livre', 'SEG · Lower')
    expect(titles(reassignWorkoutDaysByOrder(afterDrag))).toEqual([
      'SEG · Pump',      // 1º treino-com-dia recebe o 1º dia cronológico
      'Cardio livre',    // intocado
      'QUA · Lower',
    ])
  })

  it('preserva o texto original do token (não normaliza "Segunda" pra "SEG")', () => {
    const afterDrag = t('Terça - B', 'Segunda - A')
    expect(titles(reassignWorkoutDaysByOrder(afterDrag))).toEqual(['Segunda - B', 'Terça - A'])
  })

  it('preserva o separador e o resto do título, seja qual for', () => {
    const afterDrag = t('TER: Upper A / puxada', 'SEG: Lower B')
    expect(titles(reassignWorkoutDaysByOrder(afterDrag))).toEqual(['SEG: Upper A / puxada', 'TER: Lower B'])
  })

  it('domingo é o FIM da semana, não o começo', () => {
    const afterDrag = t('DOM · Full', 'SEG · A')
    expect(titles(reassignWorkoutDaysByOrder(afterDrag))).toEqual(['SEG · Full', 'DOM · A'])
  })

  it('lista já em ordem cronológica não muda nada', () => {
    const list = t('SEG · A', 'TER · B', 'QUA · C')
    expect(titles(reassignWorkoutDaysByOrder(list))).toEqual(['SEG · A', 'TER · B', 'QUA · C'])
  })

  it('nada a fazer com 0 ou 1 treino-com-dia', () => {
    expect(titles(reassignWorkoutDaysByOrder(t('Cardio', 'Mobilidade')))).toEqual(['Cardio', 'Mobilidade'])
    expect(titles(reassignWorkoutDaysByOrder(t('QUA · Único', 'Cardio')))).toEqual(['QUA · Único', 'Cardio'])
  })

  it('não muta a lista de entrada', () => {
    const input = t('TER · B', 'SEG · A')
    const copy = titles(input)
    reassignWorkoutDaysByOrder(input)
    expect(titles(input)).toEqual(copy)
  })
})
