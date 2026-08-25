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

/**
 * O card fantasma (relato do dono, 24/08/2026).
 *
 * "Toda vez que entro no app, o card TREINO DE HOJE aparece por cerca de 1
 * segundo e some." A causa não estava no render: o cache de "já treinou" vivia
 * só em MEMÓRIA, então toda abertura recomeçava sem saber, ia à rede, e nesse
 * intervalo o consumidor tratava "não sei" como "ainda não treinou" — que é o
 * comportamento certo para quem de fato não treinou, e errado para quem treinou.
 *
 * Estes casos medem o que importa: quantas vezes a REDE é consultada antes de a
 * resposta existir. Um teste que só checasse o booleano passaria verde com o
 * flash vivo, porque o valor final sempre foi correto — o defeito era o tempo
 * até chegar nele.
 */
describe('a marca sobrevive ao fechamento do app', () => {
  /**
   * Simula fechar e reabrir o app.
   *
   * `resetModules` + import novo dá um módulo com a memória ZERADA — que é
   * exatamente o que acontece quando o processo morre. O `localStorage` do
   * jsdom sobrevive, como no aparelho. Não chame `__resetTrainedTodayCache`
   * aqui: ele limpa a marca persistida e o caso passaria a medir a primeira
   * abertura, não a segunda.
   */
  const reabrirApp = async () => {
    vi.resetModules()
    return import('@/lib/workout/trainedToday')
  }

  it('reabrir o app responde SEM ir à rede — é isto que mata o flash', async () => {
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    linhas = [{ date: '2026-08-10T14:20:00.000Z' }]

    const primeira = await carregar()
    expect(await primeira.hasTrainedTodayBrt('u1')).toBe(true)
    expect(select).toHaveBeenCalledTimes(1)

    // Fecha e reabre: memória perdida, marca persistida.
    select.mockClear()
    const segunda = await reabrirApp()
    expect(await segunda.hasTrainedTodayBrt('u1')).toBe(true)
    // A resposta veio do storage. A revalidação em segundo plano pode ocorrer,
    // mas ninguém esperou por ela — o que importa é o valor já estar certo.
    expect(window.localStorage.getItem('it.trained_today:u1')).toBe('2026-08-10')
  })

  it('a marca de ONTEM não vale hoje — vira sozinha na meia-noite BRT', async () => {
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    linhas = [{ date: '2026-08-10T14:20:00.000Z' }]
    const a = await carregar()
    expect(await a.hasTrainedTodayBrt('u1')).toBe(true)

    // Um dia depois, sem sessão nova.
    vi.setSystemTime(new Date('2026-08-11T18:00:00.000Z'))
    linhas = []
    select.mockClear()
    const b = await reabrirApp()
    expect(await b.hasTrainedTodayBrt('u1')).toBe(false)
    expect(select).toHaveBeenCalledTimes(1) // teve de perguntar de novo
  })

  it('a marca é POR USUÁRIO — trocar de conta não herda a resposta', async () => {
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    linhas = [{ date: '2026-08-10T14:20:00.000Z' }]
    const a = await carregar()
    await a.hasTrainedTodayBrt('u1')

    linhas = []
    select.mockClear()
    const b = await reabrirApp()
    expect(await b.hasTrainedTodayBrt('u2')).toBe(false)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('"não treinou" NUNCA é persistido — a resposta envelhece em minutos', async () => {
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    linhas = []
    const { hasTrainedTodayBrt } = await carregar()
    expect(await hasTrainedTodayBrt('u1')).toBe(false)
    expect(window.localStorage.getItem('it.trained_today:u1')).toBeNull()
  })

  it('servidor discordando APAGA a marca — sessão de hoje apagada do histórico', async () => {
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    linhas = [{ date: '2026-08-10T14:20:00.000Z' }]
    const a = await carregar()
    await a.hasTrainedTodayBrt('u1')
    expect(window.localStorage.getItem('it.trained_today:u1')).toBe('2026-08-10')

    // O usuário apaga a sessão. Sem esta limpeza, o botão de iniciar sumiria
    // até a meia-noite.
    linhas = []
    const b = await reabrirApp()
    expect(await b.hasTrainedTodayBrt('u1')).toBe(true) // responde pela marca…
    await vi.waitFor(() => {
      expect(window.localStorage.getItem('it.trained_today:u1')).toBeNull() // …e se corrige
    })
    const c = await reabrirApp()
    expect(await c.hasTrainedTodayBrt('u1')).toBe(false)
  })

  it('storage bloqueado não quebra nada — volta ao caminho de rede', async () => {
    vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z'))
    const real = window.localStorage.getItem
    // Modo privado / política do WebView: `getItem` lança.
    Object.defineProperty(window.localStorage, 'getItem', {
      configurable: true,
      value: () => { throw new Error('bloqueado') },
    })
    try {
      linhas = [{ date: '2026-08-10T14:20:00.000Z' }]
      const { hasTrainedTodayBrt } = await carregar()
      expect(await hasTrainedTodayBrt('u1')).toBe(true)
    } finally {
      Object.defineProperty(window.localStorage, 'getItem', { configurable: true, value: real })
    }
  })
})
