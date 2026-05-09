/**
 * biaAttachmentUpload — upload do PDF/foto da bioimpedância.
 *
 * Fluxo:
 *   1. Pede uma signed upload URL ao backend (path = `{uid}/bia/{ts}_{nome}`).
 *   2. Faz o PUT direto no Supabase Storage (sem passar pelo nosso server).
 *   3. Retorna a URL pública pra persistir em `assessments.bia_attachment_url`.
 *
 * Tudo client-side. Responde com erros traduzidos pra português.
 */

import { createClient } from '@/utils/supabase/client'

export const ALLOWED_BIA_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

export const BIA_FILE_LIMIT_BYTES = 15 * 1024 * 1024 // 15 MB
export const BIA_FILE_LIMIT_LABEL = '15 MB'

export interface BiaUploadResult {
  ok: true
  publicUrl: string
  path: string
}

export interface BiaUploadFailure {
  ok: false
  error: string
}

export type BiaUploadResponse = BiaUploadResult | BiaUploadFailure

/**
 * Sanitiza nome de arquivo: remove caracteres exóticos, trunca em 80
 * chars (sem extensão), lower-case espaços → '-'.
 */
function safeFileName(rawName: string): string {
  const lastDot = rawName.lastIndexOf('.')
  const base = lastDot > 0 ? rawName.slice(0, lastDot) : rawName
  const ext = lastDot > 0 ? rawName.slice(lastDot + 1).toLowerCase() : 'bin'
  const cleaned = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'arquivo'
  return `${cleaned}.${ext.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'bin'}`
}

/**
 * Determina extensão e mime alinhados. Browsers às vezes deixam mime
 * vazio para HEIC; nesse caso inferimos pela extensão para passar no
 * gate do servidor.
 */
function resolveContentType(file: File): string {
  if (file.type && ALLOWED_BIA_MIME.includes(file.type)) return file.type
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic') return 'image/heic'
  if (ext === 'heif') return 'image/heif'
  return file.type || 'application/octet-stream'
}

/**
 * Faz upload do arquivo. `userId` é usado como prefixo do path porque o
 * endpoint valida ownership do path antes de assinar.
 */
export async function uploadBiaAttachment(
  file: File,
  userId: string,
): Promise<BiaUploadResponse> {
  if (!file) return { ok: false, error: 'Nenhum arquivo selecionado.' }
  if (file.size > BIA_FILE_LIMIT_BYTES) {
    return { ok: false, error: `Arquivo maior que ${BIA_FILE_LIMIT_LABEL}.` }
  }
  const contentType = resolveContentType(file)
  if (!ALLOWED_BIA_MIME.includes(contentType)) {
    return { ok: false, error: 'Tipo não permitido. Aceito: PDF, JPG, PNG, WEBP, HEIC.' }
  }
  if (!userId) return { ok: false, error: 'Usuário não autenticado.' }

  const ts = Date.now()
  const fileName = `${ts}_${safeFileName(file.name)}`
  const path = `${userId}/bia/${fileName}`

  // 1. Signed upload URL
  let signed: { ok: boolean; bucket?: string; path?: string; token?: string; publicUrl?: string; error?: string }
  try {
    const res = await fetch('/api/assessment/bia-attachment/signed-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, contentType }),
    })
    signed = await res.json().catch(() => ({ ok: false, error: 'invalid_response' }))
    if (!res.ok || !signed.ok) {
      return { ok: false, error: signed.error || 'Falha ao obter URL de upload.' }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede.' }
  }

  // 2. Upload direto pro Storage
  try {
    const supabase = createClient()
    const { error: uploadErr } = await supabase
      .storage
      .from(signed.bucket || 'bioimpedance-files')
      .uploadToSignedUrl(signed.path!, signed.token!, file, { contentType })
    if (uploadErr) {
      return { ok: false, error: uploadErr.message || 'Falha no upload.' }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro durante upload.' }
  }

  return {
    ok: true,
    path: signed.path!,
    publicUrl: signed.publicUrl || '',
  }
}
