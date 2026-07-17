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
      route.slice(route.indexOf('export async function POST'), route.indexOf('function notFoodReply')),
    )
    const decide = body.indexOf('detectIntent(')
    expect(decide).toBeGreaterThan(-1)

    // Tudo que custa IA vem DEPOIS: a interpretação (generateContent) e a
    // simulação (que só chama Gemini se a cascata falhar). Se um dia alguém
    // chamar o modelo antes de tentar o atalho, o caso de uso #1 passa a custar
    // dinheiro e a variar de resposta — é exatamente isto que o teste impede.
    for (const call of ['generateContent', 'simulate(']) {
      expect(body.indexOf(call), `${call} não pode preceder o atalho`).toBeGreaterThan(decide)
    }
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

describe('nome da refeição — nunca a pergunta crua', () => {
  it('captura o foodName LIMPO que a IA devolve, em vez de descartá-lo', () => {
    // Bug reportado: "...30g de doce de leite da tirol, como ficará meus numero"
    // virou food_name no diário. A IA dava um nome limpo e a rota jogava fora.
    expect(route).toContain('aiFoodName = String(e.foodName')
    expect(route).toContain('const displayName = (aiFoodName || foodText)')
  })

  it('o sim leva foodName; o label do item NÃO é mais o foodText cru', () => {
    expect(flat).toContain('foodName: displayName')
    expect(flat).toContain('label: displayName')
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

describe('injection — o que vira prompt é sanitizado', () => {
  it('a pergunta passa por sanitizeAiInput', () => {
    expect(route).toContain('sanitizeAiInput(question)')
  })

  it('CADA turno do histórico também (o cliente é quem compõe o histórico)', () => {
    expect(flat).toContain('text: sanitizeAiInput(h.text)')
  })

  it('o histórico é capado (tokens e superfície de injection)', () => {
    expect(flat).toContain('.max(6)')
    expect(flat).toContain("text: z.string().min(1).transform((s) => s.slice(0, 500))")
  })
})

describe('a prosa do modelo é ENFEITE — a arquitetura sobrevive sem ela', () => {
  it('writeProse devolve null em qualquer falha, em vez de derrubar o request', () => {
    const fn = route.slice(route.indexOf('async function writeProse'), route.indexOf('async function simulate'))
    expect(fn).toContain('try {')
    expect(fn).toContain('} catch {')
    expect(fn).toContain('return null')
    // Falha do safeGemini não vira errorResponse aqui — vira null.
    expect(fn.replace(/\s+/g, ' ')).toContain("if ('errorResponse' in res) return null")
  })

  it('quando a prosa falha, o narrador determinístico segura a resposta', () => {
    // reply: prose ?? sim.reply — o ?? é o que garante que o usuário sempre tem número.
    expect(flat).toContain('reply: prose ?? sim.reply')
  })

  it('o narrador determinístico é sempre calculado, mesmo quando a prosa vem', () => {
    expect(route).toContain('buildTemplateReply(foodText, projection, items)')
  })

  it('prosa quebrada é recusada (pego em verificação real)', () => {
    // O modelo respondeu "...seu dia vai ficar assim:" e parou — ia listar os
    // números e não listou. Frase pendurada em dois-pontos é pior que o template.
    expect(route).toContain('looksComplete(text)')
    const fn = route.slice(route.indexOf('function looksComplete'), route.length)
    expect(fn).toContain("/[:,;]$/.test(t)") // não termina no meio de uma enumeração
    expect(fn).toContain('!/\\d/.test(t)') // simulação sem número não é resposta
  })
})

describe('o modelo interpreta — mas não decide nada que valha número', () => {
  it('usa o modelo rápido na interpretação', () => {
    expect(route).toContain('getGeminiModel(apiKey, env.gemini.fastModelId)')
  })

  it('o foodQuery do modelo volta pra cascata determinística, não vira macro', () => {
    // O que o modelo devolve é TEXTO de alimento; quem resolve macro é o simulate().
    expect(flat).toContain('const foodText = cleanFoodText(parsed.foodQuery) || parsed.foodQuery')
    expect(flat).toContain('const sim = await simulate(supabase, userId, foodText, snapshot.today.totals, goals)')
  })

  it('o schema de saída do modelo não tem macro nem data (nada que ele possa forjar)', () => {
    const prompt = readFileSync(join(process.cwd(), 'src/lib/nutrition/chatPrompt.ts'), 'utf8')
    const schema = prompt.slice(prompt.indexOf('const IntentSchema'), prompt.indexOf('export interface ParsedIntent'))
    expect(schema).not.toMatch(/\b(calories|protein|carbs|fat|dateKey|date)\b/)
  })
})
