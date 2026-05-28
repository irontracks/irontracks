/**
 * bodyPhotoUpload — captura/compressão + upload de uma foto da avaliação
 * por foto pro bucket PRIVADO body-photos.
 *
 * Fluxo (client-side):
 *   1. Comprime via Canvas (máx 1080px, JPEG 0.85 — resolução boa pra análise IA).
 *   2. Pede signed upload URL a /api/body-photo/signed-upload (cria a linha da foto).
 *   3. uploadToSignedUrl direto no Storage.
 *
 * Bucket é privado: nunca há URL pública; leitura é via signed URL do servidor.
 */
import { createClient } from '@/utils/supabase/client'
import type { BodyPhotoPose } from '@/types/bodyPhotoAssessment'

const MAX_DIMENSION = 1080
const JPEG_QUALITY = 0.85

export interface CompressedPhoto {
    file: File
    previewDataUrl: string
    width: number
    height: number
}

/** Comprime um arquivo de imagem para JPEG redimensionado. */
export function compressBodyPhoto(file: File): Promise<CompressedPhoto> {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('Arquivo não é uma imagem.'))
            return
        }
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Falha ao ler a imagem.'))
        reader.onload = (e) => {
            const img = new Image()
            img.onerror = () => reject(new Error('Falha ao decodificar a imagem.'))
            img.onload = () => {
                const canvas = document.createElement('canvas')
                const ctx = canvas.getContext('2d')
                if (!ctx) {
                    reject(new Error('Canvas indisponível.'))
                    return
                }
                let width = img.width
                let height = img.height
                if (width > height && width > MAX_DIMENSION) {
                    height = Math.round((height * MAX_DIMENSION) / width)
                    width = MAX_DIMENSION
                } else if (height > MAX_DIMENSION) {
                    width = Math.round((width * MAX_DIMENSION) / height)
                    height = MAX_DIMENSION
                }
                canvas.width = width
                canvas.height = height
                ctx.drawImage(img, 0, 0, width, height)
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Falha ao comprimir.'))
                            return
                        }
                        const compressed = new File([blob], 'photo.jpg', { type: 'image/jpeg', lastModified: Date.now() })
                        resolve({
                            file: compressed,
                            previewDataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
                            width,
                            height,
                        })
                    },
                    'image/jpeg',
                    JPEG_QUALITY,
                )
            }
            img.src = e.target?.result as string
        }
        reader.readAsDataURL(file)
    })
}

export interface UploadPoseResult {
    ok: boolean
    error?: string
}

/** Pede signed URL e faz upload de uma foto (pose) da avaliação. */
export async function uploadBodyPhoto(
    assessmentId: string,
    pose: BodyPhotoPose,
    photo: CompressedPhoto,
): Promise<UploadPoseResult> {
    try {
        const res = await fetch('/api/body-photo/signed-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                assessmentId,
                pose,
                width: photo.width,
                height: photo.height,
                fileSize: photo.file.size,
                mimeType: 'image/jpeg',
            }),
        })
        const signed = await res.json().catch(() => ({ ok: false, error: 'invalid_response' }))
        if (!res.ok || !signed.ok) {
            return { ok: false, error: signed.error || 'Falha ao obter URL de upload.' }
        }

        const supabase = createClient()
        const { error: upErr } = await supabase.storage
            .from('body-photos')
            .uploadToSignedUrl(signed.path, signed.token, photo.file, { contentType: 'image/jpeg' })
        if (upErr) return { ok: false, error: upErr.message || 'Falha no upload.' }
        return { ok: true }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede.' }
    }
}
