/**
 * Tipos da feature "importar treino por foto/PDF".
 *
 * Espelha public.workout_photo_imports e public.workout_photo_import_files.
 * O payload extraído pela IA vive em src/schemas/workoutPhotoImport.ts.
 */
import type { WorkoutPhotoExtracted } from '@/schemas/workoutPhotoImport'

export const WORKOUT_IMPORT_STATUSES = [
  'pending', // criado, sem arquivos ainda
  'uploading', // arquivos sendo enviados
  'extracting', // IA lendo a ficha
  'extracted', // rascunho pronto para revisão
  'failed', // erro em alguma etapa
] as const
export type WorkoutImportStatus = (typeof WORKOUT_IMPORT_STATUSES)[number]

/**
 * Tipos aceitos. Mesma lista do exame laboratorial menos os que não fazem
 * sentido aqui — a ficha chega como foto de celular (JPEG/HEIC), print (PNG)
 * ou PDF do personal.
 */
export const WORKOUT_IMPORT_ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const
export type WorkoutImportMime = (typeof WORKOUT_IMPORT_ALLOWED_MIMES)[number]

/**
 * 15 MB por arquivo. Foto de celular sem compressão passa de 5 MB; o cliente
 * ainda comprime imagens antes de subir, então isto é teto de segurança, não o
 * tamanho esperado. PDF de ficha raramente passa de 2 MB.
 */
export const WORKOUT_IMPORT_MAX_FILE_BYTES = 15 * 1024 * 1024

/**
 * Teto de páginas por importação. Uma ficha semanal completa cabe em 3-4 fotos;
 * acima disso o custo da chamada de visão cresce sem o resultado melhorar.
 */
export const WORKOUT_IMPORT_MAX_FILES = 6

/** Linha de public.workout_photo_imports. */
export interface WorkoutPhotoImport {
  id: string
  user_id: string
  status: WorkoutImportStatus
  extracted_workouts: WorkoutPhotoExtracted | null
  ai_model: string | null
  ai_extracted_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

/** Linha de public.workout_photo_import_files. */
export interface WorkoutPhotoImportFile {
  id: string
  import_id: string
  user_id: string
  storage_path: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  /** Carimbado quando o arquivo sai do bucket, após a extração. */
  purged_at: string | null
  created_at: string
}
