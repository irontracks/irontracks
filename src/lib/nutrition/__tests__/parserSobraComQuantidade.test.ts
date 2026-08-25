/**
 * O parser desconfia quando sobra COMIDA COM QUANTIDADE depois da cabeça.
 *
 * O caso que motivou (relatado no iPhone em 25/08/2026, no chat da nutrição):
 *
 *   "140g de atum sólido ao natural mais 70g de proteína de soja
 *    com 400ml de leite desnatado zero lactose"
 *
 * casava 'atum' na cabeça, ficava com os 140g e **ignorava o resto em
 * silêncio** — 162 kcal, o mesmo valor de comer só o atum. Como não sobrava
 * `unknownLine`, a cascata do `resolveFood` considerava sucesso e nunca
 * chamava a IA; o chat respondeu com confiança e ofereceu "Lançar no diário"
 * com ~1/3 das calorias reais. Um número plausível e errado é pior que não
 * reconhecer: ninguém confere o que parece certo.
 *
 * A defesa NÃO tenta adivinhar a comida que faltou — ela admite que o parser
 * não é o dono daquela linha e devolve o caso para quem lê a frase inteira.
 */
import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '@/lib/nutrition/parser'

describe('sobra com quantidade → a linha vai para a cascata', () => {
  it('o caso do chat: o resto da frase não some mais', () => {
    const r = analyzeMeal('140g de atum sólido ao natural mais 70g de proteína de soja com 400ml de leite desnatado zero lactose')
    // O atum é reconhecido (o "mais" separa), e o que sobrou vira desconhecido
    // — é esse sinal que faz a cascata seguir para TACO/OFF/IA.
    expect(r.unknownLines.join(' ')).toMatch(/proteína de soja/i)
    expect(r.unknownLines.join(' ')).toMatch(/leite desnatado/i)
  })

  it('quantidade escondida depois da cabeça derruba o match', () => {
    const r = analyzeMeal('300ml de leite desnatado com 30g de whey')
    expect(r.items, 'com uma segunda porção na linha, o parser não é o dono dela').toHaveLength(0)
    expect(r.unknownLines).toHaveLength(1)
  })

  /**
   * A REGRESSÃO que esta defesa não pode causar: prato composto continua sendo
   * UM item. Separar por " com " devolveria o ingrediente ganhando do prato —
   * 39 kcal de requeijão no lugar de 224 da esfirra —, que é exatamente o bug
   * que o `matchesAtHead` existe para matar.
   */
  it('prato composto continua inteiro — "com" NÃO é separador', () => {
    const r = analyzeMeal('1 esfirra de frango com requeijão')
    expect(r.items).toHaveLength(1)
    expect(Math.round(r.meal.calories)).toBe(224)
    expect(r.unknownLines).toHaveLength(0)
  })

  it('modo de preparo não é sobra — "grelhado" não tem quantidade', () => {
    const r = analyzeMeal('200g de frango grelhado')
    expect(r.items).toHaveLength(1)
    expect(Math.round(r.meal.calories)).toBeGreaterThan(0)
  })

  /**
   * Número dentro do NOME do produto não abre uma segunda porção. Sem exigir a
   * unidade, "coca zero 350" viraria desconhecido e a cascata gastaria uma
   * chamada de IA para algo que o parser já sabia.
   */
  it('dígito no nome do produto não conta como sobra', () => {
    for (const texto of ['200ml de leite integral', '2 ovos cozidos', '1 colher de azeite']) {
      const r = analyzeMeal(texto)
      expect(r.unknownLines, `"${texto}" não tem segunda porção`).toHaveLength(0)
    }
  })

  /**
   * ⚠️ Falso positivo MEDIDO na primeira versão desta defesa: aqui o "50g"
   * QUALIFICA a fatia, não abre uma segunda comida — e a linha, que rendia
   * 74 kcal, virou desconhecida. Por isso a regra exige algo DEPOIS da
   * quantidade ("com 30g de whey" casa; "…pão integral 50g" não).
   */
  it('peso no fim da linha qualifica a porção — não é comida nova', () => {
    const r = analyzeMeal('1 fatia de pao integral 50g')
    expect(r.unknownLines).toHaveLength(0)
    expect(Math.round(r.meal.calories)).toBe(74)
  })

  /**
   * ⚠️ Este caso já nasceu TAUTOLÓGICO e a mutação pegou: o `label` do item é a
   * linha crua, então procurar /ovos/ no texto passava verde mesmo com o
   * separador removido (um item só, rotulado com a frase inteira). O que prova
   * a separação é a CONTAGEM de itens.
   */
  it('"mais" separa itens; a base não tem alimento com "mais" no nome', () => {
    const r = analyzeMeal('200g de frango grelhado mais 2 ovos cozidos')
    expect(r.items).toHaveLength(2)
    expect(r.unknownLines).toHaveLength(0)
    // Frango (330) + 2 ovos (155): sem o separador, ficaria só o frango.
    expect(Math.round(r.meal.calories)).toBe(485)
  })
})
