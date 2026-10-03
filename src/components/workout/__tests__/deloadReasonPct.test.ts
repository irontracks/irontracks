/**
 * REPRODUÇÃO (diagnóstico 03/10/2026) — o texto do `reason` do deload diz um
 * percentual e a marca gravada diz outro.
 *
 * Caso real: Cadeira extensora de djmkapple, 01/10/2026. O `log.deload` saiu com
 * `reason: "Redução de 11.9% …"`, `requestedPct: 0.401`, `reductionPct: 0.394`,
 * `originalWeight: 104`, `suggestedWeight: 63`.
 *
 * Sequência que o hook faz (useWorkoutDeload.ts):
 *   1. abre o modal  → `reason = getDeloadReason(..., appliedReduction = 11,9 %)`
 *   2. usuário arrasta o slider até 40 % → só `reductionPct`/`suggestedWeight`
 *      mudam; `reason` fica congelado no texto do passo 1
 *   3. aplica → `buildDeloadPatches` copia `meta.reason` tal como veio
 */
import { describe, it, expect } from 'vitest'
import { buildDeloadPatches, getDeloadReason, type DeloadSetInput } from '../helpers/deloadHelpers'

const ANALYSIS = { status: 'stable', volumeDelta: 0.05, weightDelta: 0.04, itemsCount: 6, hasEnoughHistory: true } as const

const pctDoTexto = (reason: unknown): number => {
  const m = String(reason ?? '').match(/Redução de ([\d.,]+)%/)
  return m ? Number(m[1].replace(',', '.')) : NaN
}

describe('deload — o percentual do reason é a redução REAL gravada', () => {
  it('reproduz o caso da Cadeira extensora (01/10/2026)', () => {
    // 1. modal abre: base 88,5 (média do histórico) → sugestão 78 kg = 11,9 %
    const reasonDoAbrir = getDeloadReason(ANALYSIS as never, 1 - 78 / 88.5, 6)
    expect(pctDoTexto(reasonDoAbrir)).toBe(11.9)

    // 2. usuário leva o slider ao teto de 40 % → 53 kg (requestedPct 0,4011)
    const requested = 1 - 53 / 88.5

    // 3. aplica: a referência de CADA série é a última sessão (104 kg), não a média
    const sets: DeloadSetInput[] = [0, 1, 2].map((i) => ({
      key: `4-${i}`,
      log: { weight: '104', weightSource: 'auto' },
      plannedWeight: 104,
      suggestion: { weight: 104 },
      cfg: null,
    }))
    const plan = buildDeloadPatches({
      sets,
      ratio: 53 / 88.5,
      baseWeight: 88.5,
      appliedAt: '2026-10-01T10:09:58.993Z',
      meta: { reductionPct: requested, analysis: ANALYSIS as never, historyCount: 6 },
      knownWeights: [50, 57, 63, 70, 80, 104],
    })

    expect(plan.patches).toHaveLength(3)
    for (const { patch } of plan.patches) {
      const d = patch.deload as Record<string, number | string>
      const real = Math.round((1 - Number(d.suggestedWeight) / Number(d.originalWeight)) * 1000) / 10
      // a marca é coerente consigo mesma…
      expect(Math.round(Number(d.reductionPct) * 1000) / 10).toBe(real)
      // …e o texto precisa dizer o MESMO número. Hoje diz 11,9 e a redução é 39,4.
      expect(pctDoTexto(d.reason)).toBe(real)
    }
  })
})

// ─── Guard de CLASSE ─────────────────────────────────────────────────────────
// O texto "Redução de X%" só pode nascer em `getDeloadReason`, e quem aplica não
// pode passar texto pronto — senão ele congela no valor de quando o modal abriu.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const srcRoot = join(__dirname, '..', '..', '..')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === '__tests__' || f === 'node_modules' ? [] : walk(p)
    return /\.(ts|tsx)$/.test(f) ? [p] : []
  })
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('deload — o texto do reason não congela', () => {
  const arquivos = walk(srcRoot).map((p) => [p, semComentario(readFileSync(p, 'utf8'))] as const)

  it('"Redução de" só é escrito dentro de getDeloadReason', () => {
    const fora = arquivos.filter(([p, c]) => c.includes('Redução de') && !p.endsWith('helpers/deloadHelpers.ts'))
    expect(fora.map(([p]) => p)).toEqual([])
  })

  it('ninguém passa `reason` pronto no meta de buildDeloadPatches', () => {
    for (const [p, c] of arquivos) {
      let i = c.indexOf('buildDeloadPatches({')
      while (i >= 0) {
        const bloco = c.slice(i, i + 1500)
        const meta = bloco.slice(bloco.indexOf('meta:'), bloco.indexOf('meta:') + 300)
        expect(meta.includes('reason'), `${p}: meta com reason pronto`).toBe(false)
        i = c.indexOf('buildDeloadPatches({', i + 1)
      }
    }
  })

  it('o modal calcula o texto na hora, não lê um reason guardado', () => {
    const modals = arquivos.find(([p]) => p.endsWith('workout/Modals.tsx'))![1]
    expect(modals).toContain('getDeloadReason(')
    expect(modals).not.toContain('deloadModal?.reason')
  })
})
