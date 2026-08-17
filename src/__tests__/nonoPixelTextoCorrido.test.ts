/**
 * Teto do 9px em texto CORRIDO — o piso não pode virar alvo.
 *
 * O guard de `corpoMinimoTexto` impede descer abaixo de 9px. Ele não impede o
 * 9px de virar o corpo padrão do app por gravidade, que é o que estava
 * acontecendo: a auditoria de 12/08/2026 contou 47 usos em texto corrido e a
 * medição de hoje achou 54 em 23 arquivos.
 *
 * Nove pixels lê bem em EYEBROW LABEL — maiúscula, peso alto, tracking largo,
 * duas ou três palavras. Em texto corrido, no aparelho, entre séries, com a
 * tela a 30% de brilho, é outra coisa. Por isso o guard separa os dois: label
 * é livre, corrido tem teto POR ARQUIVO, e o teto só desce.
 *
 * Não subimos os 54 de uma vez de propósito: mexer no corpo muda a altura da
 * linha e o layout de 23 telas, e isso não se entrega sem olhar cada uma.
 * Congelar primeiro, corrigir com os olhos depois.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Usos de 9px em texto corrido por arquivo. SÓ DESCE. */
const TETO_POR_ARQUIVO: Record<string, number> = {
  'src/app/(app)/community/CommunityClient.tsx': 1,
  'src/app/para-professores/page.tsx': 6,
  'src/components/HistoryListPeriodReportModal.tsx': 1,
  'src/components/VipHub.tsx': 1,
  'src/components/WorkoutReport.tsx': 1,
  'src/components/admin-panel/TeacherManualTab.tsx': 8,
  'src/components/assessment/ResultsPreview.tsx': 1,
  'src/components/dashboard/DashboardTabs.tsx': 4,
  'src/components/dashboard/ExpressWorkoutModal.tsx': 1,
  'src/components/dashboard/IronRankCard.tsx': 6,
  'src/components/dashboard/PRPrediction.tsx': 1,
  'src/components/dashboard/nutrition/MyDietPlan.tsx': 1,
  'src/components/dashboard/nutrition/NutritionDayScore.tsx': 1,
  'src/components/dashboard/nutrition/PhaseSelector.tsx': 2,
  'src/components/lab-exams/LabExamProtocolView.tsx': 1,
  'src/components/workout-report/ReportAiSection.tsx': 1,
  'src/components/workout-report/ReportExerciseCard.tsx': 3,
  'src/components/workout-report/ReportTimePanel.tsx': 6,
  'src/components/workout/AIExerciseSwap.tsx': 1,
  'src/components/workout/ExerciseList.tsx': 1,
  'src/components/workout/SessionDeloadBanner.tsx': 1,
  'src/components/workout/set-renderers/normalSet.tsx': 4,
}

const RAIZES = ['src/components', 'src/app']

/** Eyebrow label: maiúscula + peso/tracking. Nessa forma 9px é escolha, não descuido. */
const ehLabel = (classe: string): boolean =>
  classe.includes('uppercase') &&
  (classe.includes('font-black') || classe.includes('font-bold') || classe.includes('tracking'))

const contarCorridos = (src: string): number => {
  let n = 0
  for (const m of src.matchAll(/text-\[9px\]/g)) {
    const ini = src.lastIndexOf('"', m.index ?? 0)
    const fim = src.indexOf('"', (m.index ?? 0) + m[0].length)
    const classe = ini > 0 && fim > 0 ? src.slice(ini, fim) : ''
    if (!ehLabel(classe)) n++
  }
  return n
}

const arquivos = RAIZES.flatMap((raiz) =>
  readdirSync(raiz, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))
    .map((f) => `${raiz}/${f}`),
)

describe('9px em texto corrido — teto que só desce', () => {
  it('nenhum arquivo passa do seu teto', () => {
    const estouros: string[] = []
    for (const rel of arquivos) {
      const atual = contarCorridos(readFileSync(rel, 'utf8'))
      const teto = TETO_POR_ARQUIVO[rel] ?? 0
      if (atual > teto) estouros.push(`${rel}: ${atual} > ${teto}`)
    }
    expect(
      estouros,
      '9px em texto corrido aumentou. Em corpo de texto use 10-11px; 9px é para ' +
        'EYEBROW LABEL (maiúscula, peso alto, tracking largo). Se o caso for mesmo ' +
        'label, escreva-o como label e o guard para de contar.',
    ).toEqual([])
  })

  it('o teto acompanha a correção — entrada que já baixou tem que baixar na lista', () => {
    const folgados: string[] = []
    for (const [rel, teto] of Object.entries(TETO_POR_ARQUIVO)) {
      let atual = 0
      try { atual = contarCorridos(readFileSync(rel, 'utf8')) } catch { atual = 0 }
      if (atual < teto) folgados.push(`${rel}: ${atual} < ${teto} — baixe o teto`)
    }
    expect(folgados, 'teto que não acompanha a correção deixa o débito voltar sem ninguém ver').toEqual([])
  })

  it('o classificador separa label de corrido', () => {
    expect(contarCorridos('<p className="text-[9px] uppercase font-black tracking-widest">META</p>')).toBe(0)
    expect(contarCorridos('<p className="text-[9px] text-neutral-400">frase inteira de ajuda</p>')).toBe(1)
  })
})
