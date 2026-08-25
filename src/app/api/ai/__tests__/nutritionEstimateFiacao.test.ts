/**
 * FIAÇÃO da rota de estimativa por IA — o elo que os testes de peça não cobrem.
 *
 * `buildEstimatePrompt`, `parseEstimateOutput` e `itemsParaGravar` passam verdes
 * isoladamente com a rota gravando o item único de antes: é a lição do "cobrir
 * as pontas e não a fiação", que aqui custaria a correção inteira.
 *
 * Este guard é de SOURCE porque a rota exige sessão Supabase + chamada paga ao
 * Gemini para rodar de verdade. A prova de comportamento foi feita à parte,
 * contra a API real (25/08/2026): "arroz branco cozido com filé de tilápia
 * grelhada" voltou como 180g arroz + 140g tilápia, com kcal e macros de cada.
 *
 * ⚠️ A prova de ponta a ponta NO APARELHO ficou bloqueada: o teclado do
 * simulador está com dicionário em inglês e reescreveu a frase em português
 * ("peixe grelhado" virou "Price grew Haro"). A tela foi conferida injetando o
 * dado direto no banco da conta de teste.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROTA = join(process.cwd(), 'src/app/api/ai/nutrition-estimate/route.ts')
const fonte = readFileSync(ROTA, 'utf8')
/** Fora de comentário: um guard que casa com a prosa que o explica acusa a si mesmo. */
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('rota nutrition-estimate: fiação', () => {
  it('passa o contrato de structured output na chamada', () => {
    expect(codigo, 'pedir JSON só no texto do prompt derruba o parse — e cada retry é uma chamada paga')
      .toMatch(/getGeminiModel\([^)]*nutritionEstimateGenerationConfig\(\)/)
  })

  it('grava os alimentos que o modelo separou, não um item fixo', () => {
    expect(codigo).toMatch(/itemsParaGravar\(out,/)
    expect(codigo, 'era esta a linha que produzia a refeição de uma linha só')
      .not.toMatch(/\[\{\s*label:\s*itemLabel,\s*grams:\s*0/)
  })

  it('o contrato declara os itens com quantidade e macros', async () => {
    const { NUTRITION_ESTIMATE_RESPONSE_SCHEMA } = await import('@/utils/ai/routeContracts')
    const itens = NUTRITION_ESTIMATE_RESPONSE_SCHEMA.properties.items
    expect(itens.type).toBe('ARRAY')
    expect(Object.keys(itens.items.properties)).toEqual(
      expect.arrayContaining(['label', 'grams', 'calories', 'protein', 'carbs', 'fat']),
    )
    // `items` FORA do required de propósito: o chamador tem fallback, e exigir
    // a lista faria o modelo inventar detalhe para um alimento único.
    expect(NUTRITION_ESTIMATE_RESPONSE_SCHEMA.required).not.toContain('items')
  })
})
