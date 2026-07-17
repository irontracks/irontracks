import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O GUARD que protege o requisito do dono ("responder sempre com precisão").
 *
 * O caminho óbvio — o botão "Lançar" reusar o logMealAction — QUEBRA a promessa:
 *   1. O chat resolve "1 pizza artesanal": cascata falha → Gemini → 390 kcal.
 *      O card promete "seu dia vai pra 2410".
 *   2. Toque em "Lançar" → logMealAction RE-RESOLVE o texto → falha de novo →
 *      devolve needsAi → o cliente cai em /api/ai/nutrition-estimate → NOVA
 *      amostra do modelo → 412 kcal.
 *   3. O diário grava 2432. O card tinha dito 2410.
 * O app se contradiz em dois toques — e ainda metra a cota 2× e gasta 3 chamadas
 * de IA no lugar de 1.
 *
 * Por isso applyChatSimulationAction persiste os items EXATOS que o card exibiu.
 * Este teste existe pra que ninguém "simplifique" isso de volta pro logMealAction
 * sem entender o porquê.
 */
const actions = readFileSync(
  join(process.cwd(), 'src/app/(app)/dashboard/nutrition/actions.ts'),
  'utf8',
)

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const fn = (() => {
  const start = actions.indexOf('export async function applyChatSimulationAction')
  expect(start).toBeGreaterThan(-1)
  const rest = actions.slice(start)
  const end = rest.indexOf('\nexport async function ', 1)
  return stripComments(end > 0 ? rest.slice(0, end) : rest)
})()

describe('applyChatSimulationAction — o que o card prometeu é o que entra no diário', () => {
  it('NÃO re-resolve o alimento', () => {
    expect(fn).not.toContain('resolveFood')
    expect(fn).not.toContain('resolveFoodItemsAction')
  })

  it('NÃO chama IA (o chat já resolveu; uma nova amostra daria outro número)', () => {
    expect(fn).not.toContain('estimateMacrosFromText')
    expect(fn).not.toContain('estimateFoodAction')
    expect(fn).not.toContain('nutrition-estimate')
    expect(fn).not.toContain('needsAi')
  })

  it('persiste os items recebidos, e os totais são a SOMA deles', () => {
    expect(fn).toContain('items.reduce((s, i) => s + i.calories, 0)')
    expect(fn).toContain('items.reduce((s, i) => s + i.protein, 0)')
    // items vai pro trackMeal — o breakdown do card sobrevive no diário.
    expect(fn.replace(/\s+/g, ' ')).toContain('trackMeal(userId, mealLog, resolvedDateKey, items, clientId ?? null)')
  })

  it('NÃO arredonda os totais antes de somar (paridade com a projeção do card)', () => {
    // O trackMeal grava a refeição crua e arredonda o total do DIA numa passada só.
    // Arredondar item a item aqui divergiria 1 kcal do que o card prometeu.
    expect(fn).not.toMatch(/calories:\s*Math\.round/)
    expect(fn).not.toMatch(/protein:\s*Math\.round/)
  })
})

describe('applyChatSimulationAction — segurança', () => {
  it('escreve pelo funil único (trackMeal), que clampa os tetos', () => {
    expect(fn).toContain('trackMeal(')
    expect(fn).not.toContain('.insert(')
    expect(fn).not.toContain('.upsert(')
  })

  it('exige usuário e resolve a data no servidor (nunca confia na do cliente)', () => {
    expect(fn).toContain("throw new Error('nutrition_unauthorized')")
    // resolveDateKey clampa data futura — o cliente não escolhe onde grava.
    expect(fn).toContain('resolveDateKey(dateKey)')
  })

  it('sanitiza os nomes e capa a quantidade de items', () => {
    expect(fn).toContain('sanitizeFoodName')
    expect(fn).toContain('.slice(0, 20)')
  })

  it('recusa refeição vazia', () => {
    expect(fn).toContain("if (!items.length) return { ok: false, error: 'Nada pra lançar.' }")
    expect(fn).toContain('mealLog.calories <= 0 && mealLog.protein <= 0')
  })

  it('aceita clientId — reenvio não duplica (índice único parcial)', () => {
    expect(fn).toContain('clientId')
  })
})
