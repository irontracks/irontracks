/**
 * Guard de CLASSE: os históricos do app desenham no mesmo molde.
 *
 * O pedido do dono (25/08/2026) foi "o histórico de refeições com o mesmo
 * padrão do de treinos". A forma barata de atender seria copiar o JSX do card
 * de treino para dentro da nutrição — e é exatamente assim que este repo já
 * produziu 86 tons de cinza fora da paleta, três cálculos de semana e cinco
 * somas de dobras cutâneas. Duas cópias nunca divergem no dia em que nascem;
 * divergem no dia em que alguém ajusta UMA.
 *
 * Então o molde tem dono: `HistorySummaryShell` (o card de resumo) e
 * `HistoryWeekDivider` (o separador de semana). Superfície nova que redesenhe
 * qualquer um dos dois reprova aqui.
 *
 * Provado por mutação em 25/08/2026 — os quatro casos ficam VERMELHOS quando
 * o chassi é reimplementado inline, quando o divisor é redesenhado, quando um
 * segundo `featured` entra no mesmo card e quando o início da semana volta a
 * ser calculado à mão.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
const SHELL = 'src/components/history/HistorySummaryShell.tsx'
const DIVISOR = 'src/components/history/HistoryWeekDivider.tsx'

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** Fora de comentário: um guard que casa com a prosa que o explica acusa a si mesmo. */
const semComentario = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const arquivos = walk(SRC).map((f) => ({ rel: f.replace(SRC, 'src'), code: semComentario(readFileSync(f, 'utf8')) }))

describe('guard: o card de resumo dos históricos tem um molde só', () => {
  /** A assinatura do chassi: o véu dourado que dá a ele a cara que tem. */
  const ASSINATURA = /from-yellow-500\/10\s+via-yellow-600\/5/

  it('ninguém redesenha o chassi por conta', () => {
    const infratores = arquivos.filter((a) => a.rel !== SHELL && ASSINATURA.test(a.code)).map((a) => a.rel)
    expect(
      infratores,
      'use <HistorySummaryShell> — dois cards com o mesmo desenho divergem no primeiro ajuste',
    ).toEqual([])
  })

  it('os dois históricos consomem o chassi', () => {
    for (const rel of ['src/components/history/HistorySummaryCard.tsx', 'src/components/dashboard/nutrition/NutritionHistoryModal.tsx']) {
      const code = arquivos.find((a) => a.rel === rel)?.code ?? ''
      expect(code, `${rel} precisa desenhar o resumo pelo molde comum`).toMatch(/<HistorySummaryShell/)
    }
  })

  /**
   * `docs/DESIGN_HIERARCHY.md`: cada bloco tem UM destaque, e ele é o número
   * acionável. Dois blocos dourados no mesmo card é a hierarquia dizendo
   * "olhe para os dois", que é o mesmo que não dizer nada.
   */
  it('cada card tem no máximo um destaque', () => {
    for (const a of arquivos) {
      const quantos = (a.code.match(/featured:\s*true/g) || []).length
      expect(quantos, `${a.rel} declara ${quantos} destaques no mesmo resumo`).toBeLessThanOrEqual(1)
    }
  })
})

describe('guard: o separador de semana tem um molde só', () => {
  it('quem escreve "Semana de" usa o componente único', () => {
    const infratores = arquivos
      // Mira no rótulo de DATA (`Semana de ${…}` / `Semana de 16/08`), não na
      // palavra: "Semana de deload" e "Semana de teste" são outra coisa.
      .filter((a) => a.rel !== DIVISOR && /Semana de (\$\{|\d)/.test(a.code))
      .map((a) => a.rel)
    expect(
      infratores,
      'use <HistoryWeekDivider> — o rótulo e a fronteira da semana andam juntos',
    ).toEqual([])
  })

  it('os dois históricos separam os blocos pela mesma régua', () => {
    for (const rel of ['src/components/HistoryList.tsx', 'src/components/dashboard/nutrition/NutritionHistoryModal.tsx']) {
      const code = arquivos.find((a) => a.rel === rel)?.code ?? ''
      expect(code, `${rel} precisa usar o separador comum`).toMatch(/<HistoryWeekDivider/)
    }
  })

  /**
   * A fronteira sai de `utils/cron/weekRangeBrt` (domingo→sábado, BRT). O
   * histórico de treino a calculava à mão, a partir da SEGUNDA, e escapava do
   * guard `semanaComecaNoDomingo` porque passava por uma variável intermediária
   * (`dayOfWeek`) em vez de chamar `getDay()` na mesma expressão — guard de
   * forma erra quando a forma muda. Quem treinava domingo lia o treino sob o
   * cabeçalho da semana anterior, enquanto o push "Resumo da semana" já o
   * contava na semana corrente.
   */
  it('o divisor deriva a semana da fonte única, não de aritmética própria', () => {
    const code = arquivos.find((a) => a.rel === DIVISOR)?.code ?? ''
    expect(code).toMatch(/from '@\/utils\/cron\/weekRangeBrt'/)
    expect(code, 'nada de andar até o domingo com setDate/getDay').not.toMatch(/setDate\(|getDay\(\)/)
  })
})
