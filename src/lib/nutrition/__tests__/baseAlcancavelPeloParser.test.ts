import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '../parser'
import { foodDatabase } from '../food-database'

/**
 * Guard de CLASSE: toda chave de `foodDatabase` tem que ser alcançável pelo
 * próprio parser — pedir "100g <chave>" tem que devolver EXATAMENTE 1 item
 * reconhecido e 0 linhas desconhecidas.
 *
 * Nasceu vermelho (02/09/2026): `legumes e salada` era código morto desde que
 * o split cego de " e " existe — o comentário que dizia "nenhum alimento da
 * base contém um ' e ' solitário" já era falso antes desta tarefa. A correção
 * (`separarPorConectorE`, ver parser.ts) resolve a classe inteira, não só
 * este caso — por isso o guard varre TODAS as chaves, não lista os nomes que
 * já se sabia que quebravam (armadilha nº 3 da lista de guards falsos do
 * repo: cobrir as pontas e não a fiação).
 */
describe('toda chave da base é alcançável pelo parser', () => {
  it('cada chave, sozinha, resolve para exatamente 1 item e 0 desconhecidas', () => {
    const inalcancaveis = Object.keys(foodDatabase).filter((k) => {
      const r = analyzeMeal(`100g ${k}`)
      return r.items.length !== 1 || r.unknownLines.length !== 0
    })
    expect(inalcancaveis, 'chave que o separador/casamento desmonta é chave morta').toEqual([])
  })
})
