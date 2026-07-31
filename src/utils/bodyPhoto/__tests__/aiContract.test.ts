import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
    CORRELATION_RESPONSE_SCHEMA,
    LAUDO_RESPONSE_SCHEMA,
    bodyPhotoGenerationConfig,
    normalizeCorrelation,
    normalizeLaudo,
} from '@/utils/bodyPhoto/aiContract'
import {
    BodyPhotoCorrelationSchema,
    BodyPhotoLaudoSchema,
    CORRELATION_LIMITS,
    LAUDO_LIMITS,
} from '@/types/bodyPhotoAssessment'

/**
 * Guards da Avaliação por Foto (laudo + correlação).
 *
 * Bug real (jul/2026): o botão "Correlação com treino" respondia "Não consegui
 * gerar a correlação. Tente novamente.". Medição com o prompt de produção contra
 * o gemini-2.5-flash: 8 de 12 chamadas reprovavam no `safeParse`. Duas causas:
 *   1. JSON quebrado → coberto em utils/ai/__tests__/extractJson.test.ts;
 *   2. strings acima do `.max()` do Zod (real: `action` com 343 num teto de 300)
 *      → o laudo inteiro era descartado por causa de 43 caracteres.
 *
 * A regra virou "normalize, depois valide": truncar o texto (que é para humano
 * ler) em vez de rejeitar a resposta inteira.
 */
describe('normalizeCorrelation — trunca em vez de reprovar', () => {
    const base = {
        headline: 'Seu peitoral evoluiu',
        narrative: 'Volume alto em supino no período.',
        whatIsWorking: ['Supino consistente'],
        whatIsMissing: ['Pouca cadeia posterior'],
        links: [{ muscleGroup: 'Peitoral', observation: 'Supino reto com 24.800 kg', trend: 'supported' }],
        nextFocus: [{ focus: 'Posterior de coxa', action: 'Adicionar stiff 3x8' }],
        confidence: 'high',
    }

    it('estouro de tamanho passa a caber (caso real: action com 343 chars)', () => {
        const raw = {
            ...base,
            nextFocus: [{ focus: 'Cadeia posterior', action: 'a'.repeat(343) }],
        }
        // Sem normalização, o schema estrito REPROVA — é exatamente o 422 do usuário.
        expect(BodyPhotoCorrelationSchema.safeParse(raw).success).toBe(false)

        const parsed = BodyPhotoCorrelationSchema.safeParse(normalizeCorrelation(raw))
        expect(parsed.success).toBe(true)
        expect(parsed.data!.nextFocus[0].action.length).toBeLessThanOrEqual(CORRELATION_LIMITS.action)
        expect(parsed.data!.nextFocus[0].focus).toBe('Cadeia posterior')
    })

    it('trend/confidence fora do enum viram valor seguro em vez de erro', () => {
        const raw = {
            ...base,
            links: [{ muscleGroup: 'Dorsais', observation: 'Puxada frontal', trend: 'under-trained' }],
            confidence: 'muito alta',
        }
        expect(BodyPhotoCorrelationSchema.safeParse(raw).success).toBe(false)

        const parsed = BodyPhotoCorrelationSchema.safeParse(normalizeCorrelation(raw))
        expect(parsed.success).toBe(true)
        expect(parsed.data!.links[0].trend).toBe('neutral')
        expect(parsed.data!.confidence).toBe('medium')
    })

    it('corta listas acima do máximo e descarta itens vazios', () => {
        const raw = {
            ...base,
            whatIsWorking: [...Array(20).keys()].map((i) => `item ${i}`),
            links: [{ muscleGroup: '', observation: 'sem grupo', trend: 'supported' }, ...base.links],
        }
        const parsed = BodyPhotoCorrelationSchema.safeParse(normalizeCorrelation(raw))
        expect(parsed.success).toBe(true)
        expect(parsed.data!.whatIsWorking.length).toBe(CORRELATION_LIMITS.listItems)
        expect(parsed.data!.links.length).toBe(1)
    })

    it('devolve null quando a resposta não tem substância nenhuma', () => {
        expect(normalizeCorrelation(null)).toBeNull()
        expect(normalizeCorrelation('texto')).toBeNull()
        expect(normalizeCorrelation({ headline: '', narrative: '', links: [], nextFocus: [] })).toBeNull()
    })
})

describe('normalizeLaudo — trunca em vez de reprovar', () => {
    const base = {
        bodyFatRange: { low: 16, high: 19 },
        somatotype: 'Mesomorfo',
        apparentPhase: 'recomp',
        scores: { composition: 78, symmetry: 82, posture: 64, proportion: 80 },
        muscleGroups: [{ group: 'Peitoral', development: 'good', note: 'Boa espessura' }],
        posture: { summary: 'Tilt pélvico anterior', findings: ['Hiperlordose leve'] },
        symmetry: { summary: 'Boa simetria', imbalances: [] },
        proportions: { summary: 'V-taper presente', shoulderToWaist: '1.55' },
        strengths: ['Ombros'], improvements: ['Posterior'],
        recommendations: [{ focus: 'Cadeia posterior', action: 'Stiff 3x8', priority: 'high' }],
        summary: 'Boa base anterior.',
        confidence: 'medium',
    }

    it('recommendation gigante e enum inválido não derrubam o laudo', () => {
        const raw = {
            ...base,
            recommendations: [{ focus: 'f'.repeat(200), action: 'a'.repeat(900), priority: 'urgente' }],
            muscleGroups: [{ group: 'Peitoral', development: 'otimo', note: 'n'.repeat(900) }],
            apparentPhase: 'definindo',
        }
        expect(BodyPhotoLaudoSchema.safeParse(raw).success).toBe(false)

        const parsed = BodyPhotoLaudoSchema.safeParse(normalizeLaudo(raw))
        expect(parsed.success).toBe(true)
        expect(parsed.data!.recommendations[0].action.length).toBeLessThanOrEqual(LAUDO_LIMITS.recAction)
        expect(parsed.data!.recommendations[0].priority).toBe('medium')
        expect(parsed.data!.muscleGroups[0].development).toBe('moderate')
        expect(parsed.data!.apparentPhase).toBe('unknown')
    })

    it('scores fora de 0–100 e strings numéricas são coagidos', () => {
        const parsed = BodyPhotoLaudoSchema.safeParse(normalizeLaudo({
            ...base,
            scores: { composition: 140, symmetry: '82', posture: -5, proportion: 80.6 },
            bodyFatRange: { low: '19', high: '16' },
        }))
        expect(parsed.success).toBe(true)
        expect(parsed.data!.scores.composition).toBe(100)
        expect(parsed.data!.scores.symmetry).toBe(82)
        expect(parsed.data!.scores.posture).toBe(0)
        // low/high invertidos pelo modelo são reordenados
        expect(parsed.data!.bodyFatRange).toEqual({ low: 16, high: 19 })
    })

    it('devolve null sem scores ou sem faixa de gordura (laudo não exibível)', () => {
        expect(normalizeLaudo({ ...base, scores: undefined })).toBeNull()
        expect(normalizeLaudo({ ...base, bodyFatRange: { low: 'x', high: 'y' } })).toBeNull()
        expect(normalizeLaudo(null)).toBeNull()
    })
})

/**
 * Source-guard: structured output é a camada que derruba o JSON inválido a zero
 * (medido: 0/5 falhas com responseSchema contra ~1/3 sem ele). Se alguém remover
 * o `responseSchema`/`responseMimeType` da chamada, o bug volta em silêncio —
 * este teste trava isso.
 */
describe('rotas da Avaliação por Foto usam structured output', () => {
    const rotas = [
        'src/app/api/ai/body-composition-correlation/route.ts',
        'src/app/api/ai/body-composition-photo/route.ts',
    ]

    it('config de geração pede JSON e carrega o schema', () => {
        const cfg = bodyPhotoGenerationConfig(CORRELATION_RESPONSE_SCHEMA, 4096) as Record<string, unknown>
        expect(cfg.responseMimeType).toBe('application/json')
        expect(cfg.responseSchema).toBe(CORRELATION_RESPONSE_SCHEMA)
        expect(cfg.maxOutputTokens).toBe(4096)
    })

    it.each(rotas)('%s passa generationConfig, normaliza e tenta de novo', (rota) => {
        const src = readFileSync(rota, 'utf8')
        expect(src).toContain('bodyPhotoGenerationConfig(')
        expect(src).toMatch(/normalize(Correlation|Laudo)\(extractJsonFromModelText\(/)
        expect(src).toContain('MAX_MODEL_ATTEMPTS')
        // A cópia local de extractJson foi removida — a fonte única é utils/ai/extractJson.
        expect(src).not.toContain('function extractJson(')
    })

    it('o modal traduz código de IA em vez de exibi-lo cru', () => {
        // Bug real (31/07/2026): a tela mostrou literalmente "ai_error" ao usuário
        // quando a cota diária do Gemini estourou.
        const src = readFileSync('src/components/body-photo/BodyPhotoCaptureModal.tsx', 'utf8')
        expect(src).toContain('translateAiError')
        expect(src).not.toMatch(/new Error\(res\.message \|\| res\.error/)
    })

    it('os responseSchema espelham os limites do Zod', () => {
        const links = CORRELATION_RESPONSE_SCHEMA.properties.links
        expect(links.maxItems).toBe(CORRELATION_LIMITS.links)
        expect(links.items.properties.observation.maxLength).toBe(CORRELATION_LIMITS.observation)
        expect(CORRELATION_RESPONSE_SCHEMA.properties.narrative.maxLength).toBe(CORRELATION_LIMITS.narrative)
        expect(LAUDO_RESPONSE_SCHEMA.properties.summary.maxLength).toBe(LAUDO_LIMITS.summary)
        expect(LAUDO_RESPONSE_SCHEMA.properties.muscleGroups.maxItems).toBe(LAUDO_LIMITS.muscleGroups)
    })
})
