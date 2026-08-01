// Tipos da Avaliação Física por Foto (laudo IA via Gemini Vision).
//
// O laudo é o coração da feature: vai além de "% de gordura" e entrega
// análise por grupo muscular, postura, simetria L/R e proporções —
// depois correlacionada com o histórico de treino do mesmo user_id.

import { z } from 'zod'

// ─── Enums de domínio ────────────────────────────────────────────────────────

export const BODY_PHOTO_POSES = ['front', 'side', 'back'] as const
export type BodyPhotoPose = (typeof BODY_PHOTO_POSES)[number]

export const BODY_PHOTO_STATUSES = ['pending', 'uploading', 'analyzing', 'done', 'failed'] as const
export type BodyPhotoAssessmentStatus = (typeof BODY_PHOTO_STATUSES)[number]

export const POSE_LABELS_PT: Record<BodyPhotoPose, string> = {
    front: 'Frente',
    side: 'Perfil',
    back: 'Costas',
}

// ─── Limites (fonte única) ───────────────────────────────────────────────────
// Os MESMOS números alimentam três consumidores que precisam concordar:
//   1. os `.max()` dos schemas Zod abaixo (contrato de armazenamento);
//   2. o `responseSchema` mandado ao Gemini (structured output);
//   3. o normalizador que trunca a saída da IA antes de validar.
// Quando divergiam, o efeito era o 422 "Não consegui gerar a correlação".

export const LAUDO_LIMITS = {
    groupName: 60,
    groupNote: 400,
    recFocus: 80,
    recAction: 400,
    muscleGroups: 20,
    postureSummary: 600,
    postureFinding: 200,
    postureFindings: 12,
    symmetrySummary: 600,
    symmetryImbalance: 200,
    symmetryImbalances: 12,
    proportionsSummary: 600,
    shoulderToWaist: 120,
    strength: 200,
    strengths: 10,
    improvement: 200,
    improvements: 10,
    recommendations: 10,
    summary: 1200,
    somatotype: 60,
} as const

export const CORRELATION_LIMITS = {
    headline: 300,
    narrative: 2000,
    listItem: 240,
    listItems: 8,
    muscleGroup: 60,
    observation: 300,
    links: 15,
    focus: 80,
    action: 300,
    nextFocus: 6,
} as const

export const DEVELOPMENT_LEVELS = ['weak', 'moderate', 'good', 'excellent'] as const
export const RECOMMENDATION_PRIORITIES = ['high', 'medium', 'low'] as const
export const APPARENT_PHASES = ['bulking', 'cutting', 'recomp', 'maintenance', 'unknown'] as const
export const AI_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export const CORRELATION_TRENDS = ['supported', 'undertrained', 'overtrained', 'neutral'] as const

// ─── Zod schema do laudo IA ──────────────────────────────────────────────────
// Validado no servidor antes de gravar em body_photo_assessments.analysis.
// Tudo com defaults/nullable pra nunca quebrar quando a IA omite um campo.

export const MuscleGroupAssessmentSchema = z.object({
    /** Grupo muscular avaliado (ex.: "Peitoral", "Ombros", "Costas", "Quadríceps"). */
    group: z.string().min(1).max(LAUDO_LIMITS.groupName),
    /** Nível de desenvolvimento aparente. */
    development: z.enum(DEVELOPMENT_LEVELS),
    /** Observação curta sobre o grupo. */
    note: z.string().max(LAUDO_LIMITS.groupNote).default(''),
})
export type MuscleGroupAssessment = z.infer<typeof MuscleGroupAssessmentSchema>

export const BodyPhotoRecommendationSchema = z.object({
    /** Foco da recomendação (grupo/área). */
    focus: z.string().min(1).max(LAUDO_LIMITS.recFocus),
    /** Ação concreta sugerida. */
    action: z.string().min(1).max(LAUDO_LIMITS.recAction),
    priority: z.enum(RECOMMENDATION_PRIORITIES).default('medium'),
})
export type BodyPhotoRecommendation = z.infer<typeof BodyPhotoRecommendationSchema>

export const BodyPhotoLaudoSchema = z.object({
    /** Faixa de % de gordura (nunca número falso de precisão). */
    bodyFatRange: z.object({
        low: z.number().min(0).max(100),
        high: z.number().min(0).max(100),
    }),
    /** Somatotipo aparente (ecto/meso/endo ou misto). Texto livre, nullable. */
    somatotype: z.string().max(LAUDO_LIMITS.somatotype).nullable().default(null),
    /** Fase aparente do treino. */
    apparentPhase: z.enum(APPARENT_PHASES).default('unknown'),

    /** Scores 0–100 por categoria. */
    scores: z.object({
        composition: z.number().min(0).max(100),
        symmetry: z.number().min(0).max(100),
        posture: z.number().min(0).max(100),
        proportion: z.number().min(0).max(100),
    }),

    /** Avaliação por grupo muscular. */
    muscleGroups: z.array(MuscleGroupAssessmentSchema).max(LAUDO_LIMITS.muscleGroups).default([]),

    /** Análise postural. */
    posture: z.object({
        summary: z.string().max(LAUDO_LIMITS.postureSummary).default(''),
        findings: z.array(z.string().max(LAUDO_LIMITS.postureFinding)).max(LAUDO_LIMITS.postureFindings).default([]),
    }).default({ summary: '', findings: [] }),

    /** Simetria lado esquerdo vs direito. */
    symmetry: z.object({
        summary: z.string().max(LAUDO_LIMITS.symmetrySummary).default(''),
        imbalances: z.array(z.string().max(LAUDO_LIMITS.symmetryImbalance)).max(LAUDO_LIMITS.symmetryImbalances).default([]),
    }).default({ summary: '', imbalances: [] }),

    /** Proporções corporais (relação ombro/cintura, V-taper, etc.). */
    proportions: z.object({
        summary: z.string().max(LAUDO_LIMITS.proportionsSummary).default(''),
        shoulderToWaist: z.string().max(LAUDO_LIMITS.shoulderToWaist).nullable().default(null),
    }).default({ summary: '', shoulderToWaist: null }),

    strengths: z.array(z.string().max(LAUDO_LIMITS.strength)).max(LAUDO_LIMITS.strengths).default([]),
    improvements: z.array(z.string().max(LAUDO_LIMITS.improvement)).max(LAUDO_LIMITS.improvements).default([]),
    recommendations: z.array(BodyPhotoRecommendationSchema).max(LAUDO_LIMITS.recommendations).default([]),

    /** Resumo executivo (2–4 frases). */
    summary: z.string().max(LAUDO_LIMITS.summary).default(''),
    /** Confiança da análise — UI avisa o usuário se baixa. */
    confidence: z.enum(AI_CONFIDENCE_LEVELS).default('medium'),
})
export type BodyPhotoLaudo = z.infer<typeof BodyPhotoLaudoSchema>

// ─── Correlação treino × corpo (Sprint 3) ───────────────────────────────────
// O diferencial: cruza o laudo da foto com o volume REAL treinado na janela
// entre a avaliação anterior e a atual (ou últimos 90 dias).

export const BodyPhotoCorrelationSchema = z.object({
    /** Frase-resumo de impacto (ex.: "Seu peitoral evoluiu — alto volume em supino no período"). */
    headline: z.string().max(CORRELATION_LIMITS.headline).default(''),
    /** Narrativa correlacionando treino executado e físico observado. */
    narrative: z.string().max(CORRELATION_LIMITS.narrative).default(''),
    whatIsWorking: z.array(z.string().max(CORRELATION_LIMITS.listItem)).max(CORRELATION_LIMITS.listItems).default([]),
    whatIsMissing: z.array(z.string().max(CORRELATION_LIMITS.listItem)).max(CORRELATION_LIMITS.listItems).default([]),
    /** Ligações grupo muscular ↔ treino no período. */
    links: z.array(z.object({
        muscleGroup: z.string().max(CORRELATION_LIMITS.muscleGroup),
        observation: z.string().max(CORRELATION_LIMITS.observation),
        trend: z.enum(CORRELATION_TRENDS),
    })).max(CORRELATION_LIMITS.links).default([]),
    nextFocus: z.array(z.object({
        focus: z.string().max(CORRELATION_LIMITS.focus),
        action: z.string().max(CORRELATION_LIMITS.action),
    })).max(CORRELATION_LIMITS.nextFocus).default([]),
    confidence: z.enum(AI_CONFIDENCE_LEVELS).default('medium'),
})
export type BodyPhotoCorrelation = z.infer<typeof BodyPhotoCorrelationSchema>

export const CORRELATION_TREND_LABELS_PT: Record<
    BodyPhotoCorrelation['links'][number]['trend'],
    string
> = {
    supported: 'Sustentado pelo treino',
    undertrained: 'Pouco treinado',
    overtrained: 'Possível excesso',
    neutral: 'Neutro',
}

/** Estatísticas da janela de treino retornadas junto da correlação. */
export const TrainingWindowSummarySchema = z.object({
    fromIso: z.string(),
    toIso: z.string(),
    hasPreviousAssessment: z.boolean(),
    sessions: z.number(),
    totalVolumeKg: z.number(),
    totalSets: z.number(),
    topExercises: z.array(z.object({
        name: z.string(),
        volumeKg: z.number(),
        sets: z.number(),
    })).default([]),
})
export type TrainingWindowSummary = z.infer<typeof TrainingWindowSummarySchema>

/**
 * Correlação PERSISTIDA em `body_photo_assessments.correlation`.
 *
 * A correlação continua sendo recalculável de propósito — o resultado envelhece
 * conforme a pessoa treina. O que se guarda é a ÚLTIMA gerada, para o laudo
 * reabrir instantaneamente e sem gastar chamada de IA; `generatedAt` diz de
 * quando é, e a UI oferece atualizar.
 */
export const StoredCorrelationSchema = z.object({
    correlation: BodyPhotoCorrelationSchema,
    window: TrainingWindowSummarySchema,
    generatedAt: z.string(),
})
export type StoredCorrelation = z.infer<typeof StoredCorrelationSchema>

/** Lê a coluna `correlation` com tolerância: formato inesperado vira null, nunca exceção. */
export const parseStoredCorrelation = (raw: unknown): StoredCorrelation | null => {
    if (!raw) return null
    const parsed = StoredCorrelationSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
}

// ─── Entidades (linhas do banco) ─────────────────────────────────────────────

export interface BodyPhotoAssessment {
    id: string
    user_id: string
    trainer_id: string | null
    created_by: string
    assessment_date: string
    status: BodyPhotoAssessmentStatus
    composition_score: number | null
    symmetry_score: number | null
    posture_score: number | null
    proportion_score: number | null
    body_fat_estimate_low: number | null
    body_fat_estimate_high: number | null
    analysis: BodyPhotoLaudo | null
    /** Última correlação treino × laudo (coluna jsonb). Null até o usuário pedir a primeira. */
    correlation: StoredCorrelation | null
    ai_model: string | null
    ai_analyzed_at: string | null
    notes: string | null
    created_at: string
    updated_at: string
}

export interface BodyPhotoAssessmentPhoto {
    id: string
    assessment_id: string
    user_id: string
    pose: BodyPhotoPose
    storage_path: string
    width: number | null
    height: number | null
    file_size: number | null
    mime_type: string | null
    created_at: string
}

/** Avaliação + suas fotos (com signed URLs resolvidas) para a UI. */
export interface BodyPhotoAssessmentWithPhotos extends BodyPhotoAssessment {
    photos: Array<BodyPhotoAssessmentPhoto & { signedUrl?: string | null }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const isBodyPhotoPose = (v: unknown): v is BodyPhotoPose =>
    typeof v === 'string' && (BODY_PHOTO_POSES as readonly string[]).includes(v)

export const DEVELOPMENT_LABELS_PT: Record<MuscleGroupAssessment['development'], string> = {
    weak: 'Fraco',
    moderate: 'Moderado',
    good: 'Bom',
    excellent: 'Excelente',
}

export const PHASE_LABELS_PT: Record<BodyPhotoLaudo['apparentPhase'], string> = {
    bulking: 'Bulking (ganho)',
    cutting: 'Cutting (definição)',
    recomp: 'Recomposição',
    maintenance: 'Manutenção',
    unknown: 'Indefinida',
}
