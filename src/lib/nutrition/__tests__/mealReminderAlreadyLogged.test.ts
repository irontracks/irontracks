import { describe, it, expect } from 'vitest'
import { chaveDaRefeicaoLancada, construirSetDeLancadas, removerJaLancados } from '../mealReminderAlreadyLogged'

describe('chaveDaRefeicaoLancada — normaliza acento e caixa', () => {
  it('"Almoço" e "almoco" produzem a MESMA chave', () => {
    expect(chaveDaRefeicaoLancada('u1', '2026-09-05', 'Almoço'))
      .toBe(chaveDaRefeicaoLancada('u1', '2026-09-05', 'almoco'))
  })

  it('usuário, dia ou nome diferentes produzem chaves DIFERENTES', () => {
    const base = chaveDaRefeicaoLancada('u1', '2026-09-05', 'Almoço')
    expect(chaveDaRefeicaoLancada('u2', '2026-09-05', 'Almoço')).not.toBe(base)
    expect(chaveDaRefeicaoLancada('u1', '2026-09-06', 'Almoço')).not.toBe(base)
    expect(chaveDaRefeicaoLancada('u1', '2026-09-05', 'Jantar')).not.toBe(base)
  })
})

describe('construirSetDeLancadas', () => {
  it('ignora linhas sem usuário, dia ou nome', () => {
    const set = construirSetDeLancadas([
      { user_id: '', date: '2026-09-05', food_name: 'Almoço' },
      { user_id: 'u1', date: '', food_name: 'Almoço' },
      { user_id: 'u1', date: '2026-09-05', food_name: '' },
    ])
    expect(set.size).toBe(0)
  })

  it('monta uma chave por linha válida', () => {
    const set = construirSetDeLancadas([
      { user_id: 'u1', date: '2026-09-05', food_name: 'Almoço' },
      { user_id: 'u1', date: '2026-09-05', food_name: 'Jantar' },
    ])
    expect(set.size).toBe(2)
    expect(set.has(chaveDaRefeicaoLancada('u1', '2026-09-05', 'Almoço'))).toBe(true)
  })
})

describe('removerJaLancados', () => {
  const item = (userId: string, dateKey: string, nomeDaRefeicao: string) => ({ userId, dateKey, nomeDaRefeicao, extra: 1 })

  it('mantém pendentes sem entrada correspondente', () => {
    const out = removerJaLancados([item('u1', '2026-09-05', 'Almoço')], new Set())
    expect(out).toHaveLength(1)
  })

  it('remove pendente cuja refeição já foi lançada', () => {
    const lancadas = construirSetDeLancadas([{ user_id: 'u1', date: '2026-09-05', food_name: 'Almoço' }])
    const out = removerJaLancados([item('u1', '2026-09-05', 'Almoço')], lancadas)
    expect(out).toHaveLength(0)
  })

  it('preserva os DEMAIS campos do item (não recria o objeto)', () => {
    const out = removerJaLancados([item('u1', '2026-09-05', 'Almoço')], new Set())
    expect(out[0].extra).toBe(1)
  })

  it('mistura: só remove os que batem, mantém o resto', () => {
    const lancadas = construirSetDeLancadas([{ user_id: 'u1', date: '2026-09-05', food_name: 'Almoço' }])
    const out = removerJaLancados([
      item('u1', '2026-09-05', 'Almoço'), // remove
      item('u1', '2026-09-05', 'Jantar'), // fica
      item('u2', '2026-09-05', 'Almoço'), // fica (outro usuário)
    ], lancadas)
    expect(out).toHaveLength(2)
  })
})
