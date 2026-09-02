/**
 * Upload da foto/vídeo anexado à observação da série (cliente).
 *
 * Foto: comprimida no aparelho (JPEG, lado maior 1080) — é o mesmo
 * compressor das fotos corporais; 12 MB de HEIC virariam 300 KB e o Gemini
 * não precisa de mais que isso para dizer se é a máquina certa.
 * Vídeo: sobe como está, até `SET_MEDIA_MAX_BYTES`; comprimir vídeo no
 * WebView é lento e trava a série.
 */

import { createClient } from '@/utils/supabase/client'
import { compressBodyPhoto } from '@/utils/storage/bodyPhotoUpload'
import { SET_MEDIA_MAX_BYTES, mediaKindFromMime, type SetMediaRef } from '@/lib/workout/setMedia'

export interface UploadSetMediaInput {
  file: File
  exerciseIndex: number
  setIndex: number
  exerciseName?: string
}

export type UploadSetMediaResult =
  | { ok: true; ref: SetMediaRef }
  | { ok: false; error: string }

export async function uploadSetMedia(input: UploadSetMediaInput): Promise<UploadSetMediaResult> {
  const kind = mediaKindFromMime(input.file.type)
  if (!kind) return { ok: false, error: 'Só foto ou vídeo.' }

  let file = input.file
  if (kind === 'photo') {
    try { file = (await compressBodyPhoto(input.file)).file } catch { /* segue com o original */ }
  }
  if (file.size > SET_MEDIA_MAX_BYTES) {
    return { ok: false, error: `Arquivo grande demais (máx. ${Math.round(SET_MEDIA_MAX_BYTES / 1024 / 1024)} MB). Grave um vídeo mais curto.` }
  }

  const prep = await fetch('/api/workouts/set-media/prepare', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      exerciseIndex: input.exerciseIndex,
      setIndex: input.setIndex,
      exerciseName: input.exerciseName || undefined,
      contentType: file.type || (kind === 'photo' ? 'image/jpeg' : 'video/mp4'),
      fileSize: file.size,
      fileName: file.name || undefined,
    }),
  })
  const json = await prep.json().catch((): null => null)
  if (!prep.ok || !json?.ok) {
    return { ok: false, error: json?.error === 'rate_limited' ? 'Muitos envios seguidos. Aguarde um minuto.' : 'Não consegui preparar o envio.' }
  }
  const supabase = createClient()
  const up = await supabase.storage.from(String(json.bucket)).uploadToSignedUrl(String(json.path), String(json.token), file, {
    contentType: file.type || undefined,
    upsert: true,
  })
  if (up.error) {
    // A linha ficou órfã: apaga para não virar "pendente" eterno.
    void fetch('/api/workouts/set-media/delete', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: json.id }) }).catch(() => null)
    return { ok: false, error: 'Falha no upload: ' + up.error.message }
  }
  return { ok: true, ref: { id: String(json.id), kind, mime: file.type || '' } }
}

export async function deleteSetMedia(id: string): Promise<boolean> {
  try {
    const res = await fetch('/api/workouts/set-media/delete', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
    })
    const json = await res.json().catch((): null => null)
    return Boolean(res.ok && json?.ok)
  } catch { return false }
}
