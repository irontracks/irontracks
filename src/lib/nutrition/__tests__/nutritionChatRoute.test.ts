import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard da rota do chat de nutrição. Trava os invariantes que sustentam
 * custo, privacidade e precisão — todos fáceis de derrubar sem querer num refactor
 * e difíceis de exercitar em teste (a rota depende de auth + Supabase + Gemini).
 */
const route = readFileSync(join(process.cwd(), 'src/app/api/ai/nutrition-chat/route.ts'), 'utf8')
const flat = route.replace(/\s+/g, ' ')

/** Tira comentários — invariante de fluxo se mede em código, não em prosa. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('rota do chat — o molde canônico de rota de IA do repo', () => {
  it('exige usuário autenticado', () => {
    expect(route).toContain('requireUser')
    expect(flat).toContain('if (!auth.ok) return auth.response')
  })

  it('tem rate limit por usuário E por ip', () => {
    expect(flat).toMatch(/checkRateLimitAsync\(`ai:nutrition-chat:\$\{userId\}:\$\{ip\}`/)
    expect(route).toContain('getRequestIp(req)')
  })

  it('valida o corpo com Zod strict (req.json direto é proibido no repo)', () => {
    expect(route).toContain('parseJsonBody(req, BodySchema)')
    expect(route).toContain('.strict()')
    expect(route).not.toContain('req.json()')
  })

  it('trata erro pelo handler que não vaza o erro cru do Google', () => {
    expect(route).toContain("handleGeminiError('nutrition-chat', e)")
  })
})

describe('cota — o chat é Pro/Elite e é metrado', () => {
  it('usa a MESMA chave das outras rotas de nutrição, com meter', () => {
    expect(flat).toContain("checkVipFeatureAccess(supabase, userId, 'nutrition_macros', { meter: true })")
  })

  it('nega com upgradeRequired quando não tem acesso', () => {
    expect(flat).toContain("error: 'vip_required', upgradeRequired: true")
  })
})

describe('precisão — as fronteiras de confiança', () => {
  it('o CONSUMIDO vem do servidor (snapshot), nunca do corpo do request', () => {
    expect(route).toContain('buildNutritionSnapshot(supabase, userId, dateKey, goals')
    // O schema aceita metas (alvo declarado, tem que casar com a tela) mas JAMAIS
    // totais/consumido — senão dá pra mentir pro modelo sobre o próprio dia.
    expect(route).toContain('const BodySchema')
    const schema = route.slice(route.indexOf('const BodySchema'), route.indexOf('export async function POST'))
    expect(schema).not.toMatch(/\b(totals|consumed|projected|remaining)\b/)
  })

  it('a conta é do projectMeal, não do modelo', () => {
    expect(route).toContain('projectMeal(consumed, goals, addition)')
  })

  it('nada de IA roda antes do atalho determinístico decidir', () => {
    // Medido no CORPO do POST (o topo do arquivo tem os imports, que não são fluxo).
    const body = stripComments(
      route.slice(route.indexOf('export async function POST'), route.indexOf('async function simulate')),
    )
    const decide = body.indexOf('detectIntent(')
    expect(decide).toBeGreaterThan(-1)
    // A simulação (única coisa que pode chamar a IA) só acontece DEPOIS de decidir.
    expect(body.indexOf('simulate(')).toBeGreaterThan(decide)
    // E o próprio POST não chama modelo nenhum direto.
    expect(body).not.toContain('estimateMacrosFromText')
    expect(body).not.toContain('generateContent')
  })

  it('a IA de alimento é o ÚLTIMO recurso — só quando a cascata determinística falha', () => {
    // resolveFood primeiro; estimateMacrosFromText só no ramo do `: ` do ternário.
    expect(flat).toContain('const addition = resolved ? resolved.meal : await estimateMacrosFromText(foodText)')
  })

  it('refeição zerada é recusada, não narrada como se fosse comida', () => {
    // Pego em verificação real: "se eu comer xyzabc123" respondia "Xyzabc123 — 0 kcal.
    // Seu dia vai pra 0 de 2900", que soa como resposta e não é. O modelo devolve
    // zeros quando não reconhece; zeros não são alimento.
    expect(flat).toContain('if (Number(addition.calories) <= 0 && Number(addition.protein) <= 0) return null')
  })
})

describe('escrita — esta rota não grava nada', () => {
  it('não chama trackMeal nem insert (lançar é decisão do usuário, na fase 4)', () => {
    expect(route).not.toContain('trackMeal')
    expect(route).not.toContain('.insert(')
    expect(route).not.toContain('.upsert(')
  })

  it('não usa dateKey vindo de saída de modelo — só do corpo validado', () => {
    // dateKey só pode nascer do BodySchema (regex YYYY-MM-DD).
    expect(route).toContain('dateKey: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/)')
  })
})

describe('injection — a pergunta do usuário é sanitizada antes de virar prompt', () => {
  it('passa por sanitizeAiInput', () => {
    expect(route).toContain('sanitizeAiInput(question)')
  })
})
