import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildNutritionSnapshot, formatSnapshotForPrompt, type SnapshotGoals } from '../chatContext'
import { detectIntent, detectTargetMacro } from '../chatIntent'

/**
 * "Ele diz que não sabe sobre a proteína da soja, porém eu tenho a proteína
 * cadastrada no meu histórico com a tabela nutricional completa" (dono,
 * 06/08/2026, com print).
 *
 * Estava certo: `nutrition_custom_foods` tinha "Proteína de soja" (90 g de
 * proteína por 100 g) e o snapshot do chat NUNCA mandava a biblioteca pro modelo.
 * O que ia era o `repertoire` — média por refeição dos últimos 30 dias, que não
 * traz tabela nenhuma e some quando o alimento passa um tempo sem ser lançado.
 */

const GOALS: SnapshotGoals = { calories: 2900, protein: 215, carbs: 350, fat: 70, source: 'saved' }
const TODAY = '2026-08-06'

const PROTEINA_DE_SOJA = {
  name: 'Proteína de soja',
  aliases: ['proteina de soja', 'PTS'],
  kcal_per100g: '350.00',
  protein_per100g: '90.00',
  carbs_per100g: '3.00',
  fat_per100g: '0.00',
  serving_size_g: '10.00',
}

function mockSupabase(customFoods: Record<string, unknown>[]) {
  return {
    from: (table: string) => ({
      select: () => {
        const data = table === 'nutrition_custom_foods' ? customFoods : []
        const result = Promise.resolve({ data, error: null })
        const thenable: Record<string, unknown> = {
          limit: () => result,
          then: (res: (v: unknown) => unknown) => result.then(res),
        }
        const chain: Record<string, unknown> = {
          eq: () => chain,
          gte: () => chain,
          lte: () => chain,
          limit: () => result,
          order: () => thenable,
          then: (res: (v: unknown) => unknown) => result.then(res),
        }
        return chain
      },
    }),
  } as unknown as SupabaseClient
}

describe('a biblioteca pessoal chega ao contexto do chat', () => {
  it('o snapshot carrega os alimentos que o usuário cadastrou', async () => {
    const snap = await buildNutritionSnapshot(mockSupabase([PROTEINA_DE_SOJA]), 'u1', TODAY, GOALS)
    expect(snap.library).toHaveLength(1)
    expect(snap.library[0]).toMatchObject({
      name: 'Proteína de soja',
      proteinPer100g: 90,
      kcalPer100g: 350,
      servingSizeG: 10,
    })
  })

  it('o texto do prompt traz a tabela POR 100g — é o dado que faltava', async () => {
    const snap = await buildNutritionSnapshot(mockSupabase([PROTEINA_DE_SOJA]), 'u1', TODAY, GOALS)
    const texto = formatSnapshotForPrompt(snap)
    expect(texto).toContain('BIBLIOTECA DELE')
    expect(texto).toContain('Proteína de soja')
    expect(texto).toMatch(/P90/)
    expect(texto).toContain('por 100g')
  })

  it('leva os apelidos — ele chama o mesmo produto de dois jeitos', async () => {
    const snap = await buildNutritionSnapshot(mockSupabase([PROTEINA_DE_SOJA]), 'u1', TODAY, GOALS)
    expect(formatSnapshotForPrompt(snap)).toContain('PTS')
  })

  it('biblioteca vazia não deixa a seção órfã no prompt', async () => {
    const snap = await buildNutritionSnapshot(mockSupabase([]), 'u1', TODAY, GOALS)
    expect(snap.library).toEqual([])
    expect(formatSnapshotForPrompt(snap)).not.toContain('BIBLIOTECA DELE')
  })

  it('linha corrompida não derruba o snapshot inteiro', async () => {
    const snap = await buildNutritionSnapshot(
      mockSupabase([{ name: null }, PROTEINA_DE_SOJA, { name: 'Sem macros' }]),
      'u1', TODAY, GOALS,
    )
    // A sem nome cai fora; a sem macros fica (zerada), porque o nome já é informação.
    expect(snap.library.map((f) => f.name)).toEqual(['Proteína de soja', 'Sem macros'])
    expect(snap.library[1]!.proteinPer100g).toBe(0)
  })
})

describe('o modelo é proibido de alegar que não conhece o que está na biblioteca', () => {
  const prompt = readFileSync('src/lib/nutrition/chatPrompt.ts', 'utf8')

  it('a regra está escrita no prompt', () => {
    expect(prompt).toMatch(/BIBLIOTECA DELE é dado que VOCÊ TEM/)
    expect(prompt).toMatch(/NUNCA diga/)
  })
})

describe('"quanto de X eu preciso?" — a pergunta do print', () => {
  it('reconhece a frase exata que ele digitou', () => {
    const intent = detectIntent('Quanto de proteína de soja preciso para bater isso?')
    expect(intent.kind).toBe('howMuch')
    if (intent.kind !== 'howMuch') return
    expect(intent.foodText).toBe('proteína de soja')
  })

  it('"proteína" no NOME do alimento não vira o macro alvo por engano', () => {
    /*
     * Armadilha real: em "quanto de PROTEÍNA de soja", a palavra proteína é parte
     * do produto. O macro só pode ser lido do que vem DEPOIS de bater/fechar/meta.
     */
    /*
     * O caso que DISTINGUE: o macro aparece no nome do alimento e o alvo é outro.
     * Lendo a frase inteira, "barra de carboidrato" faria o alvo virar `carbs` —
     * e o app responderia quanto comer para fechar o macro errado.
     */
    expect(detectTargetMacro('Quanto de barra de carboidrato preciso pra bater a proteína?')).toBe('protein')
    expect(detectTargetMacro('Quanto de proteína de soja preciso para bater a meta de carboidrato?')).toBe('carbs')
    expect(detectTargetMacro('Quanto de whey preciso pra fechar a gordura?')).toBe('fat')
    expect(detectTargetMacro('Quanto de proteína de soja preciso para bater isso?')).toBe('protein')
  })

  it.each([
    'quantos gramas de frango pra bater a meta',
    'quanto de whey falta pra fechar a proteína',
    'preciso de quanto de atum para bater a meta de proteína',
  ])('reconhece "%s"', (frase) => {
    expect(detectIntent(frase).kind).toBe('howMuch')
  })

  it('não confunde com a simulação — "se eu comer" continua simulate', () => {
    expect(detectIntent('se eu comer 5 ovos agora').kind).toBe('simulate')
  })

  it('pergunta sem alimento não vira howMuch', () => {
    expect(detectIntent('quanto falta pra minha meta?').kind).toBe('unknown')
  })
})

describe('a CONTA do "quanto preciso" é do servidor, nunca do modelo', () => {
  const rota = readFileSync('src/app/api/ai/nutrition-chat/route.ts', 'utf8')

  it('existe um caminho determinístico para o howMuch', () => {
    expect(rota).toMatch(/if \(intent\.kind === 'howMuch'\)/)
    expect(rota).toMatch(/gramsToClose\(/)
  })

  it('a quantidade sai da cascata de alimentos (que inclui a biblioteca), não de um palpite', () => {
    expect(rota).toMatch(/resolveFood\(supabase, userId, `100g de \$\{foodText\}`\)/)
    expect(rota).toMatch(/\(faltando \* 100\) \/ per100/)
  })

  it('macro já batido responde isso, em vez de mandar comer mais', () => {
    expect(rota).toMatch(/já está batido hoje/)
  })

  it('tem teto de sanidade — 2 kg de comida não é resposta', () => {
    expect(rota).toMatch(/gramas > 2000/)
  })
})
