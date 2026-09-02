'use client'
import React, { useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { readSetMedia, SET_MEDIA_MAX_PER_SET, type SetMediaRef } from '@/lib/workout/setMedia'
import { uploadSetMedia, deleteSetMedia } from '@/utils/storage/setMediaUpload'

/**
 * SetMediaAttach — "Anexar foto/vídeo" dentro das observações da série.
 *
 * Um componente para os DOIS renderers que têm observações (`normalSet` e
 * `AdvancedSetRow`), pelo mesmo motivo do `AdvancedSetRow` existir: escrever
 * duas vezes é como os 14 renderers divergiram. A referência da mídia vai
 * para o LOG (`log.media`), então viaja com a sessão e chega à finalização,
 * que liga as linhas ao treino e dispara a IA. Aqui não há IA: o aluno está
 * no meio da série.
 */
interface Props {
  log: unknown
  exerciseIndex: number
  setIndex: number
  exerciseName?: string
  updateLog: (key: string, patch: unknown) => void
  logKey: string
}

export function SetMediaAttach({ log, exerciseIndex, setIndex, exerciseName, updateLog, logKey }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const media = readSetMedia(log)
  const cheio = media.length >= SET_MEDIA_MAX_PER_SET

  const onPick = async (file: File | null) => {
    if (!file) return
    setErro(null)
    setBusy(true)
    try {
      const res = await uploadSetMedia({ file, exerciseIndex, setIndex, exerciseName })
      if (!res.ok) { setErro(res.error); return }
      const atual = readSetMedia(log)
      updateLog(logKey, { media: [...atual, res.ref] })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onRemove = async (ref: SetMediaRef) => {
    const atual = readSetMedia(log).filter((m) => m.id !== ref.id)
    updateLog(logKey, { media: atual })
    void deleteSetMedia(ref.id)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {media.map((m) => (
        <span
          key={m.id}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900/70 pl-2 pr-1 py-1 text-[11px] text-neutral-200"
        >
          {m.kind === 'video' ? '🎥 Vídeo' : '📷 Foto'}
          <button
            type="button"
            aria-label={`Remover ${m.kind === 'video' ? 'vídeo' : 'foto'} da série ${setIndex + 1}`}
            onClick={() => { void onRemove(m) }}
            className="tap-44 rounded-md p-0.5 text-neutral-400 hover:text-red-400"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => { void onPick(e.target.files?.[0] ?? null) }}
      />
      <button
        type="button"
        disabled={busy || cheio}
        onClick={() => inputRef.current?.click()}
        aria-label={`Anexar foto ou vídeo à série ${setIndex + 1}`}
        className="tap-44 inline-flex items-center gap-1.5 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 text-[11px] font-semibold text-yellow-300 disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
        {busy ? 'Enviando…' : cheio ? 'Limite de anexos' : 'Anexar foto/vídeo'}
      </button>
      {!busy && !cheio && media.length === 0 && (
        <span className="text-[11px] text-neutral-400">A IA responde ao finalizar o treino.</span>
      )}
      {erro && <span className="basis-full text-[11px] text-red-400">{erro}</span>}
    </div>
  )
}

export default SetMediaAttach
