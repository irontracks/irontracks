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

const MedicalAlertSchema = z.object({
  marker: z.string().min(1).max(120),
  value: z.string().max(60),
  severity: z.enum(['urgent', 'moderate', 'watch']),
  /** Ação recomendada, ex.: "Procure um endocrinologista". */
  action: z.string().max(400),
})

const TrainingAdjustmentSchema = z.object({
  /** Área do treino, ex.: "Volume semanal", "Intensidade", "Recuperação". */
  area: z.string().min(1).max(80),
  recommendation: z.string().max(500),
  /** Por que — ligado a um marcador específico. */
  reason: z.string().max(400),
  priority: z.enum(PRIORITY),
})

const NutritionAdjustmentSchema = z.object({
  /** Nutriente/eixo, ex.: "Proteína", "Gorduras saturadas", "Fibras". */
  nutrient: z.string().min(1).max(80),
  recommendation: z.string().max(500),
  reason: z.string().max(400),
  priority: z.enum(PRIORITY),
})

const SupplementSchema = z.object({
  /** Nome, ex.: "Vitamina D3 (colecalciferol)". */
  name: z.string().min(1).max(120),
  /** Dose sugerida, ex.: "5.000 UI". */
  dose: z.string().max(80),
  /** Quando tomar, ex.: "com refeição contendo gordura". */
  timing: z.string().max(120),
  /** Por que — ligado a um marcador, ex.: "Vit. D = 18 ng/mL (ref. >30)". */
  reason: z.string().max(400),
  /** Duração sugerida antes de reavaliar, ex.: "3 meses e reexaminar". */
  duration: z.string().max(120),
  priority: z.enum(PRIORITY),
  /** Disponível sem prescrição médica no Brasil. */
  otcAvailable: z.boolean(),
})

export const LabProtocolSchema = z.object({
  /** Manchete de impacto, ex.: "Testosterona baixa + cortisol alto explicam sua fadiga". */
  headline: z.string().min(1).max(200),
  /** Avaliação geral em 2–4 frases. */
  overallAssessment: z.string().max(1500),

  /** Alertas que pedem atenção médica. Vazio quando nada relevante. */
  medicalAlerts: z.array(MedicalAlertSchema).max(20),

  trainingProtocol: z.object({
    summary: z.string().max(800),
    adjustments: z.array(TrainingAdjustmentSchema).max(15),
  }),

  nutritionProtocol: z.object({
    summary: z.string().max(800),
    adjustments: z.array(NutritionAdjustmentSchema).max(15),
    foodSuggestions: z.array(z.string().max(120)).max(30),
  }),

  /** Suplementação detalhada (doses, horário, duração). */
  supplementation: z.array(SupplementSchema).max(20),

  followUp: z.object({
    /** Quando reexaminar, ex.: "3 meses". */
    retestIn: z.string().max(80),
    markersToWatch: z.array(z.string().max(120)).max(30),
    notes: z.string().max(800),
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
