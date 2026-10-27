import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/utils/storage/biaAttachmentUpload', () => ({ getBiaSignedUrl: async () => null }))
const logWarnRemote = vi.fn()
vi.mock('@/lib/logger', async (orig) => ({ ...(await orig<typeof import('@/lib/logger')>()), logWarnRemote: (...a: unknown[]) => logWarnRemote(...a) }))

import type { SupabaseClient } from '@supabase/supabase-js'
import { AssessmentListItem } from '@/components/assessment/AssessmentListItem'
import { AssessmentSummaryCards } from '@/components/assessment/AssessmentSummaryCards'
import { dexaDetailItems } from '@/components/assessment/AssessmentDexaDetails'
import { buildAssessmentChartData } from '@/components/assessment/assessmentChartData'
import { getBodyFatPercent, getBmrKcal, getLeanMassKg, getWeightKg, type AssessmentRow } from '@/components/assessment/assessmentUtils'
import {
    assessmentMethod, previousSameMethod, normalizeAssessmentType, isExternalReport,
    ASSESSMENT_METHOD_LABEL,
} from '@/utils/assessment/assessmentMethod'
import { findPairCandidate, tryAutoPair } from '@/utils/calculations/assessmentPairing'
import { buildUserContextBlock } from '@/utils/ai/userContext'
import { pickBodyFatReference } from '@/utils/bodyPhoto/bodyFatCrossCheck'
import { buildDossierHtml } from '@/utils/report/buildDossierHtml'
import { montarDossier } from '@/lib/dossier/buildDossier'

/**
 * DEXA em `assessments` (laudo CEMED, Lunar Prodigy Primo, 06/10/2026).
 *
 * Sem tratamento explícito o 'dexa' caía em 'full' (dobras) em seis arquivos: o
 * 17,0% do laudo entrava na curva das dobras (5,83%) e o card dizia "% gordura
 * +11,2 em 4 dias". As linhas abaixo são as do banco/laudo (ids trocados).
 */

const DEXA: AssessmentRow = {
    id: 'dexa-06', assessment_date: '2026-10-06', date: '2026-10-06T17:52:00+00:00',
    created_at: '2026-10-09T13:00:00Z', assessment_type: 'dexa',
    weight: 94, height: 172, age: 40, gender: 'M',
    body_fat_percentage: 17, lean_mass: 78.735, fat_mass: 16.163, bmi: 31.77,
    dexa_asmi: 12.8, dexa_fmi: 5.4, dexa_appendicular_lean_kg: 38.003,
    dexa_bone_mass_kg: 3.279, dexa_bone_density: 1.381,
    dexa_android_fat_pct: 20.6, dexa_gynoid_fat_pct: 18.2,
    dexa_arms_fat_pct: 10.7, dexa_legs_fat_pct: 17.1, dexa_trunk_fat_pct: 19.9,
    dexa_device: 'Lunar Prodigy Primo (CEMED)',
}
const DOBRAS_02: AssessmentRow = {
    id: 'out-02', assessment_date: '2026-10-02', date: '2026-10-02T00:00:00+00:00',
    created_at: '2026-10-02T12:04:25Z', assessment_type: 'full',
    body_fat_percentage: 5.83, body_fat_percentage_skinfold: 5.83, lean_mass: 87.57, weight: 93, bmr: 2010,
    chest_circ: 100, waist_circ: 87,
}
const BIA_11: AssessmentRow = {
    id: 'set-11', assessment_date: '2026-09-11', date: '2026-09-11T08:55:00+00:00',
    created_at: '2026-09-11T10:24:25Z', assessment_type: 'bia',
    body_fat_percentage: 17.4, lean_mass: 77.6, weight: 93.9, bia_body_fat_percentage: 17.4,
}

beforeEach(() => logWarnRemote.mockClear())
afterEach(cleanup)

const itemProps = {
    idx: 0, isSelected: false, aiPlanState: undefined, workoutSessionsLoading: false,
    tdee: undefined, deletingId: null, confirmDeleteId: null,
    onToggleDetails: () => {}, onEdit: () => {}, onDelete: () => {},
    onConfirmDelete: () => {}, onOpenPlanModal: () => {}, setPlanAnchorRef: () => {},
}

describe('o tipo "dexa" é um método próprio', () => {
    it('o tipo manda: DEXA nunca é dobras, BIA nem misto', () => {
        expect(assessmentMethod(DEXA)).toBe('dexa')
        // Mesmo com sobras de leitura de BIA/dobras na linha (o banco trava isso,
        // mas o código não pode depender da trava).
        expect(assessmentMethod({ ...DEXA, bia_body_fat_percentage: 17.4, body_fat_percentage_skinfold: 5.8 })).toBe('dexa')
        expect(ASSESSMENT_METHOD_LABEL.dexa).toBe('DEXA')
    })

    it('a anterior do mesmo método ignora dobras e BIA', () => {
        const sorted = [BIA_11, DOBRAS_02, DEXA]
        expect(previousSameMethod(sorted, 2)).toBeNull()
        // E o DEXA não vira base de comparação de quem não é DEXA.
        expect(previousSameMethod([DEXA, { ...DOBRAS_02, assessment_date: '2026-11-02' }], 1)).toBeNull()
        // Dois DEXAs se comparam entre si.
        const proximo = { ...DEXA, id: 'dexa-novo', assessment_date: '2027-01-06' }
        expect(previousSameMethod([DEXA, proximo], 1)?.id).toBe('dexa-06')
    })

    it('tipo desconhecido cai em full MAS avisa (código atrás do banco)', () => {
        expect(normalizeAssessmentType('ressonancia')).toBe('full')
        expect(normalizeAssessmentType('ressonancia')).toBe('full')
        expect(logWarnRemote).toHaveBeenCalledTimes(1) // uma vez por valor, não por linha
        expect(normalizeAssessmentType(undefined)).toBe('full')
        expect(normalizeAssessmentType(null)).toBe('full')
        expect(logWarnRemote).toHaveBeenCalledTimes(1) // ausente é o default do banco, não é sinal
    })

    it('laudo externo = BIA e DEXA', () => {
        expect(isExternalReport('dexa')).toBe(true)
        expect(isExternalReport('bia')).toBe(true)
        expect(isExternalReport('full')).toBe(false)
    })
})

describe('gráficos e cartões', () => {
    it('o DEXA tem curva própria; a das dobras fica com buraco nele', () => {
        const sorted = [BIA_11, DOBRAS_02, DEXA]
        const { bodyFatPercent } = buildAssessmentChartData(sorted)
        const gordura = bodyFatPercent.datasets.filter((d) => String(d.label).startsWith('% Gordura'))
        expect(gordura.map((d) => d.label)).toEqual(
            expect.arrayContaining(['% Gordura · bioimpedância', '% Gordura · dobras', '% Gordura · DEXA']),
        )
        const dexa = gordura.find((d) => d.label === '% Gordura · DEXA')!
        const dobras = gordura.find((d) => d.label === '% Gordura · dobras')!
        expect(dexa.data).toEqual([null, null, 17])
        expect(dobras.data[2]).toBeNull()
        // Traço próprio: BIA e DEXA não podem ser o mesmo pontilhado.
        const bia = gordura.find((d) => d.label === '% Gordura · bioimpedância') as { borderDash?: number[] }
        expect((dexa as { borderDash?: number[] }).borderDash).not.toEqual(bia.borderDash)
    })

    it('as barras de circunferência não gastam lugar com o DEXA (não tem circunferência)', () => {
        const { trunkMeasurements } = buildAssessmentChartData([DOBRAS_02, DEXA])
        expect(trunkMeasurements.labels).toHaveLength(1)
    })

    it('os cartões do topo recusam base de outro método e dizem por quê', () => {
        render(
            <AssessmentSummaryCards
                latestAssessment={DEXA}
                previousAssessment={DOBRAS_02}
                getWeightKg={getWeightKg} getBodyFatPercent={getBodyFatPercent}
                getLeanMassKg={getLeanMassKg} getBmrKcal={getBmrKcal}
            />,
        )
        expect(screen.getByText(/Sem avaliação anterior por DEXA/)).toBeTruthy()
        expect(screen.queryByText(/mesmo método/)).toBeNull()
    })
})

describe('o card da lista', () => {
    it('mostra a tag DEXA e não oferece Editar, PDF nem Plano IA', () => {
        render(<AssessmentListItem {...itemProps} assessment={DEXA} previousAssessment={null} />)
        expect(screen.getByText('DEXA')).toBeTruthy()
        expect(screen.queryByLabelText('Editar avaliação')).toBeNull() // o form grava uma linha 'full' NOVA
        expect(screen.queryByText('Plano IA')).toBeNull()
        expect(screen.getByLabelText('Excluir avaliação')).toBeTruthy() // excluir segue
    })

    it('uma avaliação por dobras segue com as três ações', () => {
        render(<AssessmentListItem {...itemProps} assessment={DOBRAS_02} previousAssessment={null} />)
        expect(screen.getByLabelText('Editar avaliação')).toBeTruthy()
        expect(screen.getByText('Plano IA')).toBeTruthy()
        expect(screen.queryByText('DEXA')).toBeNull()
    })

    it('nunca compara o DEXA com a avaliação por dobras de 4 dias antes', () => {
        render(<AssessmentListItem {...itemProps} assessment={DEXA} previousAssessment={DOBRAS_02} />)
        expect(screen.queryByText(/Desde a anterior/)).toBeNull()
    })

    it('aberto, mostra o laudo na unidade do laudo, sem dobras nem circunferências', () => {
        render(<AssessmentListItem {...itemProps} isSelected assessment={DEXA} previousAssessment={null} />)
        expect(screen.getByTestId('dexa-details')).toBeTruthy()
        expect(screen.getByText('12,8 kg/m²')).toBeTruthy() // ASMI
        expect(screen.getByText('1,381 g/cm²')).toBeTruthy()
        expect(screen.queryByText('Dobras Cutâneas (mm)')).toBeNull()
        expect(screen.queryByText('Métodos de % Gordura')).toBeNull()
    })

    it('a relação andróide/ginóide é derivada e bate com o laudo (1,13)', () => {
        const { composicao } = dexaDetailItems(DEXA)
        expect(composicao.find((i) => i.rotulo === 'Andróide / ginóide')?.valor).toBe('1,13')
    })
})

describe('DEXA nunca pareia', () => {
    const supabaseQueNaoPodeSerTocado = {
        from: () => { throw new Error('pareamento consultou o banco para um DEXA') },
    } as unknown as SupabaseClient

    it('findPairCandidate e tryAutoPair devolvem null sem consultar nada', async () => {
        const source = { id: 'dexa-06', student_id: 'u1', assessment_type: 'dexa' as const, assessment_date: '2026-10-06' }
        await expect(findPairCandidate(supabaseQueNaoPodeSerTocado, source)).resolves.toBeNull()
        await expect(tryAutoPair(supabaseQueNaoPodeSerTocado, source)).resolves.toBeNull()
    })
})

describe('quem lê o último %gordura rotula o método', () => {
    const supabaseComLinha = (row: Record<string, unknown>) => {
        const chain: Record<string, unknown> = {
            select: () => chain, eq: () => chain, gte: () => chain, order: () => chain, limit: () => chain, or: () => chain,
            maybeSingle: async () => ({ data: row, error: null }),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [row], error: null, count: null }).then(resolve),
            catch: () => chain,
        }
        return { from: () => chain } as unknown as SupabaseClient
    }

    it('o contexto das IAs diz que o 17% é DEXA', async () => {
        const bloco = await buildUserContextBlock(supabaseComLinha(DEXA), 'u1', ['assessment'])
        expect(bloco).toContain('BF 17% (DEXA)')
    })

    it('a referência da foto chama o DEXA de DEXA, não de "avaliação"', () => {
        const ref = pickBodyFatReference(
            [{ assessment_date: '2026-10-06', assessment_type: 'dexa', body_fat_percentage: 17, body_fat_percentage_skinfold: null, bia_body_fat_percentage: null }],
            '2026-10-07',
        )
        expect(ref?.source).toBe('dexa')
        expect(ref?.percent).toBe(17)
    })

    it('o dossiê escreve o método no cartão de gordura', () => {
        const input = montarDossier(
            {
                periodo: { tipo: 'week', inicio: '2026-10-05', fim: '2026-10-11' }, aluno: 'Teste', geradoEm: '2026-10-09T13:00:00Z',
                treino: null, nutricao: null, nutricaoDias: [], metaKcal: null,
            } as never,
            { exames: [], avaliacoes: [DEXA], fotos: [] },
        )
        const html = buildDossierHtml(input)
        expect(html).toContain('Gordura (DEXA)')
    })
})
