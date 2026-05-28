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

// ─── Zod schema do laudo IA ──────────────────────────────────────────────────
// Validado no servidor antes de gravar em body_photo_assessments.analysis.
// Tudo com defaults/nullable pra nunca quebrar quando a IA omite um campo.

export const MuscleGroupAssessmentSchema = z.object({
    /** Grupo muscular avaliado (ex.: "Peitoral", "Ombros", "Costas", "Quadríceps"). */
    group: z.string().min(1).max(60),
    /** Nível de desenvolvimento aparente. */
    development: z.enum(['weak', 'moderate', 'good', 'excellent']),
    /** Observação curta sobre o grupo. */
    note: z.string().max(400).default(''),
})
export type MuscleGroupAssessment = z.infer<typeof MuscleGroupAssessmentSchema>

export const BodyPhotoRecommendationSchema = z.object({
    /** Foco da recomendação (grupo/área). */
    focus: z.string().min(1).max(80),
    /** Ação concreta sugerida. */
    action: z.string().min(1).max(400),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
})
export type BodyPhotoRecommendation = z.infer<typeof BodyPhotoRecommendationSchema>

export const BodyPhotoLaudoSchema = z.object({
    /** Faixa de % de gordura (nunca número falso de precisão). */
    bodyFatRange: z.object({
        low: z.number().min(0).max(100),
        high: z.number().min(0).max(100),
    }),
    /** Somatotipo aparente (ecto/meso/endo ou misto). Texto livre, nullable. */
    somatotype: z.string().max(60).nullable().default(null),
    /** Fase aparente do treino. */
    apparentPhase: z.enum(['bulking', 'cutting', 'recomp', 'maintenance', 'unknown']).default('unknown'),

    /** Scores 0–100 por categoria. */
    scores: z.object({
        composition: z.number().min(0).max(100),
        symmetry: z.number().min(0).max(100),
        posture: z.number().min(0).max(100),
        proportion: z.number().min(0).max(100),
    }),

    /** Avaliação por grupo muscular. */
    muscleGroups: z.array(MuscleGroupAssessmentSchema).max(20).default([]),

    /** Análise postural. */
    posture: z.object({
        summary: z.string().max(600).default(''),
        findings: z.array(z.string().max(200)).max(12).default([]),
    }).default({ summary: '', findings: [] }),

    /** Simetria lado esquerdo vs direito. */
    symmetry: z.object({
        summary: z.string().max(600).default(''),
        imbalances: z.array(z.string().max(200)).max(12).default([]),
    }).default({ summary: '', imbalances: [] }),

    /** Proporções corporais (relação ombro/cintura, V-taper, etc.). */
    proportions: z.object({
        summary: z.string().max(600).default(''),
        shoulderToWaist: z.string().max(120).nullable().default(null),
    }).default({ summary: '', shoulderToWaist: null }),

    strengths: z.array(z.string().max(200)).max(10).default([]),
    improvements: z.array(z.string().max(200)).max(10).default([]),
    recommendations: z.array(BodyPhotoRecommendationSchema).max(10).default([]),

    /** Resumo executivo (2–4 frases). */
    summary: z.string().max(1200).default(''),
    /** Confiança da análise — UI avisa o usuário se baixa. */
    confidence: z.enum(['high', 'medium', 'low']).default('medium'),
})
export type BodyPhotoLaudo = z.infer<typeof BodyPhotoLaudoSchema>

// ─── Correlação treino × corpo (Sprint 3) ───────────────────────────────────
// O diferencial: cruza o laudo da foto com o volume REAL treinado na janela
// entre a avaliação anterior e a atual (ou últimos 90 dias).

export const BodyPhotoCorrelationSchema = z.object({
    /** Frase-resumo de impacto (ex.: "Seu peitoral evoluiu — alto volume em supino no período"). */
    headline: z.string().max(300).default(''),
    /** Narrativa correlacionando treino executado e físico observado. */
    narrative: z.string().max(2000).default(''),
    whatIsWorking: z.array(z.string().max(240)).max(8).default([]),
    whatIsMissing: z.array(z.string().max(240)).max(8).default([]),
    /** Ligações grupo muscular ↔ treino no período. */
    links: z.array(z.object({
        muscleGroup: z.string().max(60),
        observation: z.string().max(300),
        trend: z.enum(['supported', 'undertrained', 'overtrained', 'neutral']),
    })).max(15).default([]),
    nextFocus: z.array(z.object({
        focus: z.string().max(80),
        action: z.string().max(300),
    })).max(6).default([]),
    confidence: z.enum(['high', 'medium', 'low']).default('medium'),
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
export interface TrainingWindowSummary {
    fromIso: string
    toIso: string
    hasPreviousAssessment: boolean
    sessions: number
    totalVolumeKg: number
    totalSets: number
    topExercises: Array<{ name: string; volumeKg: number; sets: number }>
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
