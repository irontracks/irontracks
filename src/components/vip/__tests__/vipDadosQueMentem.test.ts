import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Três achados da aba VIP em que o número na tela diz uma coisa e o dado diz
 * outra. Não são questões de gosto: o usuário LÊ o valor errado e decide com
 * base nele.
 */
describe('VIP: o que a tela diz bate com o dado', () => {
  it('sono mostra a unidade — sem ela, horas viram nota', () => {
    const card = semComentarios(ler('src/components/vip/VipWeeklySummaryCard.tsx'))
    const bloco = card.slice(card.indexOf('checkins?.sleep != null'), card.indexOf('checkins?.sleep != null') + 700)
    expect(
      bloco,
      'a API entrega `sleep_hours`. Sem "h", 7.5 ao lado de uma Energia que diz ' +
      '"média de 5" lê como nota numa escala — e 7,5 de sono (ótimo) parece mediano',
    ).toMatch(/>h</)
  })

  it('a frequência do heatmap usa o divisor da PRÓPRIA janela', () => {
    const mapa = semComentarios(ler('src/components/vip/WorkoutHeatMap.tsx'))
    expect(
      mapa,
      'divisores soltos: 30 dias ÷ 4 semanas (são 4,29 — 7% a mais) e 365 ÷ 52. ' +
      'Trocar a janela mudava a frequência sobre a mesma base',
    ).not.toMatch(/totalCheckins\s*\/\s*(4|52)\b/)
    expect(mapa, 'janela e divisor saem da mesma constante').toMatch(/semanasDaJanela\s*=\s*diasDaJanela\s*\/\s*7/)
    expect(mapa, 'a janela também vem da constante').toMatch(/now - diasDaJanela \*/)
  })

  it('o empty state cala quando houve ERRO — senão culpa o usuário', () => {
    const painel = semComentarios(ler('src/components/vip/VipInsightsPanel.tsx'))
    const bloco = painel.slice(painel.indexOf('items.length === 0'), painel.indexOf('items.length === 0') + 300)
    expect(
      bloco,
      'com falha de rede a tela dizia "Finalize um treino para gerar insights" — ' +
      'afirma que o usuário não treinou quando o que houve foi erro do app',
    ).toMatch(/error \? null :/)
  })
})
