import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '../parser'
import {
  detectPreparation,
  applyPreparation,
  keyEncodesPreparation,
  type Macros100g,
} from '../preparation'

/**
 * O parser ignorava o MODO DE PREPARO.
 *
 * A cabeça do nome manda no match ("frango frito" → chave 'frango'), então
 * "150g de frango frito" recebia os macros do frango grelhado: 6 g de gordura e
 * 248 kcal, quando o frito real passa de 20 g de gordura. O mesmo com "à
 * milanesa", "empanado" e "batata frita" — sempre pra MENOS, sempre em silêncio,
 * que é o pior tipo de erro num app de dieta (o número parece plausível e
 * ninguém confere).
 *
 * Duas metades testadas aqui:
 *  1. as funções puras de `preparation.ts` (detect/apply/keyEncodes);
 *  2. o efeito ponta a ponta no `analyzeMeal`, incluindo o que NÃO pode mudar.
 */
const parse = (text: string, extra?: Parameters<typeof analyzeMeal>[1]) => {
  const a = analyzeMeal(text, extra)
  const it0 = a.items[0]
  return {
    kcal: it0?.calories,
    p: it0?.protein,
    c: it0?.carbs,
    f: it0?.fat,
    grams: it0?.grams,
    label: it0?.label,
    prep: it0?.preparation,
    unknown: a.unknownLines,
    n: a.items.length,
    total: a.meal,
  }
}

// ── 1. Funções puras ────────────────────────────────────────────────────────
describe('detectPreparation', () => {
  it('não inventa preparo onde não tem', () => {
    expect(detectPreparation('')).toBeNull()
    expect(detectPreparation('   ')).toBeNull()
    expect(detectPreparation('frango')).toBeNull()
    expect(detectPreparation('arroz integral')).toBeNull()
  })

  it.each(['frango frito', 'batata frita', 'ovos fritos', 'batatas fritas'])(
    'pega gênero e número em "%s"',
    (name) => {
      const prep = detectPreparation(name)
      expect(prep?.id).toBe('frito')
      expect(prep?.fat).toBe(10)
    },
  )

  it.each([
    ['peixe a milanesa', 'milanesa'],
    ['peixe milanesa', 'milanesa'],
    ['frango empanado', 'milanesa'],
    ['coxinha empanada', 'milanesa'],
    ['file a parmegiana', 'parmegiana'],
    ['frango a dore', 'frito'],
    ['brocolis refogado', 'refogado'],
    ['cenoura salteada', 'refogado'],
    ['pao na manteiga', 'refogado'],
    ['macarrao ao molho branco', 'creme'],
    ['batata com maionese', 'creme'],
    ['macarrao ao sugo', 'molho de tomate'],
  ])('"%s" → %s', (name, id) => {
    expect(detectPreparation(name)?.id).toBe(id)
  })

  it.each(['frango grelhado', 'ovo cozido', 'peixe assado', 'cenoura crua', 'brocolis no vapor', 'leite desnatado'])(
    'reconhece o preparo NEUTRO "%s" (delta zero, mas não é desconhecido)',
    (name) => {
      const prep = detectPreparation(name)
      expect(prep).not.toBeNull()
      expect(prep?.neutral).toBe(true)
      expect(prep?.fat).toBe(0)
    },
  )

  it('"sem óleo" e "air fryer" CANCELAM a gordura da fritura', () => {
    // O usuário disse explicitamente que não teve gordura — somar +10 g seria
    // desmentir o que ele escreveu. (E "2 ovos fritos sem óleo" é uma linha real
    // da suíte antiga do parser.)
    expect(detectPreparation('ovos fritos sem oleo')?.neutral).toBe(true)
    expect(detectPreparation('frango frito na air fryer')?.neutral).toBe(true)
    expect(detectPreparation('batata frita na airfryer')?.fat).toBe(0)
  })

  it('com mais de um preparo, vence o de maior impacto', () => {
    // 'grelhado' é neutro; o molho nomeado é que mexe nos macros.
    expect(detectPreparation('frango grelhado com molho de tomate')?.id).toBe('molho de tomate')
    expect(detectPreparation('carne com molho branco')?.id).toBe('creme')
  })

  it('só casa PALAVRA inteira — alimento não vira preparo', () => {
    // 'azeite'/'manteiga' são ALIMENTOS da base; o preparo exige "no azeite",
    // "na manteiga". Sem a borda de palavra, "1 colher de azeite" ganharia +5 g
    // de gordura fantasma em cima de um alimento que já é 100% gordura.
    expect(detectPreparation('azeite')).toBeNull()
    expect(detectPreparation('manteiga')).toBeNull()
    expect(detectPreparation('cream cheese')).toBeNull()
    expect(detectPreparation('creme de leite')).toBeNull()
  })

  it('"com molho" sem dizer QUAL é reconhecido, mas não ajusta nada', () => {
    // Ambíguo em PT-BR (molho da carne, de salada, shoyu). Ver parserSynonyms.
    const prep = detectPreparation('carne picada com molho')
    expect(prep?.neutral).toBe(true)
  })
})

describe('applyPreparation', () => {
  const frango: Macros100g = { kcal: 165, p: 31, c: 0, f: 4 }

  it('soma o delta e RECALCULA a caloria pelos macros (4/4/9)', () => {
    const prep = detectPreparation('frango frito')!
    const out = applyPreparation(frango, prep)
    expect(out.f).toBe(14) // 4 + 10
    expect(out.p).toBe(31) // intocado
    expect(out.kcal).toBe(165 + 10 * 9) // 255 — nada de constante de kcal própria
  })

  it('milanesa mexe em gordura E carbo; parmegiana ainda soma proteína', () => {
    const milanesa = applyPreparation(frango, detectPreparation('frango a milanesa')!)
    expect(milanesa.f).toBe(16)
    expect(milanesa.c).toBe(8)
    expect(milanesa.kcal).toBe(165 + 12 * 9 + 8 * 4)

    const parm = applyPreparation(frango, detectPreparation('frango a parmegiana')!)
    expect(parm.p).toBe(37)
    expect(parm.kcal).toBe(165 + 12 * 9 + 8 * 4 + 6 * 4)
  })

  it('preparo neutro devolve os macros idênticos', () => {
    const out = applyPreparation(frango, detectPreparation('frango grelhado')!)
    expect(out).toEqual(frango)
  })

  it('não devolve macro negativo nem NaN', () => {
    const lixo = { kcal: Number.NaN, p: -5, c: undefined as unknown as number, f: 'x' as unknown as number }
    const out = applyPreparation(lixo, detectPreparation('frito')!)
    expect(out.p).toBeGreaterThanOrEqual(0)
    expect(out.c).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(out.kcal)).toBe(true)
    expect(out.f).toBe(10)
  })
})

describe('keyEncodesPreparation', () => {
  it('a chave curada que JÁ é do preparo bloqueia o ajuste', () => {
    expect(keyEncodesPreparation('frango grelhado', detectPreparation('frango grelhado')!)).toBe(true)
    expect(keyEncodesPreparation('batata cozida', detectPreparation('batata cozida')!)).toBe(true)
    expect(keyEncodesPreparation('batata frita', detectPreparation('batata frita')!)).toBe(true)
  })

  it('chave sem o preparo não bloqueia', () => {
    expect(keyEncodesPreparation('frango', detectPreparation('frango frito')!)).toBe(false)
    expect(keyEncodesPreparation('', detectPreparation('frango frito')!)).toBe(false)
    // preparo diferente do que a chave codifica: 'frango grelhado' não é fritura
    expect(keyEncodesPreparation('frango grelhado', detectPreparation('frango frito')!)).toBe(false)
  })
})

// ── 2. Efeito no parser ─────────────────────────────────────────────────────
describe('o bug: fritura sem gordura', () => {
  it('"150g de frango frito" tem MAIS gordura e caloria que "150g de frango"', () => {
    const frito = parse('150g de frango frito')
    const puro = parse('150g de frango')

    expect(frito.unknown).toEqual([])
    expect(frito.grams).toBe(150)
    expect(puro.f).toBe(6) // o que o app dizia pro frito também
    expect(frito.f).toBe(21) // (4 + 10) g/100 g × 1,5
    expect(frito.kcal).toBe(383) // (165 + 90) × 1,5
    expect(frito.f).toBeGreaterThan(puro.f!)
    expect(frito.kcal).toBeGreaterThan(puro.kcal!)
    expect(frito.p).toBe(puro.p) // fritar não cria proteína
  })

  it('o total da refeição acompanha o item', () => {
    const a = analyzeMeal('150g de frango frito')
    expect(a.meal.calories).toBe(a.items[0]!.calories)
    expect(a.meal.fat).toBe(a.items[0]!.fat)
  })

  it('"1 bife de frango a milanesa" ganha gordura E carbo', () => {
    const milanesa = parse('1 bife de frango a milanesa')
    const puro = parse('1 bife de frango')

    expect(milanesa.unknown).toEqual([])
    expect(milanesa.grams).toBe(120) // frango: approx.bife
    expect(milanesa.f).toBeGreaterThan(puro.f!)
    expect(puro.c).toBe(0)
    expect(milanesa.c).toBeGreaterThan(0) // o empanamento
    expect(milanesa.c).toBe(10) // 8 g/100 g × 1,2
    expect(milanesa.f).toBe(19) // (4 + 12) × 1,2
  })

  it('"100g de batata frita" > "100g de batata cozida"', () => {
    // A base local não tem 'batata' genérica; quem entrega essa chave é a TACO
    // (alias "batata" de "Batata, inglesa, crua"), então o teste injeta exatamente
    // isso via extraFoods — o mesmo caminho da produção.
    const extra = { batata: { kcal: 64, p: 1.8, c: 14.7, f: 0 } }
    const frita = parse('100g de batata frita', extra)
    const cozida = parse('100g de batata cozida')

    expect(frita.unknown).toEqual([])
    expect(frita.f).toBe(10)
    expect(cozida.f).toBe(0)
    expect(frita.kcal).toBeGreaterThan(cozida.kcal!)
    expect(frita.kcal).toBe(154) // 64 + 10×9
  })

  it('refogado no azeite entra como gordura de panela', () => {
    const refogado = parse('100g de brocolis refogado')
    const cru = parse('100g de brocolis')
    expect(refogado.f).toBe(5) // 0,4 + 5 → arredonda 5
    expect(refogado.kcal).toBeGreaterThan(cru.kcal!)
  })
})

describe('nada de contar duas vezes', () => {
  it('"150g de frango grelhado" NÃO recebe ajuste (a chave já é grelhada)', () => {
    const grelhado = parse('150g de frango grelhado')
    const puro = parse('150g de frango')
    expect(grelhado.kcal).toBe(puro.kcal)
    expect(grelhado.p).toBe(puro.p)
    expect(grelhado.c).toBe(puro.c)
    expect(grelhado.f).toBe(puro.f)
    expect(grelhado.prep).toBeUndefined()
  })

  it('"200g de frango grelhado" bate exatamente com a chave curada', () => {
    const r = parse('200g de frango grelhado')
    expect(r.kcal).toBe(330) // 165 × 2, sem um kcal a mais
    expect(r.f).toBe(8)
    expect(r.label).toBe('200g de frango grelhado') // label intacto
  })

  it('chave curada que JÁ é frita não ganha os +10 g de novo', () => {
    // TACO: "Batata, inglesa, frita" = 267 kcal / 13,1 g de gordura por 100 g.
    const extra = { 'batata frita': { kcal: 267, p: 5, c: 35.6, f: 13.1 } }
    const r = parse('100g de batata frita', extra)
    expect(r.kcal).toBe(267)
    expect(r.f).toBe(13)
    expect(r.prep).toBeUndefined()
  })

  it.each(['1 ovo cozido', '100g de arroz cozido', '100g de feijao cozido', '100g de macarrao cozido'])(
    '"%s" (chave com o preparo embutido) fica igual ao curado',
    (text) => {
      expect(parse(text).prep).toBeUndefined()
    },
  )

  it('"2 ovos fritos sem óleo" continua sem gordura de fritura', () => {
    const r = parse('2 ovos fritos sem óleo')
    expect(r.grams).toBe(100)
    expect(r.f).toBe(11) // o ovo puro
    expect(r.prep).toBeUndefined()
  })
})

describe('transparência', () => {
  it('o label mostra o preparo detectado e o item carrega o campo', () => {
    const r = parse('150g de frango frito')
    expect(r.prep).toBe('frito')
    expect(r.label).toContain('frito')
    expect(r.label).toBe('150g de frango frito · frito')
  })

  it('sem ajuste, o label é o texto do usuário e ponto', () => {
    expect(parse('150g de frango').label).toBe('150g de frango')
    expect(parse('150g de frango').prep).toBeUndefined()
  })
})

describe('regressão: alimento sem preparo não muda nada', () => {
  it.each([
    ['150g de frango', 150, 248],
    ['100g de arroz cozido', 100, 130],
    ['1 ovo', 50, 78],
    ['1 banana', 80, 71],
    ['1 copo de leite integral', 250, 153],
    ['1,5 colher de arroz cozido', 38, 49],
  ])('%s → %ig / %i kcal', (text, grams, kcal) => {
    const r = parse(text)
    expect(r.grams).toBe(grams)
    expect(r.kcal).toBe(kcal)
    expect(r.prep).toBeUndefined()
  })

  it('linha não reconhecida segue não reconhecida (o preparo não salva ninguém)', () => {
    // "1 bife à milanesa" sem dizer o alimento: "bife" é UNIDADE, não comida —
    // some da cabeça do nome e sobra "a milanesa". Continua indo pra cascata
    // (TACO/IA), que lê a frase inteira. O preparo não inventa alimento.
    const r = analyzeMeal('1 bife a milanesa')
    expect(r.items).toHaveLength(0)
    expect(r.unknownLines).toContain('1 bife a milanesa')
  })
})
