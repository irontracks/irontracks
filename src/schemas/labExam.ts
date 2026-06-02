/**
 * Schemas Zod da feature de Exames Laboratoriais.
 *
 * Dois estágios de IA:
 *  1) EXTRAÇÃO (Gemini Flash): lê o PDF/foto do exame → marcadores estruturados.
 *  2) PROTOCOLO (Gemini Pro): cruza marcadores + avaliação + treino → plano.
 *
 * Validados no servidor antes de gravar no banco (colunas JSONB).
 *
 * AVISO: nada aqui é conselho médico. O protocolo SEMPRE carrega um disclaimer
 * fixo e é informativo. Decisões clínicas são do médico do usuário.
 */
import { z } from 'zod'

// ─── Estágio 1: extração de marcadores ──────────────────────────────────────

export const LAB_MARKER_STATUSES = ['normal', 'low', 'high', 'critical_low', 'critical_high'] as const
export type LabMarkerStatus = (typeof LAB_MARKER_STATUSES)[number]

/** Categorias usadas pra agrupar os marcadores na UI. */
export const LAB_MARKER_CATEGORIES = [
  'Hemograma',
  'Lipídios',
  'Glicemia',
  'Hormônios',
  'Tireoide',
  'Vitaminas e Minerais',
  'Função Renal',
  'Função Hepática',
  'Inflamatórios',
  'Eletrólitos',
  'Outros',
] as const
export type LabMarkerCategory = (typeof LAB_MARKER_CATEGORIES)[number]

export const LabMarkerSchema = z.object({
  /** Nome do marcador, ex.: "Testosterona Total", "Vitamina D (25-OH)". */
  name: z.string().min(1).max(120),
  /** Valor numérico medido. null quando não foi possível ler com confiança. */
  value: z.number().nullable(),
  /** Unidade do resultado, ex.: "ng/dL", "mg/dL". */
  unit: z.string().max(40).nullable(),
  /** Limites de referência do laboratório (quando impressos no exame). */
  refMin: z.number().nullable(),
  refMax: z.number().nullable(),
  /** Posição do valor frente à referência. */
  status: z.enum(LAB_MARKER_STATUSES),
  /** Categoria pra agrupamento. */
  category: z.enum(LAB_MARKER_CATEGORIES),
})
export type LabMarker = z.infer<typeof LabMarkerSchema>

export const LabExamExtractedSchema = z.object({
  /** Tipos de exame detectados no documento, ex.: ["Hemograma", "Perfil lipídico"]. */
  examTypes: z.array(z.string().max(80)).max(40),
  /** Marcadores extraídos. Limite alto pra cobrir painéis completos. */
  markers: z.array(LabMarkerSchema).max(200),
  /** Data do exame (ISO yyyy-mm-dd) quando legível. */
  examDate: z.string().max(40).nullable(),
  /** Nome do laboratório quando legível. */
  labName: z.string().max(120).nullable(),
  /** Observações livres do laudo (ex.: notas do patologista). */
  notes: z.string().max(2000).nullable(),
  /** Confiança da extração. */
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
})
export type LabExamExtracted = z.infer<typeof LabExamExtractedSchema>

// ─── Estágio 2: protocolo integrado ─────────────────────────────────────────

export const PRIORITY = ['high', 'medium', 'low'] as const
export type Priority = (typeof PRIORITY)[number]

// Limites generosos — o Gemini Pro gera respostas longas pra exames completos.
// O objetivo do schema é garantir ESTRUTURA correta, não limitar conteúdo.
const str = z.string()

const MedicalAlertSchema = z.object({
  marker: str.min(1),
  value: str,
  severity: z.enum(['urgent', 'moderate', 'watch']),
  action: str,
})

const TrainingAdjustmentSchema = z.object({
  area: str.min(1),
  recommendation: str,
  reason: str,
  priority: z.enum(PRIORITY),
})

const NutritionAdjustmentSchema = z.object({
  nutrient: str.min(1),
  recommendation: str,
  reason: str,
  priority: z.enum(PRIORITY),
})

const SupplementSchema = z.object({
  name: str.min(1),
  dose: str,
  timing: str,
  reason: str,
  duration: str,
  priority: z.enum(PRIORITY),
  otcAvailable: z.boolean(),
})

export const LabProtocolSchema = z.object({
  headline: str.min(1),
  overallAssessment: str,

  medicalAlerts: z.array(MedicalAlertSchema).max(30),

  trainingProtocol: z.object({
    summary: str,
    adjustments: z.array(TrainingAdjustmentSchema).max(20),
  }),

  nutritionProtocol: z.object({
    summary: str,
    adjustments: z.array(NutritionAdjustmentSchema).max(20),
    foodSuggestions: z.array(str).max(40),
  }),

  supplementation: z.array(SupplementSchema).max(30),

  followUp: z.object({
    retestIn: str,
    markersToWatch: z.array(str).max(40),
    notes: str,
  }),

  confidence: z.enum(['high', 'medium', 'low']),
})
export type LabProtocol = z.infer<typeof LabProtocolSchema>

export type MedicalAlert = z.infer<typeof MedicalAlertSchema>
export type TrainingAdjustment = z.infer<typeof TrainingAdjustmentSchema>
export type NutritionAdjustment = z.infer<typeof NutritionAdjustmentSchema>
export type Supplement = z.infer<typeof SupplementSchema>

/**
 * Disclaimer fixo exibido em toda superfície do protocolo. Não vem da IA —
 * é texto controlado por nós pra garantir que nunca falte.
 */
export const LAB_PROTOCOL_DISCLAIMER =
  'Esta análise é gerada por inteligência artificial e tem caráter exclusivamente ' +
  'informativo e educativo. NÃO é diagnóstico, prescrição ou substituto de avaliação ' +
  'médica. Antes de iniciar, ajustar ou interromper qualquer suplemento, medicamento, ' +
  'treino ou dieta, consulte um médico ou profissional de saúde habilitado.'
