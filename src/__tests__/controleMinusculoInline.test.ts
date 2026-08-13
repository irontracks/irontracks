/**
 * Controle interativo com tamanho declarado em `style` inline.
 *
 * O guard de alvo de toque lê CLASSES do Tailwind. Um botão dimensionado por
 * `style={{ width: 6, height: 6 }}` passa por baixo dele — e foi o que os dots
 * de progresso do tour eram: cinco botões de 6px, com 12px entre centros.
 *
 * O caso é instrutivo porque a correção NÃO é ampliar o alvo. Com 12px de passo,
 * dar 44pt a cada dot criaria 32px de sobreposição entre vizinhos: o toque
 * acionaria o passo errado, que é pior que não ter alvo. Um controle pequeno
 * demais promete uma interação que o dedo não cumpre — a saída é deixar de
 * prometer. Os dots viraram indicador (`aria-hidden`), a navegação ficou com o
 * "Próximo" e o swipe, e o contador textual "1 / 5" carrega a informação para o
 * leitor de tela.
 *
 * Piso: 24px, o mínimo do WCAG 2.5.8. Abaixo disso não é alvo — é enfeite que
 * escuta cliques.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RAIZES = [join('src', 'components'), join('src', 'app')]
const PISO_WCAG = 24

const arquivos = RAIZES.flatMap((raiz) =>
  readdirSync(raiz, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))
    .map((f) => join(raiz, f)),
)

/** Tags de abertura de <button>, respeitando aninhamento de chaves. */
const botoes = (src: string): string[] => {
  const out: string[] = []
  for (const m of src.matchAll(/<button\b/g)) {
    let i = (m.index ?? 0) + m[0].length
    let prof = 0
    while (i < src.length) {
      const c = src[i]
      if (c === '{' || c === '[' || c === '(') prof++
      else if (c === '}' || c === ']' || c === ')') prof--
      else if (c === '>' && prof <= 0) { out.push(src.slice(m.index ?? 0, i)); break }
      i++
    }
  }
  return out
}

/** Menor dimensão numérica declarada em style inline, se houver. */
const dimensaoInline = (tag: string): number | null => {
  const vals: number[] = []
  for (const chave of ['width', 'height']) {
    const m = new RegExp(`\\b${chave}\\s*:\\s*(\\d+)\\b`).exec(tag)
    if (m) vals.push(Number(m[1]))
  }
  return vals.length ? Math.min(...vals) : null
}

describe('controle interativo dimensionado por style inline', () => {
  it('nenhum botão abaixo do piso de 24px do WCAG', () => {
    const minusculos: string[] = []
    for (const rel of arquivos) {
      for (const tag of botoes(readFileSync(rel, 'utf8'))) {
        const d = dimensaoInline(tag)
        if (d !== null && d < PISO_WCAG) minusculos.push(`${rel}: ${d}px`)
      }
    }
    expect(
      minusculos,
      'abaixo de 24px não é alvo, é enfeite que escuta clique. Se o elemento é ' +
        'indicador (dot de progresso, barra), torne-o `aria-hidden` e deixe a ' +
        'navegação com quem tem tamanho. Ampliar o alvo só resolve quando há ' +
        'espaço entre vizinhos — senão o toque acerta o errado.',
    ).toEqual([])
  })

  it('a leitura de dimensão inline funciona', () => {
    expect(dimensaoInline('<button style={{ width: 6, height: 6 }}>')).toBe(6)
    expect(dimensaoInline('<button style={{ width: i === idx ? 20 : 6, height: 6 }}>')).toBe(6)
    expect(dimensaoInline('<button style={{ height: 44 }}>')).toBe(44)
    expect(dimensaoInline('<button className="w-6 h-6">')).toBeNull()
  })
})
