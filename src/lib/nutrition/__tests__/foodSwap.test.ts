import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  anchorMacroOf,
  classifyFood,
  macrosPer100g,
  portionFor,
  swapFood,
  type SwapCandidate,
} from '../foodSwap'
import { databaseCandidates, mergeCandidates } from '../swapCandidates'

/**
 * "Gerou macarrão e eu não quero" — troca por outro alimento da MESMA classe.
 *
 * Sem IA de propósito: é um botão apertado várias vezes por refeição; cada clique
 * seria uma chamada paga ao Gemini e 1–3 s de espera. A classe sai dos MACROS,
 * não de lista de nomes, porque é a única regra que vale igual para as três fontes
 * (aprendidos do usuário, custom cadastrados por ele, base curada TACO/USDA) — uma
 * lista de nomes deixaria de fora justamente o que o usuário cadastrou.
 */

const cand = (name: string, kcal: number, protein: number, carbs: number, fat: number, source: SwapCandidate['source'] = 'database'): SwapCandidate =>
  ({ name, kcal, protein, carbs, fat, source })

// Valores por 100 g, batendo com a base curada do repo.
const FRANGO = cand('frango', 165, 31, 0, 4)
const ATUM = cand('atum', 116, 26, 0, 1)
const TILAPIA = cand('tilapia', 96, 20, 0, 1.7)
const ARROZ = cand('arroz cozido', 130, 3, 28, 0.3)
const MACARRAO = cand('macarrao cozido', 131, 5, 25, 1.1)
const BATATA = cand('batata doce', 86, 2, 20, 0.1)
const AZEITE = cand('azeite', 884, 0, 0, 100)
const ALFACE = cand('alface', 15, 1.4, 2.9, 0.2)
const BANANA = cand('banana', 89, 1.1, 23, 0.3)

describe('classifyFood — o papel do alimento sai dos macros', () => {
  it('proteína dominante → protein', () => {
    expect(classifyFood(FRANGO)).toBe('protein')
    expect(classifyFood(ATUM)).toBe('protein')
  })

  it('carboidrato dominante e denso → carb', () => {
    expect(classifyFood(ARROZ)).toBe('carb')
    expect(classifyFood(MACARRAO)).toBe('carb')
  })

  it('gordura dominante → fat', () => {
    expect(classifyFood(AZEITE)).toBe('fat')
  })

  it('folha e legume leve viram `produce`, não `carb`', () => {
    // Se caíssem em carb, trocar arroz por alface pediria uma porção absurda —
    // e o prato mudaria de natureza.
    expect(classifyFood(ALFACE)).toBe('produce')
    expect(classifyFood(cand('brocolis', 34, 2.8, 7, 0.4))).toBe('produce')
  })

  it('LIMITE ASSUMIDO: macro não separa fruta de amido — banana fica em `carb`', () => {
    // Banana 89 kcal/100 g e batata doce 86 são a mesma coisa para qualquer regra
    // baseada só em macros: carboidrato denso, quase sem proteína. Separá-las
    // exigiria lista de nomes, que não cobriria os alimentos que o usuário cadastra.
    // Assumimos o limite; quem evita a troca esquisita é a ordenação por densidade
    // (teste abaixo), não a classificação.
    expect(classifyFood(BANANA)).toBe('carb')
    expect(classifyFood(BATATA)).toBe('carb')
  })

  it('queijo é proteico E gorduroso — a proteína manda, que é o papel dele no prato', () => {
    expect(classifyFood(cand('queijo cottage', 98, 11, 3.4, 4.3))).toBe('protein')
  })

  it('sem macro nenhum não é classificável (café, água) — vira mixed', () => {
    expect(classifyFood(cand('cafe preto', 2, 0, 0, 0))).toBe('mixed')
    expect(classifyFood(cand('agua', 0, 0, 0, 0))).toBe('mixed')
  })
})

describe('macrosPer100g — a porção do cardápio vira base comparável', () => {
  it('converte a porção real para 100 g', () => {
    const per100 = macrosPer100g({ food: 'Frango', grams: 200, calories: 330, protein: 62, carbs: 0, fat: 8 })
    expect(per100.kcal).toBe(165)
    expect(per100.protein).toBe(31)
  })

  it('item sem gramas cai nos valores absolutos em vez de dividir por zero', () => {
    const per100 = macrosPer100g({ food: 'X', grams: 0, calories: 100, protein: 10, carbs: 5, fat: 2 })
    expect(per100.kcal).toBe(100)
    expect(Number.isFinite(per100.protein)).toBe(true)
  })
})

describe('portionFor — preserva o macro-âncora, não as calorias cegas', () => {
  it('o âncora é o macro que define a classe', () => {
    expect(anchorMacroOf('protein')).toBe('protein')
    expect(anchorMacroOf('carb')).toBe('carbs')
    expect(anchorMacroOf('fat')).toBe('fat')
    expect(anchorMacroOf('produce')).toBe('kcal')
    expect(anchorMacroOf('mixed')).toBe('kcal')
  })

  it('62 g de proteína em atum dão ~240 g (26 g/100 g)', () => {
    expect(portionFor(ATUM, 62, 'protein')).toBe(240)
  })

  it('arredonda de 5 em 5 — ninguém pesa 137 g de arroz', () => {
    expect(portionFor(ARROZ, 30, 'carbs') % 5).toBe(0)
  })

  it('candidato sem o macro-âncora não recebe porção (evita divisão por zero)', () => {
    expect(portionFor(AZEITE, 30, 'protein')).toBe(0)
  })

  it('a porção fica numa faixa comível — sem teto, casar proteína com alface pediria quilos', () => {
    expect(portionFor(ALFACE, 62, 'protein')).toBeLessThanOrEqual(1000)
    expect(portionFor(FRANGO, 0.1, 'protein')).toBeGreaterThanOrEqual(10)
  })
})

describe('swapFood — a troca em si', () => {
  const item = { food: 'Frango', grams: 200, calories: 330, protein: 62, carbs: 0, fat: 8 }

  it('troca proteína por proteína, mantendo a proteína do prato', () => {
    const out = swapFood(item, [ATUM, ARROZ, ALFACE, AZEITE])
    expect(out?.food).toBe('atum')
    expect(out?.foodClass).toBe('protein')
    // ~240 g de atum ≈ 62 g de proteína, a mesma do frango.
    expect(out?.protein).toBeGreaterThan(55)
    expect(out?.protein).toBeLessThan(70)
  })

  it('NUNCA devolve alimento de outra classe — melhor não trocar', () => {
    const out = swapFood(item, [ARROZ, MACARRAO, ALFACE])
    expect(out).toBeNull()
  })

  it('não devolve o próprio alimento', () => {
    const out = swapFood(item, [cand('Frango', 165, 31, 0, 4)])
    expect(out).toBeNull()
  })

  it('não repete alimento que já está na refeição', () => {
    // Trocar arroz por feijão com feijão no prato deixaria o mesmo item duas vezes.
    const arrozItem = { food: 'Arroz', grams: 150, calories: 195, protein: 4.5, carbs: 42, fat: 0.5 }
    const out = swapFood(arrozItem, [MACARRAO], { exclude: ['Macarrao cozido'] })
    expect(out).toBeNull()
  })

  it('clicar de novo traz OUTRO — o recusado entra no exclude', () => {
    const first = swapFood(item, [ATUM, TILAPIA])
    const second = swapFood(item, [ATUM, TILAPIA], { exclude: [String(first?.food)] })
    expect(first?.food).not.toBe(second?.food)
    expect(second).not.toBeNull()
  })

  it('o que o usuário JÁ come vem antes da base curada', () => {
    const learned = cand('atum', 116, 26, 0, 1, 'learned')
    const out = swapFood(item, [TILAPIA, learned])
    expect(out?.source).toBe('learned')
    expect(out?.food).toBe('atum')
  })

  it('empatada a fonte, ganha quem MENOS desanda as calorias do prato', () => {
    // Não é a densidade parecida, é o resultado: 62 g de proteína dão 240 g de atum
    // (278 kcal, −16%) ou 310 g de tilápia (298 kcal, −10%) contra os 330 kcal do
    // frango. A tilápia entrega a mesma proteína ficando mais perto das calorias.
    const out = swapFood(item, [ALFACE, TILAPIA, ATUM])
    expect(out?.food).toBe('tilapia')
  })

  it('recusa o substituto que preserva o macro mas DOBRA as calorias', () => {
    // Salmão (20 P / 208 kcal por 100 g): 62 g de proteína pedem 310 g e entregam
    // ~645 kcal no lugar de 330. "Manteve a proteína" e destruiu a dieta.
    const SALMAO = cand('salmao', 208, 20, 0, 13)
    expect(swapFood(item, [SALMAO])).toBeNull()
  })

  it('macros do resultado batem com a porção devolvida', () => {
    const out = swapFood(item, [ATUM])
    expect(out).not.toBeNull()
    const factor = (out!.grams) / 100
    expect(out!.calories).toBe(Math.round(116 * factor))
    expect(out!.protein).toBeCloseTo(26 * factor, 1)
  })

  it('lista de candidatos vazia ou inválida devolve null em vez de quebrar', () => {
    expect(swapFood(item, [])).toBeNull()
    expect(swapFood(item, null as unknown as SwapCandidate[])).toBeNull()
  })

  it('a densidade parecida é o que evita arroz virar banana', () => {
    // Compensa o limite da classificação: banana é `carb` como o arroz, mas
    // 130 kcal/100 g (arroz) está a 1 de macarrão e a 41 de banana — o macarrão ganha.
    const arrozItem = { food: 'Arroz', grams: 150, calories: 195, protein: 4.5, carbs: 42, fat: 0.5 }
    const out = swapFood(arrozItem, [BANANA, MACARRAO])
    expect(out?.food).toBe('macarrao cozido')
  })

  it('troca carboidrato por carboidrato preservando o carbo', () => {
    const arrozItem = { food: 'Arroz', grams: 150, calories: 195, protein: 4.5, carbs: 42, fat: 0.5 }
    const out = swapFood(arrozItem, [MACARRAO, BATATA, FRANGO])
    expect(out?.foodClass).toBe('carb')
    expect(out?.carbs).toBeGreaterThan(38)
    expect(out?.carbs).toBeLessThan(46)
  })
})

describe('candidatos — a base curada é a rede de segurança de quem não tem repertório', () => {
  it('a base entra como fonte database e tem volume suficiente', () => {
    const db = databaseCandidates()
    expect(db.length).toBeGreaterThan(100)
    expect(db.every((c) => c.source === 'database')).toBe(true)
  })

  it('a base cobre as classes que a troca usa', () => {
    const classes = new Set(databaseCandidates().map(classifyFood))
    expect(classes.has('protein')).toBe(true)
    expect(classes.has('carb')).toBe(true)
    expect(classes.has('fat')).toBe(true)
    expect(classes.has('produce')).toBe(true)
  })

  it('o macro medido do usuário ganha do valor da tabela curada', () => {
    // 150 kcal/100 g, não 999: desde `foodItemSanity`, densidade acima de 900 é
    // considerada dado errado (total de refeição no campo per_100g) e o candidato
    // some antes de chegar aqui.
    const learned = cand('arroz cozido', 150, 3, 30, 1, 'learned')
    const merged = mergeCandidates([learned], databaseCandidates())
    const arroz = merged.filter((c) => c.name.toLowerCase().includes('arroz cozido'))
    expect(arroz).toHaveLength(1)
    expect(arroz[0].source).toBe('learned')
  })

  it('não duplica alimento entre fontes (acento/caixa não criam gêmeo)', () => {
    const merged = mergeCandidates([cand('Açaí', 58, 1, 6, 3, 'learned')], [cand('acai', 58, 1, 6, 3, 'custom')])
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('learned')
  })

  it('alimento sem macro nenhum não vira candidato — não dá pra dimensionar porção', () => {
    const merged = mergeCandidates([cand('agua', 0, 0, 0, 0, 'learned')])
    expect(merged).toHaveLength(0)
  })
})

describe('source-guard: a troca grava sozinha e só no plano próprio', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const route = strip(readFileSync('src/app/api/nutrition/diet-plan/swap/route.ts', 'utf8'))

  it('persiste a troca sem o usuário precisar salvar de novo (item 4)', () => {
    expect(route).toMatch(/\.update\(\{ \.\.\.payload/)
    expect(route).toMatch(/\.eq\('id', row\.id\)/)
  })

  it('só mexe em plano PRÓPRIO — na LEITURA e na ESCRITA, não em uma só', () => {
    // Guard falso pego em 03/08/2026: `toMatch` genérico passava mesmo removendo o
    // filtro da leitura, porque casava com o do update. Ler o plano do professor e
    // só falhar no update seria vazamento de conteúdo alheio na resposta de erro.
    const read = route.slice(route.indexOf(".from('student_diet_plans')"), route.indexOf('const days = planDays'))
    const write = route.slice(route.indexOf('.update({ ...payload'))
    expect(read).toMatch(/\.eq\('created_by', userId\)/)
    expect(write).toMatch(/\.eq\('created_by', userId\)/)
  })

  it('não troca por alimento de outra classe: sem candidato, recusa', () => {
    expect(route).toMatch(/no_alternative/)
  })

  it('mantém o formato do plano — trocar um item não transforma dia em semana', () => {
    expect(route).toMatch(/isWeek\s*\?/)
  })
})
