import { describe, it, expect } from 'vitest'
import { inviteWorkoutKey, isInviteWorkoutAlreadySaved } from '@/utils/inviteWorkoutSave'

describe('inviteWorkoutKey', () => {
  it('normaliza título ignorando caixa e acento', () => {
    expect(inviteWorkoutKey({ title: 'Treino Perna' })).toBe(inviteWorkoutKey({ title: 'treino perna' }))
    expect(inviteWorkoutKey({ title: 'Costas & Bíceps' })).toBe(inviteWorkoutKey({ name: 'costas & biceps' }))
  })
  it('aceita `name` quando não há `title`', () => {
    expect(inviteWorkoutKey({ name: 'Full Body' })).toBe(inviteWorkoutKey({ title: 'Full Body' }))
  })
  it('vazio/sem título → chave vazia', () => {
    expect(inviteWorkoutKey({})).toBe('')
    expect(inviteWorkoutKey(null)).toBe('')
    expect(inviteWorkoutKey({ title: '   ' })).toBe('')
  })
})

describe('isInviteWorkoutAlreadySaved', () => {
  const saved = [{ title: 'A - Full Body' }, { title: 'Costas e Bíceps' }, { name: 'Perna Pesada' }]

  it('true quando já existe um treino com o mesmo título (case/acento-insensível)', () => {
    expect(isInviteWorkoutAlreadySaved({ title: 'costas e biceps' }, saved)).toBe(true)
    expect(isInviteWorkoutAlreadySaved({ name: 'PERNA PESADA' }, saved)).toBe(true)
  })

  it('false quando não há treino equivalente', () => {
    expect(isInviteWorkoutAlreadySaved({ title: 'Ombro e Trapézio' }, saved)).toBe(false)
  })

  it('convite sem título → false (não esconde a opção por engano)', () => {
    expect(isInviteWorkoutAlreadySaved({ exercises: [{}, {}] }, saved)).toBe(false)
    expect(isInviteWorkoutAlreadySaved({}, saved)).toBe(false)
  })

  it('lista de treinos vazia/inválida → false', () => {
    expect(isInviteWorkoutAlreadySaved({ title: 'Full Body' }, [])).toBe(false)
    expect(isInviteWorkoutAlreadySaved({ title: 'Full Body' }, null)).toBe(false)
  })
})
