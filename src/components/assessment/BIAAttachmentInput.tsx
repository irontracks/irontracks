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
import { Upload, FileText, ImageIcon, X, Loader2, CheckCircle, AlertCircle, Sparkles } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import {
  uploadBiaAttachment,
  ALLOWED_BIA_MIME,
  BIA_FILE_LIMIT_LABEL,
} from '@/utils/storage/biaAttachmentUpload'
import {
  extractBiaFromAttachment,
  type BiaExtractionData,
} from '@/utils/storage/biaExtraction'
import { logError } from '@/lib/logger'

interface BIAAttachmentInputProps {
  /** URL atual do anexo (vazio = sem anexo). Vem do form. */
  value: string
  /** Disparado com a URL pública após upload bem-sucedido, ou '' ao remover. */
  onChange: (url: string) => void
  /**
   * Disparado quando a IA terminar de extrair os campos do anexo.
   * Quando definido, o componente roda extração automaticamente após
   * cada upload bem-sucedido. O parent decide como aplicar os valores
   * (geralmente popular o form, marcar campos como "extraídos por IA").
   */
  onExtracted?: (data: BiaExtractionData) => void
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
  onExtracted,
  helpText,
  disabled,
}: BIAAttachmentInputProps) {
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractionStatus, setExtractionStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'success'; confidence: 'high' | 'medium' | 'low' }
    | { kind: 'failed'; message: string }
  >({ kind: 'idle' })
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

      // Pós-upload: dispara extração automática se o parent quiser usar.
      // Falha aqui não invalida o anexo — usuário pode preencher manual.
      if (onExtracted) {
        setExtracting(true)
        setExtractionStatus({ kind: 'idle' })
        try {
          const extraction = await extractBiaFromAttachment(res.publicUrl)
          if (extraction.ok) {
            onExtracted(extraction.data)
            setExtractionStatus({ kind: 'success', confidence: extraction.data.confidence })
          } else {
            setExtractionStatus({
              kind: 'failed',
              message: extraction.message || 'Não consegui ler os dados desse arquivo. Preencha manualmente.',
            })
          }
        } catch (extractionErr) {
          logError('error', 'Erro na extração de BIA', extractionErr)
          setExtractionStatus({
            kind: 'failed',
            message: 'Não consegui ler os dados desse arquivo. Preencha manualmente.',
          })
        } finally {
          setExtracting(false)
        }
      }
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
    setExtractionStatus({ kind: 'idle' })
  }

  /** Re-tentar extração quando a primeira falhou (sem precisar re-upload). */
  const handleRetryExtraction = async () => {
    if (!value || !onExtracted || extracting) return
    setExtracting(true)
    setExtractionStatus({ kind: 'idle' })
    try {
      const extraction = await extractBiaFromAttachment(value)
      if (extraction.ok) {
        onExtracted(extraction.data)
        setExtractionStatus({ kind: 'success', confidence: extraction.data.confidence })
      } else {
        setExtractionStatus({
          kind: 'failed',
          message: extraction.message || 'Ainda não consegui ler. Preencha manualmente.',
        })
      }
    } catch (e) {
      logError('error', 'Erro na extração de BIA (retry)', e)
      setExtractionStatus({ kind: 'failed', message: 'Erro inesperado. Preencha manualmente.' })
    } finally {
      setExtracting(false)
    }
  }

  // ──────────────────────────────────────────────────────────
  // Estado preenchido: mostra preview do anexo com botão remover
  // ──────────────────────────────────────────────────────────
  if (value) {
    const fileName = fileNameFromUrl(value)
    return (
      <div className="space-y-2">
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
            disabled={disabled || extracting}
            className="w-8 h-8 rounded-lg border flex items-center justify-center text-neutral-300 hover:text-white hover:border-red-500/40 transition-all shrink-0 disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.10)' }}
            aria-label="Remover anexo"
            title="Remover anexo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status da extração via IA — banner abaixo do anexo. Só
            renderiza se onExtracted foi passado (modo "preencher
            automaticamente"); senão fica oculto. */}
        {onExtracted && extracting && (
          <div
            className="rounded-xl p-3 flex items-center gap-2 text-xs"
            style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}
          >
            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin shrink-0" />
            <p className="text-yellow-200">Lendo os dados do arquivo com IA…</p>
          </div>
        )}
        {onExtracted && extractionStatus.kind === 'success' && !extracting && (
          <div
            className="rounded-xl p-3 flex items-start gap-2 text-xs"
            style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}
          >
            <Sparkles className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-yellow-200 leading-relaxed">
              {extractionStatus.confidence === 'high'
                ? 'Dados extraídos do arquivo. Confira os campos abaixo antes de salvar.'
                : extractionStatus.confidence === 'medium'
                  ? 'Dados extraídos parcialmente. Revisa com atenção, pode ter algum valor que não bateu.'
                  : 'Tive dificuldade em ler — preenchi o que consegui. Confere todos os campos.'}
            </p>
          </div>
        )}
        {onExtracted && extractionStatus.kind === 'failed' && !extracting && (
          <div
            className="rounded-xl p-3 flex items-start gap-2 text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-200 leading-relaxed">{extractionStatus.message}</p>
              <button
                type="button"
                onClick={handleRetryExtraction}
                className="mt-1.5 text-[11px] font-bold text-yellow-400 hover:text-yellow-300 transition-colors inline-flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Tentar de novo
              </button>
            </div>
          </div>
        )}
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
