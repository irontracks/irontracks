'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { compressImage } from '@/utils/chat/media'
import { Camera, Loader2, Check, X } from 'lucide-react'
import Image from 'next/image'

interface AvatarUploadModalProps {
  isOpen: boolean
  onClose: () => void
  currentPhotoURL: string | null
  userId: string
  onPhotoUpdated: (url: string) => void
}

export default function AvatarUploadModal({ isOpen, onClose, currentPhotoURL, userId, onPhotoUpdated }: AvatarUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cleanup preview URL on unmount or close
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [previewUrl])

  if (!isOpen) return null

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setError('Formato inválido. Use JPG, PNG ou WebP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Imagem muito grande (máximo 5MB).')
      return
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const preview = URL.createObjectURL(file)
    setPreviewUrl(preview)
    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile || !userId) return
    setError('')
    setUploading(true)

    try {
      // 1. Compress image
      const compressed = await compressImage(selectedFile, { maxWidth: 512, quality: 0.85 })

      // 2. Sign upload via Cloudinary
      const signRes = await fetch('/api/storage/sign-cloudinary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'profile' }),
      })
      const sign = await signRes.json()
      if (!sign?.signature || !sign?.uploadUrl) {
        setError('Erro ao preparar upload. Tente novamente.')
        setUploading(false)
        return
      }

      // 3. Upload to Cloudinary
      const form = new FormData()
      form.append('file', compressed, 'avatar.jpg')
      form.append('api_key', sign.apiKey)
      form.append('timestamp', String(sign.timestamp))
      form.append('signature', sign.signature)
      form.append('folder', sign.folder)
      form.append('public_id', sign.publicId)

      const uploadRes = await fetch(sign.uploadUrl, { method: 'POST', body: form })
      const uploadData = await uploadRes.json()
      const secureUrl = String(uploadData?.secure_url || '')
      if (!secureUrl) {
        setError('Erro no upload da imagem.')
        setUploading(false)
        return
      }

      // 4. Update profile in Supabase
      const supabase = createClient()
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ photo_url: secureUrl })
        .eq('id', userId)

      if (dbError) {
        setError('Erro ao salvar foto no perfil.')
        setUploading(false)
        return
      }

      // 5. Also update auth metadata for consistency
      await supabase.auth.updateUser({ data: { avatar_url: secureUrl } }).catch(() => {})

      setSuccess(true)
      setTimeout(() => {
        onPhotoUpdated(secureUrl)
      }, 1000)
    } catch {
      setError('Erro inesperado. Tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    if (uploading) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(null)
    setPreviewUrl(null)
    setError('')
    setSuccess(false)
    onClose()
  }

  const displayUrl = previewUrl || currentPhotoURL

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" onClick={handleClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm border-0 cursor-default" />
      <div role="dialog" aria-modal="true" aria-label="Trocar foto de perfil" className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black text-white">Foto de Perfil</h2>
          <button type="button" onClick={handleClose} className="text-neutral-500 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {/* Avatar preview */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-yellow-500/40">
            {displayUrl ? (
              <Image src={displayUrl} width={96} height={96} className="w-full h-full object-cover" alt="Avatar" unoptimized />
            ) : (
              <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                <Camera size={28} className="text-neutral-600" />
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 size={24} className="text-yellow-500 animate-spin" />
              </div>
            )}
            {success && (
              <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                <Check size={28} className="text-emerald-400" />
              </div>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            aria-label="Selecionar foto de perfil"
          />

          {!success && (
            <div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-neutral-200 bg-neutral-800 border border-neutral-700 hover:bg-neutral-750 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Camera size={15} />
                {selectedFile ? 'Trocar' : 'Escolher Foto'}
              </button>

              {selectedFile && (
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex-1 py-2.5 rounded-xl font-black text-sm text-black bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : null}
                  {uploading ? 'Enviando...' : 'Salvar'}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="w-full bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <p className="text-red-300 text-xs font-medium text-center">{error}</p>
            </div>
          )}

          <p className="text-[10px] text-neutral-600 text-center">JPG, PNG ou WebP. Máximo 5MB.</p>
        </div>
      </div>
    </div>
  )
}
