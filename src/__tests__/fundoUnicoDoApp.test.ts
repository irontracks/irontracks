/**
 * O app tem UM fundo: #0a0a0a (neutral-950).
 *
 * Até 13/08/2026 havia dois. O `body` pintava #0a0a0a — a base documentada do
 * design system — e o shell do dashboard pintava #171717 por cima, **2,8× mais
 * claro**. Como as cinco abas (Treinos, Avaliações, Comunidade, Nutrição, VIP)
 * vivem dentro desse shell e as telas cheias (Histórico, Configurações, Painel)
 * não, sair de uma aba para uma tela escurecia o app sem motivo nenhum.
 *
 * Foi o dono quem notou, e descreveu como "as cores do fundo e dos cards estão
 * invertidas". A relação card/fundo nunca esteve invertida — o que trocava era
 * o fundo por baixo dela.
 *
 * ⚠️ O argumento é CONSISTÊNCIA, não legibilidade, e a medição obriga a dizer
 * isso: o card `rgba(255,255,255,0.03)` separa 1,048 sobre #0a0a0a e 1,063
 * sobre #171717. Praticamente igual — a versão anterior desta análise afirmava
 * que os cards "colavam" no fundo claro, e estava errada.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SHELL = join('src', 'app', '(app)', 'dashboard', 'IronTracksAppClientImpl.tsx')
const BODY = join('src', 'app', 'layout.tsx')

describe('fundo único do app', () => {
  it('o body é neutral-950', () => {
    expect(readFileSync(BODY, 'utf8')).toMatch(/<body[^>]*bg-neutral-950/s)
  })

  it('o shell do dashboard usa o MESMO fundo do body', () => {
    const src = readFileSync(SHELL, 'utf8')
    const shell = /className="w-full bg-neutral-(\d+) min-h-screen relative flex flex-col/.exec(src)
    expect(shell, 'o container raiz do dashboard sumiu ou mudou de forma').not.toBeNull()
    expect(
      shell?.[1],
      'o shell pintando um fundo diferente do body faz o app clarear e escurecer ' +
        'conforme a navegação. Se precisar de outra profundidade, use bg-depth-* ' +
        'num bloco interno — não no container de tela inteira.',
    ).toBe('950')
  })
})
