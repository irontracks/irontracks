import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * "Já treinou hoje?" — o critério que esconde o atalho "Treinar agora" e cala a
 * pergunta "vai treinar hoje?". Duas armadilhas cobertas aqui:
 *
 * 1. O dia é o de SÃO PAULO. `workouts.date` é timestamp UTC; às 21h BRT o UTC
 *    já virou. Comparar o prefixo cru marca como "hoje" um treino de ontem e
 *    vice-versa — o mesmo erro que os crons já cometeram.
 * 2. A coluna `notes` guarda a sessão inteira. Selecioná-la para responder um
 *    booleano serviria centenas de KB por abertura do dashboard.
 */

const select = vi.fn()
const chamadas: { select?: string; eq: [string, unknown][] } = { eq: [] }
let linhas: { date: string }[] = []

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q = {
        select: (cols: string) => { chamadas.select = cols; select(cols); return q },
        eq: (col: string, val: unknown) => { chamadas.eq.push([col, val]); return q },
        order: () => q,
        limit: () => Promise.resolve({ data: linhas, error: null }),
      }
      return q
    },
  }),
}))

const carregar = async () => {
  const mod = await import('@/lib/workout/trainedToday')
  mod.__resetTrainedTodayCache()
  return mod
}

beforeEach(() => {
  chamadas.select = undefined
  chamadas.eq = []
  select.mockClear()
  linhas = []
})

afterEach(() => { vi.useRealTimers() })

describe('hasTrainedTodayBrt', () => {
  it('sem usuário responde não, sem consultar', async () => {
    const { hasTrainedTodayBrt } = await carregar()
    expect(await hasTrainedTodayBrt('   ')).toBe(false)
    expect(select).not.toHaveBeenCalled()
  })

  it('sessão concluída hoje (BRT) → true', async () => {
    // 10/08/2026 15:00 BRT = 18:00 UTC.
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    linhas = [{ date: '2026-08-10T14:20:00.000Z' }]
    const { hasTrainedTodayBrt } = await carregar()
    expect(await hasTrainedTodayBrt('u1')).toBe(true)
  })

  it('sessão de ontem → false', async () => {
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    linhas = [{ date: '2026-08-09T14:20:00.000Z' }]
    const { hasTrainedTodayBrt } = await carregar()
    expect(await hasTrainedTodayBrt('u1')).toBe(false)
  })

  /**
   * O caso que separa "dia BRT" de "prefixo do ISO": às 22h BRT do dia 10, o
   * UTC já é dia 11. Um treino gravado nesse instante é de HOJE para o usuário.
   */
  it('depois das 21h BRT o dia UTC já virou e o treino continua sendo de hoje', async () => {
    vi.setSystemTime(new Date('2026-08-11T01:30:00.000Z')) // 10/08 22:30 BRT
    linhas = [{ date: '2026-08-11T01:00:00.000Z' }] // 10/08 22:00 BRT
    const { hasTrainedTodayBrt } = await carregar()
    expect(await hasTrainedTodayBrt('u1')).toBe(true)
  })

  it('a query filtra sessões (não templates) e nunca lê `notes`', async () => {
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    linhas = []
    const { hasTrainedTodayBrt } = await carregar()
    await hasTrainedTodayBrt('u1')
    expect(chamadas.select).toBe('date')
    expect(chamadas.select).not.toMatch(/notes|\*/)
    expect(chamadas.eq).toContainEqual(['user_id', 'u1'])
    expect(chamadas.eq).toContainEqual(['is_template', false])
  })

  it('duas montagens simultâneas fazem uma consulta só', async () => {
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    linhas = [{ date: '2026-08-10T14:20:00.000Z' }]
    const { hasTrainedTodayBrt } = await carregar()
    const [a, b] = await Promise.all([hasTrainedTodayBrt('u1'), hasTrainedTodayBrt('u1')])
    expect([a, b]).toEqual([true, true])
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('"não treinou" não é memorizado — a resposta muda quando a sessão termina', async () => {
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    linhas = []
    const { hasTrainedTodayBrt } = await carregar()
    expect(await hasTrainedTodayBrt('u1')).toBe(false)
    linhas = [{ date: '2026-08-10T18:30:00.000Z' }]
    expect(await hasTrainedTodayBrt('u1')).toBe(true)
    expect(select).toHaveBeenCalledTimes(2)
  })
})
