'use client'

/**
 * BIAAttachmentInput — caixa de upload do PDF/foto da bioimpedância.
 *
 * Reutilizado pelo QuickBIAModal e pelo BIAStep do formulário completo.
 *
 * UX: o componente é controlado por `value` (URL atual do anexo).
 * Quando vazio → mostra a caixa drag-and-drop. Quando preenchido →
 * mostra preview com nome/URL e botão de remover. Estado intermediário
 * ('uploading' / 'error') é interno e auto-resetado quando relevante.
 */

import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Upload, FileText, ImageIcon, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import {
  uploadBiaAttachment,
  ALLOWED_BIA_MIME,
  BIA_FILE_LIMIT_LABEL,
} from '@/utils/storage/biaAttachmentUpload'
import { logError } from '@/lib/logger'

interface BIAAttachmentInputProps {
  /** URL atual do anexo (vazio = sem anexo). Vem do form. */
  value: string
  /** Disparado com a URL pública após upload bem-sucedido, ou '' ao remover. */
  onChange: (url: string) => void
  /** Texto descritivo opcional sobre o que enviar. */
  helpText?: string
  /** Permite forçar 'disabled' em fluxos onde o upload não deve rolar. */
  disabled?: boolean
}

const ACCEPT_ATTR = ALLOWED_BIA_MIME.join(',')

const isImage = (url: string) => /\.(jpe?g|png|webp|heic|heif)(\?|$)/i.test(url)
const isPdf = (url: string) => /\.pdf(\?|$)/i.test(url)

const fileNameFromUrl = (url: string): string => {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').pop() || 'arquivo'
    return decodeURIComponent(last).replace(/^\d+_/, '')
  } catch {
    return 'arquivo'
  }
}

export default function BIAAttachmentInput({
  value,
  onChange,
  helpText,
  disabled,
}: BIAAttachmentInputProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return
    const file = files[0]
    setError(null)

    // Pega o user_id pra montar o path do upload (o endpoint valida).
    let userId: string | null = null
    try {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      userId = data?.user?.id || null
    } catch (e) {
      logError('error', 'Falha ao obter usuário para upload BIA', e)
    }
    if (!userId) {
      setError('Sessão expirou — recarregue a página e tente de novo.')
      return
    }

    try {
      setUploading(true)
      const res = await uploadBiaAttachment(file, userId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onChange(res.publicUrl)
    } catch (e) {
      logError('error', 'Erro inesperado no upload BIA', e)
      setError('Erro inesperado. Tenta de novo.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = () => {
    if (disabled) return
    onChange('')
    setError(null)
  }

  // ──────────────────────────────────────────────────────────
  // Estado preenchido: mostra preview do anexo com botão remover
  // ──────────────────────────────────────────────────────────
  if (value) {
    const fileName = fileNameFromUrl(value)
    return (
      <div
        className="rounded-xl p-3 border flex items-center gap-3"
        style={{
          background: 'rgba(34,197,94,0.06)',
          borderColor: 'rgba(34,197,94,0.30)',
        }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(34,197,94,0.15)' }}
        >
          {isPdf(value) ? (
            <FileText className="w-5 h-5 text-emerald-400" />
          ) : isImage(value) ? (
            <ImageIcon className="w-5 h-5 text-emerald-400" />
          ) : (
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-white truncate block hover:underline"
            title={fileName}
          >
            {fileName}
          </a>
          <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-wide mt-0.5">
            Anexo enviado · clique para abrir
          </p>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          disabled={disabled}
          className="w-8 h-8 rounded-lg border flex items-center justify-center text-neutral-300 hover:text-white hover:border-red-500/40 transition-all shrink-0 disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.10)' }}
          aria-label="Remover anexo"
          title="Remover anexo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────
  // Estado vazio: caixa drag-and-drop
  // ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <motion.button
        type="button"
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        disabled={disabled || uploading}
        className="w-full rounded-xl border border-dashed p-4 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: dragOver ? 'rgba(234,179,8,0.10)' : 'rgba(255,255,255,0.02)',
          borderColor: dragOver ? 'rgba(234,179,8,0.50)' : 'rgba(255,255,255,0.18)',
        }}
        animate={{ scale: dragOver ? 1.02 : 1 }}
        aria-label="Anexar PDF ou foto da bioimpedância"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.20)' }}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />
            ) : (
              <Upload className="w-5 h-5 text-yellow-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              {uploading ? 'Enviando arquivo...' : 'Anexar PDF ou foto do resultado'}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              {helpText || `PDF, JPG, PNG, WEBP ou HEIC · até ${BIA_FILE_LIMIT_LABEL}`}
            </p>
          </div>
        </div>
      </motion.button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        aria-label="Selecionar arquivo de bioimpedância"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled || uploading}
      />

      {error && (
        <div
          className="rounded-xl p-3 flex gap-2 text-xs"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-200">{error}</p>
        </div>
      )}
    </div>
  )
}
