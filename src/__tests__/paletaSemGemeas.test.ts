/**
 * Deriva de paleta — a cor que ninguém distingue, mas o sistema tem que manter.
 *
 * Medição de 12/08/2026 no produto (fora landing/marketing): 618 hex escritos à
 * mão em 86 tons distintos, contra os 14 da paleta documentada. Metade dos usos
 * estava fora dela.
 *
 * O problema não é o volume — é a natureza do desvio. Havia `#0f0f0f` contra o
 * `#0f0f0e` oficial (Δ=1,7), `#141414` contra `#151514` (Δ=2), `#1a1a1a` contra
 * `#1a1a18` (Δ=3). São diferenças que o olho humano não resolve num fundo
 * escuro: alguém digitou de memória em vez de usar o token que já existia. E
 * sete cores apareciam nas DUAS grafias, maiúscula e minúscula — ninguém copia
 * de uma fonte única; cada um digita a sua.
 *
 * Custo real: no dia em que o dourado da marca mudar, ele muda nos 14 lugares
 * certos e continua velho nos outros 86.
 *
 * Este guard trava só as INVISÍVEIS (Δ < 12 pela distância ponderada de
 * Thiadmer Riemersma, que aproxima a percepção melhor que a euclidiana em RGB).
 * Acima disso é decisão de design — uma cor pode ser deliberadamente próxima —,
 * e um guard que opina sobre isso seria afrouxado na primeira semana.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PALETA = [
  '#eab308', '#fbbf24', '#f59e0b', '#d97706', '#ca8a04', '#b45309',
  '#22c55e', '#ef4444', '#f97316', '#3b82f6',
  '#0a0a0a', '#0f0f0e', '#151514', '#1a1a18',
]

/** Landing e páginas comerciais têm identidade própria — fora do produto. */
const FORA_DO_PRODUTO = /comercial|para-professores/

const LIMIAR_INVISIVEL = 12

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/** Distância ponderada — aproxima percepção melhor que euclidiana em RGB. */
const distancia = (a: string, b: string): number => {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const rm = (r1 + r2) / 2
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db)
}

const maisProxima = (hex: string) =>
  PALETA.reduce((melhor, p) => (distancia(hex, p) < distancia(hex, melhor) ? p : melhor), PALETA[0])

const arquivos = ['src/components', 'src/app'].flatMap((raiz) =>
  readdirSync(raiz, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__') && !FORA_DO_PRODUTO.test(f))
    .map((f) => `${raiz}/${f}`),
).filter((f) => !FORA_DO_PRODUTO.test(f))

describe('paleta — nenhuma cor quase-gêmea', () => {
  it('nenhum hex a menos de 12 de distância de uma cor oficial', () => {
    const gemeas: string[] = []
    for (const rel of arquivos) {
      const src = readFileSync(rel, 'utf8')
      for (const m of new Set(src.match(/#[0-9a-fA-F]{6}\b/g) ?? [])) {
        const hex = m.toLowerCase()
        if (PALETA.includes(hex)) continue
        const perto = maisProxima(hex)
        const d = distancia(hex, perto)
        if (d < LIMIAR_INVISIVEL) gemeas.push(`${rel}: ${m} ≈ ${perto} (Δ=${d.toFixed(1)})`)
      }
    }
    expect(
      gemeas,
      'cor a essa distância é indistinguível da oficial no aparelho — use a da ' +
        'paleta (ou o token bg-depth-*). Manter as duas só duplica o custo do dia ' +
        'em que a paleta mudar.',
    ).toEqual([])
  })

  it('a distância enxerga o que deve enxergar', () => {
    expect(distancia('#0f0f0f', '#0f0f0e')).toBeLessThan(LIMIAR_INVISIVEL)
    expect(distancia('#1a1a1a', '#1a1a18')).toBeLessThan(LIMIAR_INVISIVEL)
    // Dourado × âmbar são próximos, mas distinguíveis: o guard não os funde.
    expect(distancia('#eab308', '#f59e0b')).toBeGreaterThan(LIMIAR_INVISIVEL)
  })
})
