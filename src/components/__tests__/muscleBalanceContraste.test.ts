/**
 * Guard do card Equilíbrio Muscular (11/08/2026).
 *
 * ## O defeito
 * Os números de séries eram desenhados DENTRO da barra de proporção, e a cor de
 * cada um era escolhida pelo tamanho do próprio lado:
 *
 *     <span style={{ color: pctA > 30 ? '#000' : 'rgba(255,255,255,0.4)' }}>{im.setsA}</span>
 *     <span style={{ color: pctB > 30 ? '#000' : 'rgba(255,255,255,0.4)' }}>{im.setsB}</span>
 *
 * Só que a barra pinta **da esquerda** (`width: ${pctA}%`), e `pctB = 100 - ratio`.
 * O número da direita fica na borda direita — sobre a área NÃO preenchida, escura —
 * e recebia `#000` sempre que `pctA < 70`. Como os pares de antagonistas orbitam os
 * 50%, isso é praticamente sempre: **preto sobre quase-preto, ~1.1:1**.
 *
 * O lado A tinha o defeito espelhado: com `pctA` de 20% o número ainda está sobre a
 * tinta âmbar, e recebia branco a 40% de opacidade.
 *
 * ## Por que não bastava mexer no limiar
 * A condição perguntava "meu lado é grande?" quando a pergunta é "estou sobre a
 * tinta ou sobre o vazio?". Qualquer limiar mantém o contraste sendo **função do
 * dado** — o mesmo componente fica legível ou ilegível conforme o treino da semana.
 * Mesma classe do card de PR (texto sobre arte sem scrim, PR #769): texto sobre
 * fundo variável é contraste imprevisível por construção.
 *
 * A correção move os números para junto do rótulo, fora da barra, onde o fundo é o
 * do card — constante.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(__dirname, '..', 'MuscleBalanceCard.tsx'), 'utf8')

/** Remove comentários: o texto que EXPLICA o padrão proibido não pode acusá-lo. */
const CODIGO = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('barra de proporção — o contraste não pode depender do dado', () => {
  it('nenhuma cor de texto é escolhida por um percentual da barra', () => {
    // A classe inteira: `pct… > n ? cor : cor`. Pega o limiar 30 antigo e qualquer outro.
    expect(
      CODIGO,
      'cor de texto decidida por percentual = legibilidade que muda com o treino da semana',
    ).not.toMatch(/color:\s*pct[A-Z]?\s*[<>]/)
  })

  it('não há texto desenhado sobre a barra', () => {
    // A barra é o único fundo variável do card. Sem texto dentro dela, o problema
    // não tem onde renascer — inclusive com uma condição escrita de outro jeito.
    const barra = /<div className="relative h-2\.5 rounded-full overflow-hidden"([\s\S]*?)\n {18}<\/div>/.exec(CODIGO)?.[1]
    expect(barra, 'a barra mudou de forma — o guard perdeu o alvo').toBeTruthy()
    expect(barra).not.toMatch(/\{im\.sets[AB]\}/)
  })

  it('os dois números aparecem na linha dos rótulos', () => {
    const linhaRotulos = /items-baseline text-xs">([\s\S]*?)<\/div>/.exec(CODIGO)?.[1] ?? ''
    expect(linhaRotulos).toMatch(/\{im\.setsA\}/)
    expect(linhaRotulos).toMatch(/\{im\.setsB\}/)
  })

  it('o preto some do componente', () => {
    // `#000` só fazia sentido como texto sobre a tinta clara da barra.
    expect(CODIGO).not.toMatch(/'#000'/)
  })
})

describe('legibilidade dos metadados', () => {
  it('nenhum texto usa opacidade de 30% ou menos', () => {
    // Sobre o fundo do card (~#0f0f0f), branco a 30% dá ~2.1:1 — metade do mínimo AA.
    const fracos = [...CODIGO.matchAll(/text-white\/(\d+)/g)]
      .map((m) => Number(m[1]))
      .filter((v) => v <= 30)
    expect(fracos, 'texto abaixo de 4.5:1 — subir para /55 ou mais').toEqual([])
  })

  it('a dica acionável não fica em opacidade nem em corpo minúsculo', () => {
    // "Adicione mais séries de X" é a única instrução do card: era 10px a 70%.
    expect(CODIGO).toMatch(/text-\[11px\] text-amber-300/)
    expect(CODIGO).not.toMatch(/text-amber-400\/70/)
  })
})

/**
 * Segunda rodada, com o card inteiro visível no aparelho: os chips "Mais
 * treinados (séries)" repetiam os números que as barras já mostravam — 5 dos 6,
 * medido na tela. `docs/DESIGN_HIERARCHY.md`: um fato, um lugar. O bloco só
 * acrescenta quando fala dos músculos SEM antagonista (panturrilha, glúteos).
 */
describe('chips — não repetem o que as barras já dizem', () => {
  it('a lista é filtrada pelos músculos que já aparecem nos pares', () => {
    expect(CODIGO, 'sem o filtro, o chip repete o número da barra logo acima')
      .toMatch(/const semPar = data\.muscleVolume\.filter\(m => !jaNosPares\.has\(m\.id\)\)/)
    expect(CODIGO, 'render cru da lista completa = a repetição de volta')
      .not.toMatch(/data\.muscleVolume\.slice\(0, 6\)\.map/)
  })

  it('o filtro ignora pares que não chegam a ser desenhados', () => {
    // O render pula par com `total === 0`; se o Set incluísse esses pares, um
    // músculo sumiria dos DOIS lugares — pior que a repetição.
    expect(CODIGO).toMatch(/data\.imbalances\.filter\(i => i\.setsA \+ i\.setsB > 0\)\.flatMap/)
  })

  it('o rótulo diz o que a lista virou', () => {
    // "Mais treinados" descreveria um ranking que a lista filtrada não é mais.
    expect(CODIGO).toMatch(/Sem par antagonista \(séries\)/)
    expect(CODIGO).not.toMatch(/Mais treinados \(séries\)/)
  })

  it('o bloco some quando não sobra ninguém', () => {
    expect(CODIGO).toMatch(/\{semPar\.length > 0 && \(/)
  })
})
