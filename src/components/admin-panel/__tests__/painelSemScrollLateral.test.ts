/**
 * O corpo da página nunca rola na horizontal.
 *
 * Relatado pelo dono com dois prints do mesmo instante (19:12) em posições
 * horizontais diferentes: a lista de alunos deslizava para os lados enquanto
 * ele rolava para baixo, e os nomes apareciam cortados — "…io DJ Ploc",
 * "…ncine Kokott". A barra de rolagem horizontal aparecia no rodapé.
 *
 * Duas peças, ambas corretas sozinhas:
 *
 *   `AdminPanelSubTabs` usa `-mx-4` para o fundo sticky dos chips sangrar até a
 *   borda da tela. Técnica legítima.
 *
 *   O contêiner de conteúdo do `AdminPanelV2` rolava com `overflow-y-auto px-4`
 *   e deixava o eixo X livre.
 *
 * Juntas: a sangria de 16px por lado vira scroll horizontal da PÁGINA. Quem
 * sangra precisa de alguém que segure — e o guard cobra o segundo, porque o
 * primeiro é o padrão do app e vai se repetir.
 *
 * ⚠️ NÃO saímos aplicando `overflow-x-hidden` nos outros 10 contêineres com
 * `overflow-y-auto` + `px-*`: só 1 deles tem sangria negativa (de 4px), e
 * esconder o eixo X em contêiner que um dia receba tabela larga cortaria
 * conteúdo em silêncio. Corrigir onde há evidência, não onde há suspeita.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const painel = readFileSync(join('src', 'components', 'AdminPanelV2.tsx'), 'utf8')
const subtabs = readFileSync(join('src', 'components', 'admin-panel', 'AdminPanelSubTabs.tsx'), 'utf8')

describe('painel admin — sem deslize lateral', () => {
  it('o contêiner de conteúdo trava o eixo X', () => {
    const cont = /className="flex-1 min-h-0 overflow-y-auto([^"]*)"/.exec(painel)
    expect(cont, 'o contêiner de rolagem do painel sumiu ou mudou de forma').not.toBeNull()
    expect(
      cont?.[1],
      'sem `overflow-x-hidden`, a sangria `-mx-4` dos chips de sub-aba vira ' +
        'scroll horizontal da página inteira e a lista desliza enquanto se rola.',
    ).toContain('overflow-x-hidden')
  })

  it('a sangria dos chips continua existindo — é ela que o guard protege', () => {
    // Se um dia o `-mx-4` sair, o guard acima perde o motivo e alguém pode
    // remover a trava achando que é sobra. O par tem que ser lido junto.
    expect(subtabs).toMatch(/-mx-\d/)
  })
})
