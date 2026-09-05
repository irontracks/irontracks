/**
 * Guard de FIAÇÃO do lembrete de refeição.
 *
 * A janela (`janelaDeLembrete`) e o horário no plano (`mealTimes`) passam verdes
 * isolados enquanto o cron não liga um no outro — foi assim que o motor de carga
 * ficou sem `knownWeights` e 198 testes continuaram verdes. Aqui a rota é
 * EXERCITADA com o Supabase mockado, e o teste lê a notificação que sairia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const { estado } = vi.hoisted(() => ({
  estado: {
    rows: [] as Array<Record<string, unknown>>,
    notifs: [] as Array<Record<string, unknown>>,
    colunas: '',
    statusFiltrado: '',
    dedupe: 'set' as 'set' | 'exists' | 'unavailable',
    chaves: [] as string[],
  },
}))

vi.mock('@/utils/cron/auth', () => ({ isCronAuthorized: () => true }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logWarnRemote: vi.fn() }))
vi.mock('@/lib/social/notifyFollowers', () => ({
  insertNotifications: vi.fn(async (list: Array<Record<string, unknown>>) => { estado.notifs.push(...list) }),
}))
vi.mock('@/utils/cache', () => ({
  cacheSetNxStatus: vi.fn(async (chave: string) => { estado.chaves.push(chave); return estado.dedupe }),
}))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const builder = {
        select: (cols: string) => { estado.colunas = cols; return builder },
        eq: (_c: string, v: string) => { estado.statusFiltrado = v; return builder },
        limit: () => Promise.resolve({ data: estado.rows, error: null }),
      }
      return builder
    },
  }),
}))

import { GET } from '../meal-reminders/route'

const UID = 'user-1'
const req = () => new Request('https://irontracks.com.br/api/cron/meal-reminders')

const refeicao = (name: string, time?: string) => ({
  name,
  ...(time ? { time } : {}),
  items: [{ food: 'arroz', grams: 150, calories: 200, protein: 4, carbs: 44, fat: 0 }],
})

/** Semana com o mesmo cardápio nos 7 dias — o formato real da base. */
const planoSemanal = (time?: string) => ({
  user_id: UID,
  days: Array.from({ length: 7 }, (_, weekday) => ({ weekday, meals: [refeicao('Almoço', time)] })),
})

describe('cron meal-reminders', () => {
  beforeEach(() => {
    estado.rows = []
    estado.notifs = []
    estado.colunas = ''
    estado.statusFiltrado = ''
    estado.dedupe = 'set'
    estado.chaves = []
    vi.useFakeTimers()
    // Sábado 05/09/2026, 12:02 BRT — a janela cobre 11:57…12:02.
    vi.setSystemTime(new Date('2026-09-05T15:02:00Z'))
  })

  it('horário na janela vira UMA notificação com o cardápio no corpo', async () => {
    estado.rows = [planoSemanal('12:00')]
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(estado.notifs).toHaveLength(1)
    const n = estado.notifs[0]
    expect(n.type).toBe('meal_reminder')
    expect(n.recipient_id).toBe(UID)
    expect(String(n.title)).toContain('Almoço')
    expect(String(n.title)).toContain('12:00')
    // O push diz O QUE comer — é o que o dono escolheu, e o que o torna útil
    // sem abrir o app.
    expect(String(n.message)).toContain('150g arroz')
  })

  it('horário FORA da janela não notifica', async () => {
    estado.rows = [planoSemanal('19:30')]
    await GET(req())
    expect(estado.notifs).toHaveLength(0)
  })

  it('refeição sem horário não notifica', async () => {
    estado.rows = [planoSemanal()]
    await GET(req())
    expect(estado.notifs).toHaveLength(0)
  })

  it('só o dia da semana de HOJE conta — não os sete', async () => {
    // Se o cron ignorasse o weekday, o mesmo horário nos 7 dias geraria 7 pushes.
    estado.rows = [planoSemanal('12:00')]
    await GET(req())
    expect(estado.notifs).toHaveLength(1)
  })

  it('o dia de OUTRO dia da semana não dispara', async () => {
    estado.rows = [{
      user_id: UID,
      // Só a segunda-feira (1) tem almoço; hoje é sábado (6).
      days: [{ weekday: 1, meals: [refeicao('Almoço', '12:00')] }, { weekday: 2, meals: [refeicao('Jantar', '19:00')] }],
    }]
    await GET(req())
    expect(estado.notifs).toHaveLength(0)
  })

  it('plano de UM dia vale todo dia', async () => {
    estado.rows = [{ user_id: UID, meals: [refeicao('Almoço', '12:00')] }]
    await GET(req())
    expect(estado.notifs).toHaveLength(1)
  })

  it('lê só planos ativos e sem as colunas gordas', async () => {
    estado.rows = [planoSemanal('12:00')]
    await GET(req())
    expect(estado.statusFiltrado).toBe('active')
    // `notes` é o plano inteiro em texto; esta rota roda 288×/dia.
    expect(estado.colunas).not.toContain('notes')
    expect(estado.colunas).toContain('user_id')
  })

  it('dedupe: já enviado neste horário hoje não repete', async () => {
    estado.rows = [planoSemanal('12:00')]
    estado.dedupe = 'exists'
    await GET(req())
    expect(estado.notifs).toHaveLength(0)
    // A chave precisa carregar o DIA: sem ele, o lembrete de hoje calaria o de
    // amanhã.
    expect(estado.chaves[0]).toContain('2026-09-05')
    expect(estado.chaves[0]).toContain('12:00')
  })

  it('cache fora do ar ENVIA — perder o lembrete é pior que repetir', async () => {
    estado.rows = [planoSemanal('12:00')]
    estado.dedupe = 'unavailable'
    await GET(req())
    expect(estado.notifs).toHaveLength(1)
  })

  it('não notifica quando o plano não tem refeição nenhuma', async () => {
    estado.rows = [{ user_id: UID, days: [] }]
    await GET(req())
    expect(estado.notifs).toHaveLength(0)
  })

  it('⚠️ a hora é BRT: 22:30 não dispara ao meio-dia do servidor', async () => {
    // Mutação-alvo: trocar `instanteBrt` por UTC. Às 15:02Z o servidor está em
    // 15:02 e o usuário em 12:02 — um plano de 15:00 disparia em UTC e não deve.
    estado.rows = [planoSemanal('15:00')]
    await GET(req())
    expect(estado.notifs).toHaveLength(0)
  })
})

/**
 * ⚠️ O agendamento deste cron NÃO mora no `vercel.json`.
 *
 * A conta Vercel do projeto é HOBBY, e o Hobby só aceita expressão DIÁRIA: uma
 * entrada de 5 em 5 minutos é recusada ANTES de o deploy existir — o check do PR
 * fica vermelho com "Deployment failed" e um link para a página de preços, sem
 * log de build para explicar (medido em 05/09/2026, PR #1073). Quem quiser
 * "consertar" a ausência do cron adicionando a linha lá derruba o deploy inteiro,
 * e o sintoma não diz o porquê. Este guard diz.
 */
describe('meal-reminders — o agendamento é do pg_cron, não da Vercel', () => {
    const raiz = path.resolve(__dirname, '../../../../..')
    const vercelJson = JSON.parse(readFileSync(path.join(raiz, 'vercel.json'), 'utf8')) as {
        crons?: Array<{ path: string; schedule: string }>
    }

    it('o cron não está no vercel.json', () => {
        const nossos = (vercelJson.crons ?? []).filter((c) => c.path.includes('meal-reminders'))
        expect(
            nossos,
            'O plano Hobby recusa cron não-diário e o deploy falha sem log. O agendamento vive na migration.',
        ).toEqual([])
    })

    it('nenhum cron da Vercel usa expressão sub-diária', () => {
        // A regra vale para a lista inteira, não só para este cron: o próximo de
        // 5 em 5 minutos derrubaria o deploy do mesmo jeito. "Uma vez por dia"
        // significa minuto E hora fixos — qualquer curinga, passo, lista ou
        // intervalo nesses dois campos dispara mais de uma vez.
        const naoEhValorFixo = (campo: string) => /[*/,-]/.test(campo)
        const subdiarios = (vercelJson.crons ?? []).filter((c) => {
            const [minuto = '', hora = ''] = c.schedule.split(/\s+/)
            return naoEhValorFixo(minuto) || naoEhValorFixo(hora)
        })
        expect(subdiarios, 'o plano Hobby só aceita cron diário').toEqual([])
    })

    it('existe a migration que agenda o job', () => {
        const dir = path.join(raiz, 'supabase/migrations')
        const arquivo = readdirSync(dir).find((f) => f.includes('meal_reminders_pg_cron'))
        expect(arquivo, 'sem a migration, nada dispara o lembrete').toBeTruthy()
        const sql = readFileSync(path.join(dir, String(arquivo)), 'utf8')
        expect(sql).toContain("cron.schedule(")
        expect(sql).toContain('/api/cron/meal-reminders')
        // O segredo vem do Vault: hardcodá-lo aqui o deixaria em texto puro na
        // definição do job e no arquivo versionado.
        expect(sql).toContain('vault.decrypted_secrets')
        expect(sql).not.toMatch(/Bearer [A-Za-z0-9_-]{8,}/)
    })
})
