/**
 * Tipos da feature de Exames Laboratoriais.
 *
 * Espelha as tabelas public.lab_exams e public.lab_exam_files.
 * Os payloads de IA (marcadores extraídos, protocolo) vivem em src/schemas/labExam.ts.
 */
import type { LabExamExtracted, LabProtocol } from '@/schemas/labExam'

export const LAB_EXAM_STATUSES = [
  'pending', // criado, sem arquivos ainda
  'uploading', // arquivos sendo enviados
  'extracting', // IA lendo o documento
  'analyzing', // IA gerando o protocolo
  'done', // protocolo pronto
  'failed', // erro em alguma etapa
] as const
export type LabExamStatus = (typeof LAB_EXAM_STATUSES)[number]

/** Linha de public.lab_exams. */
export interface LabExam {
  id: string
  user_id: string
  /** Personal que criou (fluxo mediado). null em autoavaliação. */
  trainer_id: string | null
  created_by: string
  exam_date: string | null
  lab_name: string | null
  status: LabExamStatus
  /** Marcadores extraídos pela IA (Zod-validados antes de gravar). */
  extracted_markers: LabExamExtracted | null
  /** Protocolo integrado gerado pela IA. */
  protocol: LabProtocol | null
  ai_model: string | null
  ai_analyzed_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

/** Linha de public.lab_exam_files. */
export interface LabExamFile {
  id: string
  exam_id: string
  user_id: string
  storage_path: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  created_at: string
  /** URL assinada resolvida no servidor pra exibição na UI (não persistida). */
  signedUrl?: string | null
}

/** Limites de upload (espelham o validador client + backend). */
export const LAB_EXAM_MAX_FILES = 5
export const LAB_EXAM_MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB por arquivo
export const LAB_EXAM_ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export type { LabExamExtracted, LabProtocol } from '@/schemas/labExam'
