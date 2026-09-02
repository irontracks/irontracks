import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadTacoFoods } from '../sources/taco-source'
import { analyzeMeal } from '../parser'

/**
 * O bug medido em 02/09/2026: "250g arroz branco" saía com 384 kcal · P27 C29
 * G18 — três vezes a proteína do arroz de verdade — porque `loadTacoFoods`
 * escrevia o alias "arroz" (7 linhas da TACO o reivindicam) num objeto sem
 * política nenhuma: o último `for` a escrever vencia, e sem `ORDER BY` isso
 * dependia da ordem física da tabela. "arroz" virou "Arroz carreteiro"
 * (153,77 kcal · P10,83 · C11,58 · G7,12) — um número plausível e ERRADO, o
 * pior tipo, porque ninguém confere o que parece certo.
 *
 * A correção: alias reivindicado por linhas com macros DIFERENTES é
 * DESCARTADO (nem o valor da primeira, nem o da última linha sobrevive);
 * `food_key` sempre vale, porque é 1-para-1 por definição; alias reivindicado
 * por linhas com os MESMOS macros (duplicata genuína, ex. os seis "óleo, de
 * X" da TACO, todos 884 kcal/0/0/100) sobrevive normalmente.
 */
const makeMockSupabase = (rows: unknown[]) =>
  ({
    from: () => ({
      select: () => ({ data: rows, error: null }),
    }),
  }) as unknown as SupabaseClient

describe('loadTacoFoods — política de conflito de alias', () => {
  it('alias reivindicado por linhas de macros DIFERENTES não vira chave; cada food_key continua valendo', async () => {
    const supabase = makeMockSupabase([
      {
        food_key: 'arroz-tipo-1-cozido',
        name: 'Arroz, tipo 1, cozido',
        aliases: ['arroz', 'arroz tipo 1 cozido'],
        kcal_per_100g: 128.3,
        protein: 2.5,
        carbs: 28.1,
        fat: 0.2,
        fiber: null,
      },
      {
        food_key: 'arroz-carreteiro',
        name: 'Arroz carreteiro',
        aliases: ['arroz', 'arroz carreteiro'],
        kcal_per_100g: 153.77,
        protein: 10.83,
        carbs: 11.58,
        fat: 7.12,
        fiber: null,
      },
    ])
    const map = await loadTacoFoods(supabase)

    // O alias ambíguo some — não sobrevive nem com o valor da primeira, nem
    // com o da última linha do array.
    expect(map['arroz']).toBeUndefined()

    // Descartar o alias não apaga o alimento: cada food_key segue resolvendo,
    // com os macros da SUA própria linha (não trocados entre si).
    expect(map['arroz-tipo-1-cozido']).toEqual({ kcal: 128.3, p: 2.5, c: 28.1, f: 0.2 })
    expect(map['arroz-carreteiro']).toEqual({ kcal: 153.77, p: 10.83, c: 11.58, f: 7.12 })

    // E os aliases que NÃO são ambíguos (um food_key só por trás) continuam
    // valendo normalmente.
    expect(map['arroz tipo 1 cozido']).toEqual({ kcal: 128.3, p: 2.5, c: 28.1, f: 0.2 })
    expect(map['arroz carreteiro']).toEqual({ kcal: 153.77, p: 10.83, c: 11.58, f: 7.12 })
  })

  it('alias reivindicado por linhas com os MESMOS macros sobrevive — não é conflito de verdade', async () => {
    // Caso real da TACO: os seis "óleo, de X" (babaçu/canola/girassol/milho/
    // pequi/soja) têm o alias "oleo" e são TODOS 884 kcal · 0 · 0 · 100 —
    // números idênticos, então não há decisão nenhuma a tomar.
    const supabase = makeMockSupabase([
      { food_key: 'oleo-de-canola', name: 'Óleo, de canola', aliases: ['oleo', 'oleo de canola'], kcal_per_100g: 884, protein: 0, carbs: 0, fat: 100, fiber: null },
      { food_key: 'oleo-de-soja', name: 'Óleo, de soja', aliases: ['oleo', 'oleo de soja'], kcal_per_100g: 884, protein: 0, carbs: 0, fat: 100, fiber: null },
    ])
    const map = await loadTacoFoods(supabase)
    expect(map['oleo']).toEqual({ kcal: 884, p: 0, c: 0, f: 100 })
  })

  it('é determinístico — a ordem de chegada das linhas não decide mais quem "ganha"', async () => {
    const rowA = { food_key: 'zz-comida-a', name: 'Comida A', aliases: ['comida generica'], kcal_per_100g: 100, protein: 1, carbs: 2, fat: 3, fiber: null }
    const rowB = { food_key: 'zz-comida-b', name: 'Comida B', aliases: ['comida generica'], kcal_per_100g: 200, protein: 4, carbs: 5, fat: 6, fiber: null }

    const mapForward = await loadTacoFoods(makeMockSupabase([rowA, rowB]))
    const mapReversed = await loadTacoFoods(makeMockSupabase([rowB, rowA]))

    expect(mapForward['comida generica']).toBeUndefined()
    expect(mapReversed['comida generica']).toBeUndefined()
    expect(mapForward).toEqual(mapReversed)
  })
})

describe('a fronteira ponta a ponta — o caso do dono', () => {
  it('"250g arroz branco" nunca pode sair com mais proteína que carboidrato', () => {
    // Ancorado no FATO FÍSICO (arroz é carboidrato, não proteína), não no
    // número 384 que a correção faz sumir — esse número não existe mais para
    // comparar contra. Reproduz o defeito medido em 02/09/2026, sem se
    // importar qual das duas defesas segura (a curadoria de
    // `food-database.ts` ou o descarte de alias em `taco-source.ts`): o que
    // importa é que o RESULTADO final nunca regrida.
    const r = analyzeMeal('250g arroz branco')
    expect(r.unknownLines).toEqual([])
    const item = r.items[0]
    expect(item).toBeDefined()
    expect(item!.carbs).toBeGreaterThan(item!.protein)
  })

  it('alias GENUINAMENTE ambíguo (sem curadoria em food-database.ts) vira desconhecido — não inventa um produto', async () => {
    // 'soja' fica de fora da curadoria de propósito: farinha de soja, extrato
    // (leite) e tofu são produtos DIFERENTES atrás da mesma palavra, sem
    // "sentido genérico" nenhum que não seja chute (ver o comentário em
    // food-database.ts). Sem uma chave curada por perto para mascarar o
    // resultado, este caso exercita SÓ o `taco-source.ts` — é o mesmo cenário
    // do "arroz", só que sem a segunda rede de segurança.
    const supabase = makeMockSupabase([
      { food_key: 'soja-farinha', name: 'Soja, farinha', aliases: ['soja'], kcal_per_100g: 404, protein: 36, carbs: 38.4, fat: 14.6, fiber: null },
      { food_key: 'soja-queijo-tofu', name: 'Soja, queijo (tofu)', aliases: ['soja'], kcal_per_100g: 64.5, protein: 6.5, carbs: 2.1, fat: 4, fiber: null },
    ])
    const tacoMap = await loadTacoFoods(supabase)

    const r = analyzeMeal('100g soja', tacoMap)
    expect(r.unknownLines).toHaveLength(1)
    expect(r.items).toHaveLength(0)
  })
})
