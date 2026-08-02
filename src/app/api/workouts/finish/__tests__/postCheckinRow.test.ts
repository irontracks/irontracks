import { describe, it, expect } from 'vitest'
import { buildPostCheckinRow } from '../postCheckinRow'

const opts = { userId: 'u1', workoutId: 'w1' }

describe('buildPostCheckinRow', () => {
  it('mapeia o shape plano real do check-out (strings) para colunas + answers', () => {
    const row = buildPostCheckinRow({ rpe: '8', satisfaction: '4', soreness: '3', notes: 'pesado' }, opts)
    expect(row).toEqual({
      user_id: 'u1',
      kind: 'post',
      workout_id: 'w1',
      soreness: 3,
      notes: 'pesado',
      answers: { rpe: 8, satisfaction: 4, soreness: 3 },
    })
  })

  it('aceita o wrapper aninhado em answers', () => {
    const row = buildPostCheckinRow({ answers: { rpe: 9, satisfaction: 5, soreness: 2 } }, opts)
    expect(row?.answers).toEqual({ rpe: 9, satisfaction: 5, soreness: 2 })
    expect(row?.soreness).toBe(2)
  })

  it('clampa faixas (rpe/soreness 0-10, satisfação 0-5) e arredonda', () => {
    const row = buildPostCheckinRow({ rpe: '15', satisfaction: '9', soreness: '-4' }, opts)
    expect(row?.answers.rpe).toBe(10)
    expect(row?.answers.satisfaction).toBe(5)
    expect(row?.answers.soreness).toBe(0)
    expect(row?.soreness).toBe(0)
  })

  it('omite campos ausentes do answers mas grava os presentes', () => {
    const row = buildPostCheckinRow({ rpe: '7' }, opts)
    expect(row?.answers).toEqual({ rpe: 7 })
    expect(row?.soreness).toBeNull()
    expect(row?.notes).toBeNull()
  })

  it('grava só notas quando é o único campo informado', () => {
    const row = buildPostCheckinRow({ notes: '  ajustar carga  ' }, opts)
    expect(row).toMatchObject({ notes: 'ajustar carga', answers: {} })
  })

  it('retorna null quando o usuário pulou o check-out (tudo vazio)', () => {
    expect(buildPostCheckinRow(null, opts)).toBeNull()
    expect(buildPostCheckinRow(undefined, opts)).toBeNull()
    expect(buildPostCheckinRow({}, opts)).toBeNull()
    expect(buildPostCheckinRow({ rpe: '', satisfaction: '', soreness: '', notes: '   ' }, opts)).toBeNull()
  })

  it('retorna null sem ids válidos (não grava lixo)', () => {
    expect(buildPostCheckinRow({ rpe: '8' }, { userId: '', workoutId: 'w1' })).toBeNull()
    expect(buildPostCheckinRow({ rpe: '8' }, { userId: 'u1', workoutId: '' })).toBeNull()
  })

  it('ignora valores não numéricos sem quebrar', () => {
    const row = buildPostCheckinRow({ rpe: 'abc', soreness: '4' }, opts)
    expect(row?.answers).toEqual({ soreness: 4 })
    expect(row?.soreness).toBe(4)
  })
})
