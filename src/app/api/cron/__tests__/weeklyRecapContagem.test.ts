/**
 * Guard de FIAÇÃO do push "Resumo da semana 📊".
 *
 * O critério (`countsAsWorkout`) e a semana BRT (`previousWeekRangeBrt`) passam
 * verdes isolados enquanto o cron continua somando linhas — foi assim que o
 * dono recebeu "Você fez 7 treinos" tendo feito 5 (24/08/2026). Aqui o teste
 * EXERCITA a rota com o Supabase mockado e lê a mensagem que seria enviada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rows, notifs, query } = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  notifs: [] as Array<Record<string, unknown>>,
  query: { gte: '', lt: '', completedFilter: false, columns: '' },
}))

vi.mock('@/utils/cron/auth', () => ({ isCronAuthorized: () => true }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn() }))
vi.mock('@/lib/social/notifyFollowers', () => ({
  insertNotifications: vi.fn(async (list: Array<Record<string, unknown>>) => { notifs.push(...list) }),
}))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const builder = {
        select: (cols: string) => { query.columns = cols; return builder },
        eq: () => builder,
        not: (col: string) => { if (col === 'completed_at') query.completedFilter = true; return builder },
        gte: (_c: string, v: string) => { query.gte = v; return builder },
        lt: (_c: string, v: string) => { query.lt = v; return builder },
        limit: () => Promise.resolve({ data: rows, error: null }),
      }
      return builder
    },
  }),
}))

import { GET } from '../weekly-recap/route'

const UID = 'user-1'
const sessao = (doneSets: number, minutes: number, extraNotDone = 0) =>
  JSON.stringify({
    totalTime: minutes * 60,
    logs: Object.fromEntries([
      ...Array.from({ length: doneSets }, (_, i) => [`0-${i}`, { done: true }]),
      ...Array.from({ length: extraNotDone }, (_, i) => [`1-${i}`, { weight: '40' }]),
    ]),
  })

const req = () => new Request('https://irontracks.com.br/api/cron/weekly-recap')

describe('weekly-recap — a contagem que vai no push', () => {
  beforeEach(() => {
    rows.length = 0
    notifs.length = 0
    query.gte = ''; query.lt = ''; query.completedFilter = false; query.columns = ''
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T11:00:00Z')) // segunda, 08:00 BRT
  })

  it('a semana real do dono vira "5 treinos", não 7', async () => {
    rows.push(
      { user_id: UID, notes: sessao(29, 104) }, // seg
      { user_id: UID, notes: sessao(16, 63) },  // ter
      { user_id: UID, notes: sessao(28, 89) },  // qua
      { user_id: UID, notes: sessao(1, 1, 29) }, // qua 11:37 — duplicata de 62 s
      { user_id: UID, notes: sessao(24, 67) },  // qui
      { user_id: UID, notes: sessao(27, 85) },  // sex
      { user_id: UID, notes: sessao(1, 11) },   // sáb 00:37 — 11 min, 1 série
    )
    await GET(req())

    expect(notifs).toHaveLength(1)
    expect(notifs[0].message).toBe('Você fez 5 treinos na semana passada. Bora pra mais uma!')
    expect((notifs[0].metadata as { workouts: number }).workouts).toBe(5)
  })

  it('quem só tem sessão-lixo não recebe push nenhum', async () => {
    rows.push({ user_id: UID, notes: sessao(1, 2) }, { user_id: UID, notes: sessao(0, 1) })
    await GET(req())
    expect(notifs).toHaveLength(0)
  })

  it('a janela é domingo→sábado em BRT, não segunda→domingo em UTC', async () => {
    await GET(req())
    // Domingo 16/08 00:00 BRT (inclusivo) → domingo 23/08 00:00 BRT (exclusivo).
    // Era `'2026-08-17'` a `'2026-08-24'` em UTC: perdia o domingo e ainda
    // começava às 21h do domingo anterior.
    expect(query.gte).toBe('2026-08-16T03:00:00.000Z')
    expect(query.lt).toBe('2026-08-23T03:00:00.000Z')
  })

  it('só sessão CONCLUÍDA entra — rascunho não é treino', async () => {
    await GET(req())
    expect(query.completedFilter).toBe(true)
  })

  it('precisa do `notes` para aplicar o critério (select antigo trazia só user_id)', async () => {
    await GET(req())
    expect(query.columns).toContain('notes')
  })

  it('singular quando é um treino só', async () => {
    rows.push({ user_id: UID, notes: sessao(12, 45) })
    await GET(req())
    expect(notifs[0].message).toContain('1 treino na semana')
  })
})
