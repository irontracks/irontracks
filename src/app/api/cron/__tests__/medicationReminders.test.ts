/**
 * Guard de FIAÇÃO do lembrete de medicamento.
 *
 * `agenda.ts` (a conta das doses) passa verde isolada enquanto o cron não liga
 * uma ponta na outra — é a classe de defeito em que a suíte deste repo já ficou
 * verde com a fiação quebrada. Aqui a rota é EXERCITADA com o Supabase mockado e
 * o teste lê a notificação que sairia.
 *
 * ⚠️ O mock DISTINGUE A TABELA: `medications` e `medication_intakes` têm cadeias
 * parecidas, e um mock que ignora o nome devolveria remédios como se fossem
 * tomadas (ou o contrário) — a mesma armadilha que já derrubou testes de nutrição.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const { estado } = vi.hoisted(() => ({
  estado: {
    autorizado: true,
    adminCriado: 0,
    medicamentos: [] as Array<Record<string, unknown>>,
    erroMedicamentos: null as { message: string } | null,
    colunasMedicamentos: '',
    filtros: [] as string[],
    tomadas: [] as Array<Record<string, unknown>>,
    erroTomadas: null as Error | null,
    colunasTomadas: '',
    notifs: [] as Array<Record<string, unknown>>,
    dedupe: 'set' as 'set' | 'exists' | 'unavailable',
    /** Resposta do dedupe por chave, quando o caso precisa de comportamento misto. */
    dedupePorChave: {} as Record<string, 'set' | 'exists' | 'unavailable'>,
    chaves: [] as string[],
  },
}))

vi.mock('@/utils/cron/auth', () => ({
  isCronAuthorized: () => estado.autorizado,
  isCronAuthorizedAsync: async () => estado.autorizado,
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logWarnRemote: vi.fn() }))
vi.mock('@/lib/social/notifyFollowers', () => ({
  insertNotifications: vi.fn(async (list: Array<Record<string, unknown>>) => {
    estado.notifs.push(...list)
    return { ok: true, inserted: list.length }
  }),
}))
vi.mock('@/utils/cache', () => ({
  cacheSetNxStatus: vi.fn(async (chave: string) => {
    estado.chaves.push(chave)
    return estado.dedupePorChave[chave] ?? estado.dedupe
  }),
}))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => {
    estado.adminCriado += 1
    return {
      from: (tabela: string) => {
        if (tabela === 'medication_intakes') {
          const builder = {
            select: (cols: string) => { estado.colunasTomadas = cols; return builder },
            in: () => builder,
            then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
              resolve({ data: estado.tomadas, error: estado.erroTomadas }),
          }
          return builder
        }
        if (tabela !== 'medications') throw new Error(`tabela inesperada: ${tabela}`)
        const builder = {
          select: (cols: string) => { estado.colunasMedicamentos = cols; return builder },
          eq: (c: string, v: unknown) => { estado.filtros.push(`eq:${c}=${String(v)}`); return builder },
          lte: (c: string, v: unknown) => { estado.filtros.push(`lte:${c}=${String(v)}`); return builder },
          or: (expr: string) => { estado.filtros.push(`or:${expr}`); return builder },
          limit: () => Promise.resolve({
            data: estado.erroMedicamentos ? null : estado.medicamentos,
            error: estado.erroMedicamentos,
          }),
        }
        return builder
      },
    }
  },
}))

import { GET } from '../medication-reminders/route'

const UID = 'user-1'
const req = () => new Request('https://irontracks.com.br/api/cron/medication-reminders')

const remedio = (id: string, name: string, times: string[], extra: Record<string, unknown> = {}) => ({
  id,
  user_id: UID,
  name,
  dose: null,
  times,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: '2026-08-01',
  end_date: null,
  active: true,
  created_at: '2026-08-01T00:00:00Z',
  ...extra,
})

describe('cron medication-reminders', () => {
  beforeEach(() => {
    estado.autorizado = true
    estado.adminCriado = 0
    estado.medicamentos = []
    estado.erroMedicamentos = null
    estado.colunasMedicamentos = ''
    estado.filtros = []
    estado.tomadas = []
    estado.erroTomadas = null
    estado.colunasTomadas = ''
    estado.notifs = []
    estado.dedupe = 'set'
    estado.dedupePorChave = {}
    estado.chaves = []
    vi.useFakeTimers()
    // Sábado 05/09/2026, 12:02 BRT — a janela cobre 11:57…12:02.
    vi.setSystemTime(new Date('2026-09-05T15:02:00Z'))
  })

  it('403 sem autorização — e SEM nem criar o client de service-role', async () => {
    estado.autorizado = false
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(estado.adminCriado).toBe(0)
    expect(estado.notifs).toHaveLength(0)
  })

  it('horário na janela vira UMA notificação com tipo, metadata e texto com nome e dose', async () => {
    estado.medicamentos = [remedio('m1', 'Losartana', ['12:00'], { dose: '50 mg' })]
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(estado.notifs).toHaveLength(1)
    const n = estado.notifs[0]
    expect(n.type).toBe('medication_reminder')
    expect(n.user_id).toBe(UID)
    expect(n.recipient_id).toBe(UID)
    expect(String(n.title)).toContain('12:00')
    expect(String(n.title)).toContain('Losartana')
    expect(String(n.title)).toContain('50 mg')
    expect(n.metadata).toEqual({ medication_ids: ['m1'], time: '12:00', date: '2026-09-05' })
    // A tela é modal, aberta pelo TIPO: link no metadata mandaria o roteador para
    // uma URL que não existe.
    expect(n).not.toHaveProperty('link')
    expect((n.metadata as Record<string, unknown>).link).toBeUndefined()
  })

  it('horário FORA da janela não notifica', async () => {
    estado.medicamentos = [remedio('m1', 'Losartana', ['19:30'])]
    await GET(req())
    expect(estado.notifs).toHaveLength(0)
  })

  it('remédio de OUTRO dia da semana não envia (hoje é sábado)', async () => {
    estado.medicamentos = [remedio('m1', 'Losartana', ['12:00'], { weekdays: [1, 2, 3] })]
    const res = await GET(req())
    expect(estado.notifs).toHaveLength(0)
    expect(((await res.json()) as { enviados: number }).enviados).toBe(0)
  })

  it('a leitura é de remédios ATIVOS, dentro da validade, e checa o { error }', async () => {
    estado.medicamentos = [remedio('m1', 'Losartana', ['12:00'])]
    await GET(req())
    expect(estado.filtros).toContain('eq:active=true')
    expect(estado.filtros).toContain('lte:start_date=2026-09-05')
    expect(estado.filtros.some((f) => f.startsWith('or:end_date.is.null,end_date.gte.2026-09-05'))).toBe(true)
    // Sem coluna gorda (notes) — a rota roda 288×/dia.
    expect(estado.colunasMedicamentos).not.toContain('notes')
    expect(estado.colunasMedicamentos).toContain('times')
  })

  it('erro ao ler os remédios vira 500 — nunca "nenhum remédio hoje" verde e mudo', async () => {
    estado.erroMedicamentos = { message: 'permission denied' }
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(estado.notifs).toHaveLength(0)
  })

  it('sem nenhuma dose na janela responde ok sem tocar nas tomadas', async () => {
    estado.medicamentos = [remedio('m1', 'Losartana', ['19:30'])]
    const res = await GET(req())
    expect(await res.json()).toEqual({ ok: true, medicamentos: 1, doses: 0, enviados: 0 })
    expect(estado.colunasTomadas).toBe('')
  })

  /**
   * ⚠️ CASO MISTO — o que prova o filtro de verdade.
   *
   * DUAS doses no MESMO horário, só uma tomada. Com uma dose só, "já tomada" esvazia
   * a lista e o early-return mascara qualquer mutação no loop de envio — foi assim
   * que o guard do lembrete de refeição quase passou verde com a checagem morta.
   */
  it('CASO MISTO: duas doses às 12:00, só uma tomada — avisa só a pendente', async () => {
    estado.medicamentos = [
      remedio('m1', 'Losartana', ['12:00'], { dose: '50 mg' }),
      remedio('m2', 'Metformina', ['12:00']),
    ]
    estado.tomadas = [{ medication_id: 'm1', date: '2026-09-05', scheduled_time: '12:00' }]
    await GET(req())
    expect(estado.notifs).toHaveLength(1)
    const n = estado.notifs[0]
    expect(String(n.title)).toContain('Metformina')
    expect(String(n.title)).not.toContain('Losartana')
    expect((n.metadata as { medication_ids: string[] }).medication_ids).toEqual(['m2'])
  })

  it('a única dose já tomada: não notifica', async () => {
    estado.medicamentos = [remedio('m1', 'Losartana', ['12:00'])]
    estado.tomadas = [{ medication_id: 'm1', date: '2026-09-05', scheduled_time: '12:00' }]
    await GET(req())
    expect(estado.notifs).toHaveLength(0)
  })

  it('tomada do MESMO remédio em OUTRO horário/dia não cala a dose de agora', async () => {
    estado.medicamentos = [remedio('m1', 'Losartana', ['08:00', '12:00'])]
    estado.tomadas = [
      { medication_id: 'm1', date: '2026-09-05', scheduled_time: '08:00' },
      { medication_id: 'm1', date: '2026-09-04', scheduled_time: '12:00' },
    ]
    await GET(req())
    expect(estado.notifs).toHaveLength(1)
  })

  it('falha ao ler as tomadas NÃO trava o cron — avisa mesmo assim', async () => {
    estado.medicamentos = [remedio('m1', 'Losartana', ['12:00'])]
    estado.erroTomadas = new Error('conexão caiu')
    const res = await GET(req())
    expect(res.status).toBe(200)
    // Perder o lembrete é pior que mandar um de quem já tomou.
    expect(estado.notifs).toHaveLength(1)
  })

  it('dedupe `exists`: a dose já avisada não repete (e a chave carrega remédio, dia e horário)', async () => {
    estado.medicamentos = [remedio('m1', 'Losartana', ['12:00'])]
    estado.dedupe = 'exists'
    await GET(req())
    expect(estado.notifs).toHaveLength(0)
    expect(estado.chaves[0]).toContain('m1')
    expect(estado.chaves[0]).toContain('2026-09-05')
    expect(estado.chaves[0]).toContain('12:00')
  })

  it('dedupe `unavailable` (Upstash fora) ENVIA — perder é pior que repetir', async () => {
    estado.medicamentos = [remedio('m1', 'Losartana', ['12:00'])]
    estado.dedupe = 'unavailable'
    await GET(req())
    expect(estado.notifs).toHaveLength(1)
  })

  it('dedupe é POR DOSE: a já avisada some do grupo, a nova do mesmo horário ainda sai', async () => {
    estado.medicamentos = [
      remedio('m1', 'Losartana', ['12:00']),
      remedio('m2', 'Metformina', ['12:00']),
    ]
    estado.dedupePorChave = { 'med-reminder:m1:2026-09-05:12:00': 'exists' }
    await GET(req())
    expect(estado.notifs).toHaveLength(1)
    expect((estado.notifs[0].metadata as { medication_ids: string[] }).medication_ids).toEqual(['m2'])
  })

  it('agrupa: 1 linha por (usuário, horário) — três remédios às 12:00 são UM aviso', async () => {
    estado.medicamentos = [
      remedio('m1', 'Losartana', ['12:00'], { dose: '50 mg' }),
      remedio('m2', 'Metformina', ['12:00']),
      remedio('m3', 'Vitamina D', ['12:00']),
      { ...remedio('m4', 'Omeprazol', ['12:00']), user_id: 'user-2' },
    ]
    const res = await GET(req())
    expect(estado.notifs).toHaveLength(2)
    const doUsuario1 = estado.notifs.find((n) => n.user_id === UID)!
    expect(String(doUsuario1.title)).toContain('3 medicamentos')
    expect((doUsuario1.metadata as { medication_ids: string[] }).medication_ids).toHaveLength(3)
    expect(String(doUsuario1.message)).toContain('Losartana · 50 mg')
    expect(((await res.json()) as { enviados: number }).enviados).toBe(2)
  })
})

describe('medication-reminders — o agendamento é do pg_cron, não da Vercel', () => {
  const raiz = path.resolve(__dirname, '../../../../..')

  it('o cron não está no vercel.json (plano Hobby recusa não-diário)', () => {
    const vercelJson = JSON.parse(readFileSync(path.join(raiz, 'vercel.json'), 'utf8')) as {
      crons?: Array<{ path: string }>
    }
    expect((vercelJson.crons ?? []).filter((c) => c.path.includes('medication-reminders'))).toEqual([])
  })
})
