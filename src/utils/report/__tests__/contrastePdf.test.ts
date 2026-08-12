/**
 * Guard de contraste do PDF — e ele CALCULA, não casa string.
 *
 * O relatório em PDF é um caminho separado do React: `buildHtml.ts` monta HTML
 * com hex inline, sem classes Tailwind. Por isso a varredura de contraste de
 * 11/08/2026, que varreu `text-neutral-*`, passou longe daqui — e o arquivo
 * seguia com `#6b7280` (4.02:1) e `#737373` (4.10:1) sobre o fundo `#0d0d0d`,
 * ambos abaixo do mínimo de 4.5 do WCAG AA.
 *
 * Onde estavam: nome do atleta, rótulos das estatísticas, cabeçalho das tabelas
 * e células "muted" — ou seja, no texto que diz o que cada número significa.
 * E este é o artefato que o usuário COMPARTILHA: é a cara do app fora do app.
 *
 * Um guard que travasse a lista de hex proibidos envelheceria na primeira cor
 * nova. Este extrai toda declaração `color: #xxx` do arquivo e mede cada uma
 * contra o fundo declarado no próprio CSS. Cor nova que reprove nasce vermelha.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(__dirname, '..', 'buildHtml.ts'), 'utf8')

/** Fundo do documento, lido do próprio CSS — não hardcoded aqui. */
const FUNDO = /body\s*\{[^}]*background:\s*(#[0-9a-fA-F]{3,6})/.exec(SRC)?.[1] ?? ''

const MIN_AA = 4.5

const canal = (c: number): number => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

const luminancia = (hex: string): number => {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

const contraste = (a: string, b: string): number => {
  const [x, y] = [luminancia(a), luminancia(b)]
  const [hi, lo] = x > y ? [x, y] : [y, x]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Cores que NÃO são texto corrido e por isso não caem na régua de 4.5:1:
 * acento de marca em peso alto, e as cores de status dentro de tags que têm
 * fundo próprio (o cálculo contra o fundo da página não se aplica a elas).
 */
const NAO_E_TEXTO_CORRIDO = new Set([
  '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', // acento dourado, sempre em bold
  '#4ade80', '#f87171', '#fca5a5',            // status dentro de tag com fundo próprio
  '#000', '#000000', '#0d0d0d', '#0b0b0b',    // fundos e texto sobre dourado
  '#171717', '#161616', '#262626', '#2a2a2a',
  '#ffffff', '#fafafa', '#f5f5f5',            // claros: passam com folga
])

describe('contraste do PDF de treino', () => {
  it('o fundo do documento foi encontrado no CSS', () => {
    expect(FUNDO, 'o seletor body mudou — o guard perdeu a referência').toMatch(/^#[0-9a-fA-F]{3,6}$/)
  })

  it('nenhuma cor de texto fica abaixo do mínimo AA sobre o fundo', () => {
    const cores = new Set(
      [...SRC.matchAll(/color:\s*(#[0-9a-fA-F]{3,6})/g)].map((m) => m[1].toLowerCase()),
    )
    expect(cores.size, 'nenhuma cor extraída — a regex perdeu o alvo').toBeGreaterThan(3)

    const reprovadas = [...cores]
      .filter((c) => !NAO_E_TEXTO_CORRIDO.has(c))
      .map((c) => ({ cor: c, r: Number(contraste(c, FUNDO).toFixed(2)) }))
      .filter((x) => x.r < MIN_AA)

    expect(
      reprovadas,
      `Sobre ${FUNDO}, estas cores de texto reprovam o mínimo de ${MIN_AA}:1 do WCAG AA. ` +
        'Este PDF é o que o usuário compartilha — use #a3a3a3 (7.70:1) ou mais claro, ' +
        'ou registre em NAO_E_TEXTO_CORRIDO se for acento em peso alto ou tag com fundo próprio.',
    ).toEqual([])
  })

  it('a régua do guard funciona — prova com uma cor sabidamente ruim', () => {
    // Sem isto, um erro no cálculo faria o teste acima passar sempre.
    expect(contraste('#6b7280', '#0d0d0d')).toBeLessThan(MIN_AA)
    expect(contraste('#a3a3a3', '#0d0d0d')).toBeGreaterThan(MIN_AA)
  })
})
