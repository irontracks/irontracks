/**
 * Item com quantidade DIGITADA no rótulo nunca grava `grams: 0`.
 *
 * Sintoma (04/10/2026, conta do dono): "60g nutella", "15g ketchup zero" e
 * "180g picadinho miolo da alcatra" gravados com `grams: 0` — os três pelo
 * caminho de IA do editor (`estimateFoodAction`), que fixava 0 e jogava fora
 * a quantidade que o usuário escreveu. Sem gramas o item perde o campo de
 * quantidade e some do repertório de troca.
 *
 * Três camadas, cada uma provada por mutação:
 *  1. a função pura (`gramasDoRotulo` / `gramasDoItem`);
 *  2. a FIAÇÃO nas duas fronteiras de escrita (`trackMeal`, `editEntryCore`)
 *     — cobre a classe, não só o caminho que deu o defeito;
 *  3. o `estimateFoodAction`, onde o bug nasceu.
 *
 * Os rótulos abaixo são os REAIS do banco, não inventados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gramasDoRotulo, gramasDoItem } from '../mealItemQuantity'
import { editEntryCore } from '../mutations'

// ── mocks do trackMeal e do estimateFoodAction ─────────────────────────────
const insertCapturado: { payload: Record<string, unknown> | null } = { payload: null }
const estimativa: { valor: unknown } = { valor: null }

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        insertCapturado.payload = payload
        // Interrompe aqui: o que importa é o que ia ser gravado.
        return { select: () => ({ single: async () => ({ data: null, error: { message: 'parar' } }) }) }
      },
    }),
  }),
}))
vi.mock('@/utils/rateLimit', () => ({ checkRateLimitAsync: async () => ({ allowed: true }) }))
vi.mock('@/utils/vip/limits', () => ({ checkVipFeatureAccess: async () => ({ allowed: true }) }))
vi.mock('@/lib/nutrition/learned-foods', () => ({ saveMealMemo: async () => {}, loadMealMemo: async () => null, bumpMealMemoUsage: async () => {} }))
vi.mock('@/lib/nutrition/aiEstimate', () => ({ estimateMacrosFromText: async () => estimativa.valor }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

beforeEach(() => {
  insertCapturado.payload = null
  estimativa.valor = null
})

describe('gramasDoRotulo — o que o próprio rótulo declara', () => {
  it.each([
    ['60g nutella', 60],
    ['15g ketchup zero', 15],
    ['180g picadinho miolo da alcatra', 180],
    ['200g carne moida de patinho', 200],
    ['300ml de leite desnatado zero lactose', 300],
    ['1,5kg arroz', 1500],
    ['1 l de água', 1000],
    ['160g esfirra de frango com requeijão', 160], // "com" é preparo único, não 2º alimento
  ])('%s → %i g', (rotulo, esperado) => {
    expect(gramasDoRotulo(rotulo)).toBe(esperado)
  })

  it.each([
    'Picadinho de miolo de alcatra', // sem quantidade
    'Água',
    '2 ovos', // contagem não é peso
    // memo da IA: refeição inteira num item só — o 150 é só do arroz
    '150g arroz branco, 250g peito de frango, 40g ketchup heinz, 15g maionese light, 1 lata coca zero',
    '60g nutella e 2 bananas',
    '100g arroz + feijão',
    '0g nada',
  ])('%s → 0 (não declara o peso do item inteiro)', (rotulo) => {
    expect(gramasDoRotulo(rotulo)).toBe(0)
  })
})

describe('gramasDoItem — o que vai para o banco', () => {
  it('gramas que vieram vencem o rótulo', () => {
    expect(gramasDoItem(130, 'Banana')).toBe(130)
    expect(gramasDoItem(64.4, '60g whey')).toBe(64)
  })
  it('gramas 0 com quantidade no rótulo → a do rótulo', () => {
    expect(gramasDoItem(0, '60g nutella')).toBe(60)
    expect(gramasDoItem(undefined, '180g picadinho miolo da alcatra')).toBe(180)
  })
  it('0 legítimo continua 0 (memo de refeição inteira, água do plano)', () => {
    expect(gramasDoItem(0, 'Picadinho de miolo de alcatra')).toBe(0)
    expect(gramasDoItem(0, 'Água')).toBe(0)
  })
})

describe('fiação: as duas fronteiras de escrita usam gramasDoItem', () => {
  it('editEntryCore grava 60 g para "60g nutella" que chegou com grams 0', async () => {
    let updatePayload: Record<string, unknown> = {}
    const supa = {
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload
          return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }
        },
      }),
    } as unknown as SupabaseClient

    await editEntryCore(supa, 'u1', 'e1', {
      food_name: 'Lanche',
      items: [
        { label: 'Pão francês', grams: 110, calories: 330, protein: 10, carbs: 64, fat: 3 },
        { label: '60g nutella', grams: 0, calories: 322, protein: 4, carbs: 34, fat: 19 },
      ],
    } as never)

    const itens = updatePayload.items as Array<{ label: string; grams: number }>
    expect(itens.map((i) => i.grams)).toEqual([110, 60])
  })

  it('trackMeal grava 180 g para "180g picadinho miolo da alcatra" que chegou com grams 0', async () => {
    const { trackMeal } = await import('../engine')
    // O insert simulado falha de propósito depois de capturar o payload.
    await expect(trackMeal('u1', { foodName: 'Almoço', calories: 566, protein: 50, carbs: 56, fat: 24 }, '2026-10-04', [
      { label: 'Arroz branco cozido', grams: 200, calories: 260, protein: 6, carbs: 56, fat: 1 },
      { label: '180g picadinho miolo da alcatra', grams: 0, calories: 306, protein: 44, carbs: 0, fat: 13 },
    ])).rejects.toThrow('parar')
    const itens = insertCapturado.payload?.items as Array<{ grams: number }>
    expect(itens.map((i) => i.grams)).toEqual([200, 180])
  })
})

describe('estimateFoodAction — onde o bug nasceu', () => {
  const saidaDaIa = (items: Array<{ label: string; grams: number }>) => ({
    foodName: 'x', calories: 322, protein: 4, carbs: 34, fat: 19,
    items: items.map((i) => ({ ...i, calories: 0, protein: 0, carbs: 0, fat: 0 })),
  })

  it('quantidade digitada vence: "60g nutella" sai com 60 g mesmo se a IA disser outra coisa', async () => {
    estimativa.valor = saidaDaIa([{ label: 'Nutella', grams: 50 }])
    const { estimateFoodAction } = await import('@/app/app/(app)/dashboard/nutrition/actions')
    const r = (await estimateFoodAction('60g nutella')) as { ok: boolean; item: { label: string; grams: number } }
    expect(r.ok).toBe(true)
    expect(r.item.label).toBe('60g nutella') // o editor de quantidade reescreve o número no rótulo
    expect(r.item.grams).toBe(60)
  })

  it('sem quantidade digitada e UM alimento: usa as gramas da IA', async () => {
    estimativa.valor = saidaDaIa([{ label: 'Picadinho', grams: 150 }])
    const { estimateFoodAction } = await import('@/app/app/(app)/dashboard/nutrition/actions')
    const r = (await estimateFoodAction('um prato de picadinho')) as { item: { grams: number } }
    expect(r.item.grams).toBe(150)
  })

  it('vários alimentos sem gramatura única: fica 0 (a soma não descreve o rótulo)', async () => {
    estimativa.valor = saidaDaIa([{ label: 'Arroz', grams: 150 }, { label: 'Frango', grams: 200 }])
    const { estimateFoodAction } = await import('@/app/app/(app)/dashboard/nutrition/actions')
    const r = (await estimateFoodAction('arroz com frango e salada')) as { item: { grams: number } }
    expect(r.item.grams).toBe(0)
  })
})
