/**
 * labExamUpload — upload de arquivos de exame laboratorial (bucket privado).
 *
 * Fluxo por arquivo:
 *   1. Pede signed upload URL ao backend (/api/lab-exams/signed-upload).
 *   2. Faz o PUT direto no Supabase Storage (sem passar pelo nosso server).
 *
 * Tudo client-side. Erros traduzidos pra português.
 */
import { createClient } from '@/utils/supabase/client'
import { LAB_EXAM_ALLOWED_MIMES, LAB_EXAM_MAX_FILE_BYTES } from '@/types/labExam'

const BUCKET = 'lab-exams'

export type LabUploadResponse = { ok: true; storagePath: string } | { ok: false; error: string }

/** Alinha mime à extensão quando o browser deixa file.type vazio (comum em HEIC). */
function resolveContentType(file: File): (typeof LAB_EXAM_ALLOWED_MIMES)[number] | null {
  const t = file.type as (typeof LAB_EXAM_ALLOWED_MIMES)[number]
  if (t && (LAB_EXAM_ALLOWED_MIMES as readonly string[]).includes(t)) return t
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const byExt: Record<string, (typeof LAB_EXAM_ALLOWED_MIMES)[number]> = {
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

/** Faz upload de um arquivo do exame. O backend valida ownership e registra a linha. */
export async function uploadLabExamFile(file: File, examId: string): Promise<LabUploadResponse> {
  if (!file) return { ok: false, error: 'Nenhum arquivo selecionado.' }
  if (file.size > LAB_EXAM_MAX_FILE_BYTES) {
    return { ok: false, error: 'Arquivo maior que 20 MB.' }
  }
  const contentType = resolveContentType(file)
  if (!contentType) {
    return { ok: false, error: 'Tipo não permitido. Aceito: PDF, JPG, PNG, WEBP, HEIC.' }
  }

  // 1. Signed upload URL
  let signed: { ok: boolean; path?: string; token?: string; storagePath?: string; error?: string }
  try {
    const res = await fetch('/api/lab-exams/signed-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examId, fileName: file.name, fileSize: file.size, mimeType: contentType }),
    })
    signed = await res.json().catch(() => ({ ok: false, error: 'invalid_response' }))
    if (!res.ok || !signed.ok) {
      return { ok: false, error: signed.error || 'Falha ao obter URL de upload.' }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede.' }
  }

  // 2. Upload direto pro Storage privado
  try {
    const supabase = createClient()
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(signed.path!, signed.token!, file, { contentType })
    if (uploadErr) return { ok: false, error: uploadErr.message || 'Falha no upload.' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro durante upload.' }
  }

  return { ok: true, storagePath: signed.storagePath || signed.path! }
}
