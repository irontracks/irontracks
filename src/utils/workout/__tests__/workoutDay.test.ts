import { describe, it, expect } from 'vitest'
import { parseWorkoutDay, isWorkoutToday, pickEmphasizedWorkoutIndex, pickQuickStartWorkoutIndex } from '@/utils/workout/workoutDay'

describe('parseWorkoutDay', () => {
  it('lê abreviações no formato do app ("SEG · LOWER B")', () => {
    expect(parseWorkoutDay('SEG · LOWER B - POSTERIOR + GLÚTEO')).toBe(1)
    expect(parseWorkoutDay('TER · UPPER A — COSTAS + OMBRO')).toBe(2)
    expect(parseWorkoutDay('QUA · PUMP - OMBROS + BRAÇOS')).toBe(3)
    expect(parseWorkoutDay('QUI · LOWER A — QUADRÍCEPS')).toBe(4)
  })

  it('aceita nomes completos e acentos', () => {
    expect(parseWorkoutDay('Segunda-feira')).toBe(1)
    expect(parseWorkoutDay('SÁB - Full body')).toBe(6)
    expect(parseWorkoutDay('domingo leve')).toBe(0)
    expect(parseWorkoutDay('Terça · Push')).toBe(2)
    expect(parseWorkoutDay('SEX')).toBe(5)
  })

  it('lê o dia no FIM do título, entre parênteses — o padrão real do dono', () => {
    // A convenção do app documentava só o prefixo ("SEG · …"), mas os treinos em
    // produção se chamam "A - empurrar a (segunda)". Enquanto o parser olhava só
    // o primeiro token, o selo HOJE nunca aparecia para quem nomeia assim — a
    // feature existia e não disparava nunca (auditoria de design, ago/2026).
    expect(parseWorkoutDay('A - empurrar a (segunda)')).toBe(1)
    expect(parseWorkoutDay('B - puxar a (terça)')).toBe(2)
    expect(parseWorkoutDay('C - pernas a (quarta)')).toBe(3)
    expect(parseWorkoutDay('D - EMPURRAR B (QUINTA)')).toBe(4)
    expect(parseWorkoutDay('E - puxar b (sexta)')).toBe(5)
    expect(parseWorkoutDay('F - PERNAS B (SÁBADO)')).toBe(6)
  })

  it('NÃO casa prefixo solto de 3 letras dentro de outra palavra', () => {
    // A armadilha de aceitar dia em qualquer posição: casar por prefixo faria
    // "QUAdríceps" virar quarta e "TERra" virar terça — e o treino errado
    // receberia o selo HOJE. A comparação é exata por token.
    expect(parseWorkoutDay('Quadríceps e posterior')).toBeNull()
    expect(parseWorkoutDay('Terra e barra')).toBeNull()
    expect(parseWorkoutDay('Sexto treino')).toBeNull()
    expect(parseWorkoutDay('Dominada e remada')).toBeNull()
  })

  it('sem prefixo de dia → null', () => {
    expect(parseWorkoutDay('Treino A')).toBeNull()
    expect(parseWorkoutDay('Push day')).toBeNull()
    expect(parseWorkoutDay('')).toBeNull()
    expect(parseWorkoutDay(null)).toBeNull()
    expect(parseWorkoutDay(undefined)).toBeNull()
  })

  it('não confunde palavras que apenas começam parecido', () => {
    // "TREINO" começa com "TRE" — não é "TER"
    expect(parseWorkoutDay('Treino de força')).toBeNull()
  })
})

describe('isWorkoutToday', () => {
  // 2026-07-13 é uma segunda-feira (getDay() === 1)
  const segunda = new Date(2026, 6, 13, 10, 0, 0)
  const quarta = new Date(2026, 6, 15, 10, 0, 0)

  it('marca hoje quando o dia do título bate com o dia atual', () => {
    expect(isWorkoutToday('SEG · LOWER B', segunda)).toBe(true)
    expect(isWorkoutToday('QUA · PUMP', quarta)).toBe(true)
  })

  it('não marca quando o dia é diferente', () => {
    expect(isWorkoutToday('TER · UPPER A', segunda)).toBe(false)
    expect(isWorkoutToday('SEG · LOWER B', quarta)).toBe(false)
  })

  it('título sem dia nunca é hoje', () => {
    expect(isWorkoutToday('Treino A', segunda)).toBe(false)
  })
})

describe('pickEmphasizedWorkoutIndex', () => {
  const segunda = new Date(2026, 6, 13, 10, 0, 0) // segunda-feira

  it('destaca o índice do treino de hoje', () => {
    const titles = ['DOM · Descanso', 'SEG · Lower', 'TER · Upper']
    expect(pickEmphasizedWorkoutIndex(titles, segunda)).toBe(1)
  })

  it('sem treino de hoje → primeiro card (âncora)', () => {
    const titles = ['TER · Upper', 'QUA · Pump']
    expect(pickEmphasizedWorkoutIndex(titles, segunda)).toBe(0)
  })

  it('títulos sem dia → primeiro card', () => {
    expect(pickEmphasizedWorkoutIndex(['Peito', 'Costas'], segunda)).toBe(0)
  })

  it('lista vazia → -1', () => {
    expect(pickEmphasizedWorkoutIndex([], segunda)).toBe(-1)
  })
})

/**
 * `pickQuickStartWorkoutIndex` — o atalho do topo, que pode dizer NÃO.
 *
 * O relato (16/08/2026): no fim de semana o card anunciava "PRÓXIMO TREINO ·
 * SEG · Upper B" com o botão TREINAR AGORA. Quem escreve o dia no título tem
 * agenda, e agenda tem folga — o topo não pode convidar a adiantar segunda no
 * sábado.
 */
describe('pickQuickStartWorkoutIndex', () => {
  const sabado = new Date(2026, 7, 15, 10, 0, 0)  // sábado
  const segunda = new Date(2026, 7, 17, 0, 0, 1)  // segunda, logo após a meia-noite

  const semana = ['SEG · Upper B', 'TER · Lower A', 'QUA · Push', 'QUI · Pull', 'SEX · Legs']

  it('no dia do treino, escolhe o treino do dia', () => {
    expect(pickQuickStartWorkoutIndex(semana, segunda)).toBe(0)
  })

  it('fim de semana com a semana agendada → nenhum treino (-1)', () => {
    expect(pickQuickStartWorkoutIndex(semana, sabado)).toBe(-1)
  })

  it('quem NÃO agenda por dia continua vendo o primeiro', () => {
    expect(pickQuickStartWorkoutIndex(['Treino A', 'Treino B'], sabado)).toBe(0)
  })

  it('lista mista: no dia sem agenda, oferece o treino avulso', () => {
    expect(pickQuickStartWorkoutIndex([...semana, 'Cardio livre'], sabado)).toBe(5)
  })

  it('lista vazia → -1', () => {
    expect(pickQuickStartWorkoutIndex([], sabado)).toBe(-1)
  })
})
