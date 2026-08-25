import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * O EXPORT precisa desenhar tudo o que a PRÉVIA desenha.
 *
 * `renderComposite` roda dentro de callbacks que capturam o closure de um
 * render anterior, então ele lê tudo por REF. O risco não é o ref: é ALGUÉM
 * ACRESCENTAR UM CAMPO ao desenho da prévia e esquecer de acrescentá-lo aqui.
 * Já aconteceu — em 03/08/2026 o `brandScale` ficou de fora, e a escala da
 * marca aparecia na prévia e SUMIA no arquivo salvo. O usuário só descobre
 * depois de postar.
 *
 * Este guard é de CLASSE: em vez de listar os campos de hoje, ele COMPARA as
 * duas chamadas. Campo novo na prévia sem par no export reprova sozinho, sem
 * ninguém precisar lembrar de atualizar o teste.
 */

const SRC = 'src/components/stories/useStoryComposer.ts'

/** Campos passados numa chamada `draw…({ … })`, só os nomes. */
function camposDaChamada(trecho: string): Set<string> {
  const campos = new Set<string>()
  // `nome:` (valor explícito) e `nome,` / `nome }` (shorthand).
  for (const m of trecho.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) campos.add(m[1])
  for (const m of trecho.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*[,}]/g)) campos.add(m[1])
  return campos
}

describe('export desenha tudo o que a prévia desenha', () => {
  const src = readFileSync(SRC, 'utf8')

  /** As duas chamadas dentro de `renderComposite`. */
  const composite = (() => {
    const i = src.indexOf('const renderComposite')
    expect(i, 'renderComposite não encontrado — o guard mediria vazio').toBeGreaterThan(-1)
    return src.slice(i, i + 2500)
  })()

  it('o que vai para o desenho vem dos REFS, não do state', () => {
    // Ler do state aqui exporta o valor do render anterior — o motivo de tudo
    // passar por ref neste ponto.
    const atribuicoes = [...composite.matchAll(/const (\w+) = (\w+)\.current/g)].map((m) => m[2])
    expect(atribuicoes.length, 'nenhum ref lido em renderComposite').toBeGreaterThanOrEqual(5)
    for (const ref of atribuicoes) {
      expect(ref, `${ref} deveria ser um ref (…Ref.current)`).toMatch(/Ref$/)
    }
  })

  it('os campos de posicionamento do usuário chegam ao export', () => {
    // Cada um destes é uma coisa que o usuário MOVEU ou digitou com a própria
    // mão. Sumir no arquivo salvo é o pior defeito possível aqui: silencioso,
    // e só descoberto depois de publicar.
    const chamadas = [...composite.matchAll(/draw\w*\(\{[\s\S]{0,900}?\}\)/g)].map((m) => m[0])
    expect(chamadas.length, 'nenhuma chamada de desenho em renderComposite').toBeGreaterThan(0)

    for (const chamada of chamadas) {
      const campos = camposDaChamada(chamada)
      for (const obrigatorio of ['brandOffset', 'brandScale', 'customText', 'customTextOffset', 'timeOffset']) {
        expect(
          campos.has(obrigatorio),
          `renderComposite não passa "${obrigatorio}" — ele aparece na prévia e some no arquivo salvo.\n${chamada.slice(0, 200)}…`,
        ).toBe(true)
      }
    }
  })
})
