/**
 * workoutImportUpload — sobe as páginas de uma ficha de treino (bucket privado).
 *
 * Fluxo por arquivo:
 *   1. Comprime, se for IMAGEM (PDF passa direto — comprimir PDF aqui não faz sentido).
 *   2. Pede signed upload URL ao backend (/api/workout-photo-import/signed-upload).
 *   3. PUT direto no Supabase Storage, sem passar pelo nosso servidor.
 *
 * Sobre a compressão: foto de celular chega com 4000px de largura e 6 MB. Isso
 * é caro para trafegar e para o Gemini ler, mas cortar demais apaga letra de
 * caneta — que é justamente o que precisa ser lido aqui. 2000px no maior lado
 * com JPEG 0.9 é o meio-termo: mantém traço fino legível e derruba o arquivo
 * para a casa de 1 MB. É mais conservador que a compressão da foto corporal
 * (1080px/0.85), onde o que importa é silhueta, não texto.
 */
import { createClient } from '@/utils/supabase/client'
import {
  WORKOUT_IMPORT_ALLOWED_MIMES,
  WORKOUT_IMPORT_MAX_FILE_BYTES,
  type WorkoutImportMime,
} from '@/types/workoutPhotoImport'

const BUCKET = 'workout-imports'

/** Lado maior da imagem após a compressão. Ver o porquê no cabeçalho. */
const MAX_EDGE = 2000
const JPEG_QUALITY = 0.9

export type WorkoutImportUploadResult = { ok: true; storagePath: string } | { ok: false; error: string }

/** Alinha o mime à extensão quando o browser deixa `file.type` vazio (comum em HEIC). */
export function resolveImportMime(file: File): WorkoutImportMime | null {
  const t = file.type as WorkoutImportMime
  if (t && (WORKOUT_IMPORT_ALLOWED_MIMES as readonly string[]).includes(t)) return t
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const byExt: Record<string, WorkoutImportMime> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  }
  return byExt[ext] ?? null
}

/**
 * Redimensiona a imagem preservando proporção. Devolve o arquivo original em
 * qualquer falha (canvas indisponível, HEIC que o browser não decodifica): subir
 * a foto grande é melhor que não subir nada.
 */
export async function compressFichaImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (typeof document === 'undefined') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale >= 1 && file.size <= 2 * 1024 * 1024) {
      bitmap.close?.()
      return file // já é pequena o bastante; recomprimir só perderia nitidez
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) return file
    // Se a "compressão" engordou o arquivo (acontece com PNG de print), fica o original.
    if (blob.size >= file.size) return file

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'ficha'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/** Sobe um arquivo da ficha. O backend valida ownership e registra a linha. */
export async function uploadWorkoutImportFile(
  file: File,
  importId: string,
): Promise<WorkoutImportUploadResult> {
  if (!file) return { ok: false, error: 'Nenhum arquivo selecionado.' }

  const prepared = await compressFichaImage(file)
  if (prepared.size > WORKOUT_IMPORT_MAX_FILE_BYTES) {
    return { ok: false, error: 'Arquivo maior que 15 MB.' }
  }
  const contentType = resolveImportMime(prepared)
  if (!contentType) {
    return { ok: false, error: 'Tipo não aceito. Use PDF, JPG, PNG, WEBP ou HEIC.' }
  }

  let signed: { ok: boolean; path?: string; token?: string; storagePath?: string; error?: string }
  try {
    const res = await fetch('/api/workout-photo-import/signed-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        importId,
        fileName: prepared.name,
        fileSize: prepared.size,
        mimeType: contentType,
      }),
    })
    signed = await res.json().catch(() => ({ ok: false, error: 'invalid_response' }))
    if (!res.ok || !signed.ok) {
      return { ok: false, error: signed.error === 'too_many_files' ? 'Limite de páginas atingido.' : signed.error || 'Falha ao preparar o envio.' }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede.' }
  }

  try {
    const supabase = createClient()
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(signed.path!, signed.token!, prepared, { contentType })
    if (uploadErr) return { ok: false, error: uploadErr.message || 'Falha no envio.' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro durante o envio.' }
  }

  return { ok: true, storagePath: signed.storagePath || signed.path! }
}
