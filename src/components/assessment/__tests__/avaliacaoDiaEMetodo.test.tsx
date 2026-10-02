import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/utils/storage/biaAttachmentUpload', () => ({ getBiaSignedUrl: async () => null }))

import { AssessmentListItem } from '@/components/assessment/AssessmentListItem'
import { AssessmentSummaryCards } from '@/components/assessment/AssessmentSummaryCards'
import { buildAssessmentChartData, formatDateCompact } from '@/components/assessment/assessmentChartData'
import { getBodyFatPercent, getBmrKcal, getLeanMassKg, getWeightKg, type AssessmentRow } from '@/components/assessment/assessmentUtils'
import { assessmentDayKey, compareAssessmentsByDay, daysBetweenDayKeys } from '@/utils/assessment/assessmentDay'
import { assessmentMethod, previousSameMethod } from '@/utils/assessment/assessmentMethod'

/**
 * Aba AVALIAÇÕES, conta oficial do dono, 02/10/2026 — dois defeitos, cada um
 * uma CLASSE.
 *
 * 1. **Dia um antes.** A avaliação de 02/10 aparecia "01/10/2026 quinta-feira".
 *    A tela preferia `date` (timestamptz) a `assessment_date` (o dia escolhido),
 *    e `date` está gravado como meia-noite UTC = 21h do dia anterior em
 *    Brasília. Em outras linhas `date` é o `now()` da inserção, dias depois.
 *
 * 2. **Dobras × bioimpedância.** A avaliação por 7 dobras (5,83% / 87,57 kg)
 *    era comparada com a BIA de 11/09 (17,4% / 77,6 kg): "% gordura −11,6" e
 *    "massa magra +10,0 kg em 21 dias". A diferença é o MÉTODO, não o corpo.
 *
 * As linhas abaixo são as do banco (valores reais, ids trocados).
 */

const OUT_02: AssessmentRow = {
    id: 'out-02', assessment_date: '2026-10-02', date: '2026-10-02T00:00:00+00:00',
    created_at: '2026-10-02T12:04:25Z', assessment_type: 'full',
    body_fat_percentage: 5.83, lean_mass: 87.57, weight: 93, bmr: 2010,
}
const SET_11_BIA: AssessmentRow = {
    id: 'set-11', assessment_date: '2026-09-11', date: '2026-09-11T08:55:00+00:00',
    created_at: '2026-09-11T10:24:25Z', assessment_type: 'bia',
    body_fat_percentage: 17.4, lean_mass: 77.6, weight: 93.9, bia_body_fat_percentage: 17.4,
}
const JUN_05: AssessmentRow = {
    id: 'jun-05', assessment_date: '2026-06-05', date: '2026-06-05T00:00:00+00:00',
    created_at: '2026-06-05T16:25:30Z', assessment_type: 'full',
    body_fat_percentage: 7.07, lean_mass: 90.88, weight: 97.8, bmr: 2075,
}
// `date` é o instante da gravação, um dia DEPOIS do dia da avaliação — o caso
// que reprova em qualquer fuso (UTC e Brasília leem 17/03 no timestamp).
const MAR_16: AssessmentRow = {
    id: 'mar-16', assessment_date: '2026-03-16', date: '2026-03-17T09:46:33Z',
    created_at: '2026-03-17T09:46:33Z', assessment_type: 'full',
    body_fat_percentage: 8.69, lean_mass: 88.43, weight: 96.85,
}
const MAR_17: AssessmentRow = {
    id: 'mar-17', assessment_date: '2026-03-17', date: '2026-03-17T00:00:00+00:00',
    created_at: '2026-10-02T12:04:25Z', assessment_type: 'full',
    body_fat_percentage: 8.85, lean_mass: 88.27, weight: 96.85,
}

afterEach(cleanup)

const itemProps = {
    idx: 0, isSelected: false, aiPlanState: undefined, workoutSessionsLoading: false,
    tdee: undefined, deletingId: null, confirmDeleteId: null,
    onToggleDetails: () => {}, onEdit: () => {}, onDelete: () => {},
    onConfirmDelete: () => {}, onOpenPlanModal: () => {}, setPlanAnchorRef: () => {},
}

describe('o dia da avaliação é assessment_date, nunca o fuso de um timestamp', () => {
    it('dia só ("YYYY-MM-DD") é formatado como o próprio dia', () => {
        expect(formatDateCompact('2026-10-02')).toBe('02/10/2026')
        expect(formatDateCompact('2026-06-05')).toBe('05/06/2026')
    })

    it('o card da lista mostra o dia escolhido, não o de `date`', () => {
        render(<AssessmentListItem {...itemProps} assessment={OUT_02} />)
        expect(screen.getByText('02/10/2026')).toBeTruthy()
        expect(screen.getByText('sexta-feira')).toBeTruthy()
        cleanup()

        render(<AssessmentListItem {...itemProps} assessment={MAR_16} />)
        expect(screen.getByText('16/03/2026')).toBeTruthy()
        expect(screen.queryByText('17/03/2026')).toBeNull()
    })

    it('o eixo dos gráficos usa o mesmo dia', () => {
        const { trunkMeasurements, weightLeanMass } = buildAssessmentChartData([MAR_16, JUN_05, OUT_02])
        for (const labels of [trunkMeasurements.labels, weightLeanMass.labels]) {
            expect(labels[0]).toMatch(/^16/)
            expect(labels[1]).toMatch(/^05/)
            expect(labels[2]).toMatch(/^02/)
        }
    })

    it('a ordem é pelo dia, com a gravação desempatando', () => {
        // Por `date`, a de 16/03 (gravada 17/03 09:46) ficava DEPOIS da de 17/03.
        const sorted = [MAR_17, OUT_02, MAR_16, JUN_05].sort(compareAssessmentsByDay)
        expect(sorted.map((a) => a.id)).toEqual(['mar-16', 'mar-17', 'jun-05', 'out-02'])
    })

    it('mesmo dia: quem foi gravado antes vem antes', () => {
        // Caso real: duas linhas de 19/12/2025, gravadas em 24/12/2025 e em 02/10/2026.
        const antiga = { id: 'dez-a', assessment_date: '2025-12-19', created_at: '2025-12-24T17:50:37Z', date: '2025-12-24T17:50:37Z' }
        const nova = { id: 'dez-b', assessment_date: '2025-12-19', created_at: '2026-10-02T12:04:25Z', date: '2025-12-19T00:00:00+00:00' }
        expect([nova, antiga].sort(compareAssessmentsByDay).map((a) => a.id)).toEqual(['dez-a', 'dez-b'])
        expect([antiga, nova].sort(compareAssessmentsByDay).map((a) => a.id)).toEqual(['dez-a', 'dez-b'])
    })

    it('intervalo em dias conta dias do calendário', () => {
        expect(daysBetweenDayKeys('2026-10-02', '2026-09-11')).toBe(21)
        expect(daysBetweenDayKeys('2026-10-02', '2026-06-05')).toBe(119)
    })

    it('sem assessment_date, o fallback é o dia de BRASÍLIA do timestamp', () => {
        expect(assessmentDayKey({ date: '2026-10-02T01:30:00Z' })).toBe('2026-10-01')
        expect(assessmentDayKey({ assessment_date: '2026-10-02', date: '2026-10-03T12:00:00Z' })).toBe('2026-10-02')
    })
})

describe('dobras e bioimpedância nunca se comparam', () => {
    const historico = [MAR_16, JUN_05, SET_11_BIA, OUT_02]

    it('a base de comparação é a anterior do MESMO método', () => {
        expect(assessmentMethod(SET_11_BIA)).toBe('bia')
        expect(assessmentMethod(OUT_02)).toBe('dobras')
        expect(previousSameMethod(historico, 3)?.id).toBe('jun-05')
        // A primeira BIA não tem com quem comparar.
        expect(previousSameMethod(historico, 2)).toBeNull()
    })

    it('completa com BIA e dobras é "misto" — a média das duas não é nenhuma delas', () => {
        expect(assessmentMethod({ assessment_type: 'full', bia_body_fat_percentage: 15, body_fat_percentage_skinfold: 8 })).toBe('misto')
        expect(assessmentMethod({ assessment_type: 'full', bia_body_fat_percentage: 15 })).toBe('bia')
    })

    it('o card da lista recusa uma base de outro método', () => {
        render(<AssessmentListItem {...itemProps} assessment={OUT_02} previousAssessment={SET_11_BIA} />)
        const texto = document.body.textContent ?? ''
        expect(texto).not.toMatch(/\+10\.0/)
        expect(texto).not.toMatch(/11\.6/)
    })

    it('o card da lista compara com a anterior do mesmo método e diz qual é', () => {
        render(<AssessmentListItem {...itemProps} assessment={OUT_02} previousAssessment={JUN_05} />)
        const texto = document.body.textContent ?? ''
        expect(texto).toMatch(/−1\.2%/)          // 5,83 − 7,07
        expect(texto).toMatch(/119 dias/)
        expect(texto).toMatch(/dobras/)
    })

    it('os cartões do topo recusam uma base de outro método', () => {
        render(
            <AssessmentSummaryCards
                latestAssessment={OUT_02}
                previousAssessment={SET_11_BIA}
                getWeightKg={getWeightKg}
                getBodyFatPercent={getBodyFatPercent}
                getLeanMassKg={getLeanMassKg}
                getBmrKcal={getBmrKcal}
            />,
        )
        const texto = document.body.textContent ?? ''
        expect(texto).not.toMatch(/11\.6/)
        expect(texto).not.toMatch(/\+10\.0/)
    })

    it('os cartões do topo comparam com a anterior do mesmo método', () => {
        render(
            <AssessmentSummaryCards
                latestAssessment={OUT_02}
                previousAssessment={JUN_05}
                getWeightKg={getWeightKg}
                getBodyFatPercent={getBodyFatPercent}
                getLeanMassKg={getLeanMassKg}
                getBmrKcal={getBmrKcal}
            />,
        )
        const texto = document.body.textContent ?? ''
        expect(texto).toMatch(/−1\.2 %/)
        expect(texto).toMatch(/−3\.3 kg/)       // 87,57 − 90,88
        expect(texto).toMatch(/05\/06\/2026/)   // diz contra QUEM compara
    })

    it('nenhuma curva de composição mistura os dois métodos', () => {
        const { bodyFatPercent, weightLeanMass } = buildAssessmentChartData(historico)
        const composicao = [
            ...bodyFatPercent.datasets,
            ...weightLeanMass.datasets.filter((d) => !/^Peso/.test(d.label)),
        ]
        for (const ds of composicao) {
            const temBia = ds.data[2] != null
            const temDobras = ds.data[0] != null || ds.data[1] != null || ds.data[3] != null
            expect(temBia && temDobras, `"${ds.label}" mistura dobras e BIA`).toBe(false)
        }
        // E a BIA continua no gráfico — separar não é esconder.
        expect(bodyFatPercent.datasets.some((d) => d.data[2] === 17.4)).toBe(true)
    })

    it('o peso segue numa curva só: balança não tem método', () => {
        const { weightLeanMass } = buildAssessmentChartData(historico)
        const peso = weightLeanMass.datasets.filter((d) => /^Peso/.test(d.label))
        expect(peso).toHaveLength(1)
        expect(peso[0].data).toEqual([96.85, 97.8, 93.9, 93])
    })
})

// ── Fiação e classe ──────────────────────────────────────────────────────────

const SRC = join(__dirname, '..', '..', '..')
const executavel = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

function arquivos(dir: string): string[] {
    const out: string[] = []
    for (const nome of readdirSync(dir)) {
        const p = join(dir, nome)
        if (statSync(p).isDirectory()) {
            if (nome === '__tests__' || nome === 'node_modules') continue
            out.push(...arquivos(p))
        } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) && !nome.endsWith('supabase.ts')) {
            out.push(p)
        }
    }
    return out
}

describe('a classe, varrida em src/', () => {
    const todos = arquivos(SRC).map((p) => ({ rel: relative(SRC, p), codigo: executavel(readFileSync(p, 'utf8')) }))

    it('ninguém prefere o timestamp `date` ao dia `assessment_date`', () => {
        const culpados = todos
            .filter(({ codigo }) => /\bdate\s*(\|\||\?\?)\s*[\w?.]*assessment_date\b/.test(codigo))
            .map(({ rel }) => rel)
        expect(culpados, 'use assessmentDayKey(row) — `date` é instante, não dia').toEqual([])
    })

    it('o "hoje" de uma avaliação nova é o dia de Brasília, não o dia UTC', () => {
        // Depois das 21h, `toISOString()` já é amanhã: a avaliação nascia datada
        // no dia seguinte.
        const culpados = todos
            .filter(({ codigo }) => /assessment_?[dD]ate[^\n;]*new Date\(\)\.toISOString\(\)/.test(codigo))
            .map(({ rel }) => rel)
        expect(culpados, 'use brtDateKey()').toEqual([])
    })

    it('a lista escolhe a base pelo método; o hook ordena pelo dia', () => {
        const historico = executavel(readFileSync(join(SRC, 'components/assessment/AssessmentHistory.tsx'), 'utf8'))
        expect(historico).toContain('previousSameMethod(sortedAssessments')
        expect(historico).not.toMatch(/sortedAssessments\[idx - 1\]/)

        const hook = executavel(readFileSync(join(SRC, 'hooks/useAssessmentHistoryData.ts'), 'utf8'))
        // A CHAMADA, não o nome: o nome sobrevive na linha do import com a
        // ordenação por `date` de volta (medido por mutação).
        expect(hook).toMatch(/\.sort\(compareAssessmentsByDay\)/)
        expect(hook).toMatch(/previousSameMethod\(sortedAssessments/)
    })
})
