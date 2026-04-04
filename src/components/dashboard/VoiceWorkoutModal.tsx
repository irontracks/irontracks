'use client'

/**
 * VoiceWorkoutModal
 *
 * Flow:
 *  1. Mic opens → user speaks one exercise at a time
 *  2. AI parses → preview card with editable fields
 *  3. Confirm → exercise added to list
 *  4. Repeat until "Concluir" → returns list to caller
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Mic, MicOff, Loader2, Check, X,
  Pencil, Trash2, RotateCcw, Dumbbell, Settings,
} from 'lucide-react'
import type { ParsedExercise } from '@/app/api/ai/parse-exercise-voice/route'
import { requestVoicePermissions, openAppSettings } from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

// ── Web Speech API types (not fully typed in all TS DOM libs) ─────────────────

interface ISpeechRecognitionEvent {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface ISpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onresult: ((e: ISpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}

interface ISpeechRecognitionCtor {
  new (): ISpeechRecognition
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface VoiceExerciseDraft {
  id: string
  name: string
  sets: number | null
  reps: number | null
  weightKg: number | null
  cadence: string | null
  restSeconds: number | null
  rpe: number | null
  method: string | null
  notes: string | null
}

interface VoiceWorkoutModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (exercises: VoiceExerciseDraft[]) => void
  existingExercises?: string[]   // names already in the workout for fuzzy match
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function parsedToVoiceDraft(p: ParsedExercise): VoiceExerciseDraft {
  return {
    id: uid(),
    name: p.name,
    sets: p.sets,
    reps: p.reps,
    weightKg: p.weightKg,
    cadence: p.cadence,
    restSeconds: p.restSeconds,
    rpe: p.rpe,
    method: p.method,
    notes: p.notes,
  }
}

function methodLabel(m: string | null) {
  if (!m || m === 'normal') return null
  const map: Record<string, string> = {
    drop_set: 'Drop Set',
    rest_pause: 'Rest-Pause',
    super_set: 'Biset',
    cluster: 'Cluster',
  }
  return map[m] ?? m
}

function exerciseSummary(ex: VoiceExerciseDraft) {
  const parts: string[] = []
  if (ex.sets && ex.reps) parts.push(`${ex.sets}×${ex.reps}`)
  else if (ex.sets) parts.push(`${ex.sets} séries`)
  else if (ex.reps) parts.push(`${ex.reps} reps`)
  if (ex.weightKg) parts.push(`${ex.weightKg}kg`)
  if (ex.cadence) parts.push(`cad. ${ex.cadence}`)
  if (ex.rpe) parts.push(`RPE ${ex.rpe}`)
  const method = methodLabel(ex.method)
  if (method) parts.push(method)
  return parts.join(' · ') || '—'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MicWave({ active }: { active: boolean }) {
  return (
    <div className="flex items-end justify-center gap-[3px] h-6">
      {[0.4, 0.7, 1, 0.7, 0.4].map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-yellow-400 transition-all duration-150"
          style={{
            height: active ? `${h * 24}px` : '4px',
            animation: active ? `mic-wave ${0.6 + i * 0.1}s ease-in-out infinite alternate` : 'none',
          }}
        />
      ))}
      <style>{`
        @keyframes mic-wave {
          0%   { transform: scaleY(0.4); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  )
}

// Inline edit field
function EditField({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">{label}</span>
      <input
        aria-label={label}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-sm text-white font-medium focus:outline-none focus:border-yellow-500/60"
      />
    </label>
  )
}

// Card for a confirmed exercise in the list
function ConfirmedCard({
  ex, onRemove, onEdit,
}: {
  ex: VoiceExerciseDraft
  onRemove: () => void
  onEdit: () => void
}) {
  return (
    <div className="flex items-start gap-3 bg-neutral-900/60 border border-neutral-800 rounded-xl px-3 py-2.5">
      <div className="w-7 h-7 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Dumbbell size={13} className="text-yellow-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-white truncate">{ex.name}</p>
        <p className="text-[11px] text-neutral-400 truncate">{exerciseSummary(ex)}</p>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
          aria-label="Editar"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="Remover"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// Editable preview / inline edit card
function EditCard({
  draft,
  onChange,
  onConfirm,
  onCancel,
  isPreview,
}: {
  draft: VoiceExerciseDraft
  onChange: (d: VoiceExerciseDraft) => void
  onConfirm: () => void
  onCancel: () => void
  isPreview: boolean
}) {
  const set = (key: keyof VoiceExerciseDraft, raw: string) => {
    const numericKeys = ['sets', 'reps', 'weightKg', 'restSeconds', 'rpe'] as const
    type NumKey = typeof numericKeys[number]
    if ((numericKeys as readonly string[]).includes(key)) {
      const n = raw === '' ? null : Number(raw)
      onChange({ ...draft, [key as NumKey]: Number.isFinite(n) ? n : null })
    } else {
      onChange({ ...draft, [key]: raw === '' ? null : raw })
    }
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(234,179,8,0.06) 0%, rgba(10,10,10,0.98) 100%)',
        borderColor: 'rgba(234,179,8,0.25)',
      }}
    >
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-white/5 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-yellow-500">
          {isPreview ? '🎤 Entendido — confirme ou edite' : '✏️ Editando'}
        </span>
      </div>

      {/* Fields */}
      <div className="p-3 space-y-2.5">
        <EditField
          label="Exercício"
          value={draft.name}
          onChange={v => onChange({ ...draft, name: v })}
          placeholder="Nome do exercício"
        />
        <div className="grid grid-cols-3 gap-2">
          <EditField label="Séries" value={draft.sets?.toString() ?? ''} onChange={v => set('sets', v)} type="number" placeholder="—" />
          <EditField label="Reps" value={draft.reps?.toString() ?? ''} onChange={v => set('reps', v)} type="number" placeholder="—" />
          <EditField label="Peso (kg)" value={draft.weightKg?.toString() ?? ''} onChange={v => set('weightKg', v)} type="number" placeholder="—" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <EditField label="Cadência" value={draft.cadence ?? ''} onChange={v => set('cadence', v)} placeholder="ex: 2020" />
          <EditField label="RPE" value={draft.rpe?.toString() ?? ''} onChange={v => set('rpe', v)} type="number" placeholder="1-10" />
          <EditField label="Descanso (s)" value={draft.restSeconds?.toString() ?? ''} onChange={v => set('restSeconds', v)} type="number" placeholder="—" />
        </div>
        <EditField label="Notas" value={draft.notes ?? ''} onChange={v => set('notes', v)} placeholder="observações..." />
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-xl font-bold text-sm text-neutral-400 bg-neutral-800/60 border border-neutral-700 hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1.5"
        >
          <X size={14} />
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!draft.name.trim()}
          className="flex-1 py-2 rounded-xl font-black text-sm text-black bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
        >
          <Check size={14} />
          Confirmar
        </button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

type ModalPhase = 'listening' | 'parsing' | 'preview' | 'editing'

export default function VoiceWorkoutModal({
  isOpen, onClose, onComplete, existingExercises = [],
}: VoiceWorkoutModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('listening')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [exercises, setExercises] = useState<VoiceExerciseDraft[]>([])
  const [pendingDraft, setPendingDraft] = useState<VoiceExerciseDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<VoiceExerciseDraft | null>(null)
  const [error, setError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isPermissionDenied, setIsPermissionDenied] = useState(false)

  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }
  }, [])

  // Opens the app's settings page so the user can re-enable mic / speech recognition
  const openDeviceSettings = useCallback(() => {
    // On iOS native, use the Capacitor plugin that calls UIApplication.openSettingsURLString.
    // On web / Android, fall back to the system URL scheme.
    if (isIosNative()) {
      void openAppSettings()
    } else {
      window.open('app-settings:', '_system')
    }
  }, [])

  // Scroll list to bottom when exercises grow
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [exercises.length])

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    recognitionRef.current?.stop()
    setIsRecording(false)
  }, [])

  const parseTranscript = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) { setPhase('listening'); return }
    setPhase('parsing')
    setError('')
    try {
      const res = await fetch('/api/ai/parse-exercise-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, existingExercises }),
      })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok || !Array.isArray(json.exercises) || json.exercises.length === 0) {
        setError('Não entendi. Tente novamente.')
        setPhase('listening')
        return
      }
      // Take the first exercise for preview (multi-exercise support could be added later)
      const first = parsedToVoiceDraft(json.exercises[0] as ParsedExercise)
      setPendingDraft(first)
      setPhase('preview')
    } catch {
      setError('Falha ao processar. Tente novamente.')
      setPhase('listening')
    }
  }, [existingExercises])

  const startRecording = useCallback(() => {
    setIsPermissionDenied(false)
    const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null
    const SpeechRecognitionAPI: ISpeechRecognitionCtor | null =
      (win?.SpeechRecognition as ISpeechRecognitionCtor | undefined) ||
      (win?.webkitSpeechRecognition as ISpeechRecognitionCtor | undefined) ||
      null

    if (!SpeechRecognitionAPI) {
      setError('Reconhecimento de voz não suportado neste dispositivo.')
      return
    }

    const begin = () => {
      setTranscript('')
      setInterimTranscript('')
      setError('')

      const recognition = new SpeechRecognitionAPI()
      recognition.lang = 'pt-BR'
      recognition.continuous = true
      recognition.interimResults = true
      recognitionRef.current = recognition

      recognition.onstart = () => setIsRecording(true)

      recognition.onresult = (e: ISpeechRecognitionEvent) => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        let final = ''
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) final += r[0].transcript
          else interim += r[0].transcript
        }
        setTranscript(prev => prev + final)
        setInterimTranscript(interim)

        // Auto-stop after 3s silence
        silenceTimerRef.current = setTimeout(() => {
          recognition.stop()
        }, 3000)
      }

      recognition.onend = () => {
        setIsRecording(false)
        setInterimTranscript('')
        const finalText = (document.getElementById('voice-transcript-hidden') as HTMLInputElement | null)?.value || ''
        if (finalText.trim()) {
          void parseTranscript(finalText)
        }
      }

      recognition.onerror = (e: { error?: string; message?: string }) => {
        setIsRecording(false)
        const code = e?.error || ''
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setIsPermissionDenied(true)
          setError('Permissão de reconhecimento de voz negada. Habilite o microfone e o reconhecimento de voz nas configurações do dispositivo.')
        } else if (code === 'no-speech') {
          setError('Nenhuma fala detectada. Tente novamente.')
        } else if (code === 'network') {
          setError('Erro de rede. Verifique sua conexão.')
        } else {
          setError(`Erro no reconhecimento de voz (${code || 'unknown'}). Tente novamente.`)
        }
      }

      try {
        recognition.start()
      } catch {
        setIsRecording(false)
        setIsPermissionDenied(true)
        setError(`Não foi possível iniciar o reconhecimento de voz. Verifique as permissões de microfone e reconhecimento de voz.`)
      }
    }

    // On iOS native: request BOTH microphone AND speech recognition permissions via the
    // native plugin before attempting to start recognition. webkitSpeechRecognition in
    // WKWebView requires SFSpeechRecognizer.requestAuthorization (speech recognition) in
    // addition to AVAudioSession.requestRecordPermission (microphone). If only the
    // microphone permission dialog appears and speech recognition is denied/undetermined,
    // recognition.start() fires onerror 'not-allowed'.
    if (isIosNative()) {
      requestVoicePermissions().then((status) => {
        if (status.microphone === 'denied') {
          setIsPermissionDenied(true)
          setError('Permissão de microfone negada. Habilite nas configurações do dispositivo.')
          return
        }
        if (status.speechRecognition === 'denied') {
          setIsPermissionDenied(true)
          setError('Permissão de reconhecimento de voz negada. Habilite nas configurações do dispositivo.')
          return
        }
        begin()
      })
      return
    }

    // On web: try getUserMedia to trigger the browser permission dialog, then start
    // speech recognition. If getUserMedia is unavailable (insecure context, old browser)
    // skip straight to begin() and let SpeechRecognition.start() handle its own errors.
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        stream.getTracks().forEach((t) => t.stop())
        begin()
      }).catch((err: unknown) => {
        const isNotAllowed =
          (err instanceof DOMException &&
            (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) ||
          (err instanceof Error && err.name === 'NotAllowedError')
        if (isNotAllowed) {
          setIsPermissionDenied(true)
          setError('Permissão de microfone negada. Habilite nas configurações do navegador.')
        } else {
          // getUserMedia failed for a non-permission reason (e.g. no audio device).
          // Still try speech recognition — it may work independently.
          begin()
        }
      })
      return
    }

    // getUserMedia unavailable — go straight to speech recognition
    begin()
  }, [parseTranscript])

  const confirmPending = useCallback(() => {
    if (!pendingDraft) return
    setExercises(prev => [...prev, pendingDraft])
    setPendingDraft(null)
    setTranscript('')
    setPhase('listening')
  }, [pendingDraft])

  const cancelPending = useCallback(() => {
    setPendingDraft(null)
    setTranscript('')
    setPhase('listening')
  }, [])

  const removeExercise = useCallback((id: string) => {
    setExercises(prev => prev.filter(e => e.id !== id))
  }, [])

  const startEdit = useCallback((ex: VoiceExerciseDraft) => {
    setEditingId(ex.id)
    setEditDraft({ ...ex })
    setPhase('editing')
  }, [])

  const confirmEdit = useCallback(() => {
    if (!editDraft) return
    setExercises(prev => prev.map(e => e.id === editingId ? editDraft : e))
    setEditingId(null)
    setEditDraft(null)
    setPhase('listening')
  }, [editDraft, editingId])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditDraft(null)
    setPhase('listening')
  }, [])

  if (!isOpen) return null

  const showListening = phase === 'listening'
  const showParsing = phase === 'parsing'
  const showPreview = phase === 'preview' && !!pendingDraft
  const showEditing = phase === 'editing' && !!editDraft

  // Hidden input trick to pass transcript to onend handler
  const displayText = transcript + interimTranscript

  return (
    <div className="fixed inset-0 z-[1500] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-sm border-0"
      />

      {/* Panel */}
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(160deg, #111000 0%, #0a0a0a 30%)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(234,179,8,0.18)',
          maxHeight: '90vh',
        }}
      >
        {/* Gold line */}
        <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/70 to-transparent flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)' }}
            >
              <Mic size={17} className="text-yellow-400" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-500">Criação por Voz</div>
              <div className="text-white font-black text-base leading-tight">Treino por Voz</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-neutral-500 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 min-h-0">

          {/* Confirmed exercises list */}
          {exercises.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {exercises.map(ex => (
                editingId === ex.id && editDraft ? null : (
                  <ConfirmedCard
                    key={ex.id}
                    ex={ex}
                    onRemove={() => removeExercise(ex.id)}
                    onEdit={() => startEdit(ex)}
                  />
                )
              ))}
            </div>
          )}

          {/* Edit mode */}
          {showEditing && editDraft && (
            <EditCard
              draft={editDraft}
              onChange={setEditDraft}
              onConfirm={confirmEdit}
              onCancel={cancelEdit}
              isPreview={false}
            />
          )}

          {/* Preview / confirm from voice */}
          {showPreview && pendingDraft && (
            <EditCard
              draft={pendingDraft}
              onChange={setPendingDraft}
              onConfirm={confirmPending}
              onCancel={cancelPending}
              isPreview
            />
          )}

          {/* Listening state */}
          {showListening && (
            <div className="rounded-2xl border border-white/8 bg-neutral-900/50 p-4 flex flex-col items-center gap-4">
              {/* Mic button */}
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className="relative w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: isRecording
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                    : 'linear-gradient(135deg, rgba(234,179,8,0.25), rgba(234,179,8,0.1))',
                  border: isRecording
                    ? '2px solid rgba(239,68,68,0.5)'
                    : '2px solid rgba(234,179,8,0.4)',
                  boxShadow: isRecording
                    ? '0 0 24px rgba(239,68,68,0.4)'
                    : '0 0 16px rgba(234,179,8,0.15)',
                }}
                aria-label={isRecording ? 'Parar gravação' : 'Iniciar gravação'}
              >
                {isRecording
                  ? <MicOff size={28} className="text-white" />
                  : <Mic size={28} className="text-yellow-400" />
                }
                {isRecording && (
                  <span
                    className="absolute inset-0 rounded-full border-2 border-red-400 opacity-60"
                    style={{ animation: 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite' }}
                  />
                )}
              </button>

              {/* Wave animation */}
              <MicWave active={isRecording} />

              {/* Transcript display */}
              {displayText ? (
                <p className="text-sm text-neutral-200 text-center leading-relaxed px-2">
                  &ldquo;{displayText}&rdquo;
                </p>
              ) : (
                <p className="text-sm text-neutral-500 text-center">
                  {isRecording
                    ? 'Ouvindo... fale o exercício'
                    : exercises.length === 0
                      ? 'Toque no microfone e fale o exercício'
                      : 'Toque para adicionar mais, ou Concluir'}
                </p>
              )}

              {error && (
                <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <X size={13} className="text-red-400 flex-shrink-0" />
                    <p className="text-red-300 text-xs font-medium">{error}</p>
                    <button
                      type="button"
                      onClick={() => { setError(''); setIsPermissionDenied(false) }}
                      className="ml-auto text-red-400 hover:text-red-300 flex-shrink-0"
                      aria-label="Fechar erro"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {isPermissionDenied && (
                    <button
                      type="button"
                      onClick={openDeviceSettings}
                      className="w-full py-2 rounded-lg text-xs font-black text-white bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Settings size={12} />
                      Abrir Configurações
                    </button>
                  )}
                </div>
              )}

              {/* Example hint */}
              {!isRecording && !displayText && exercises.length === 0 && (
                <div className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">Exemplo</p>
                  <p className="text-xs text-neutral-400 italic leading-relaxed">
                    &ldquo;Supino reto, 4 séries de 12, cadência 2020&rdquo;
                  </p>
                  <p className="text-xs text-neutral-400 italic leading-relaxed mt-1">
                    &ldquo;Rosca direta, 3 de 10, 20 quilos, RPE 8&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Parsing spinner */}
          {showParsing && (
            <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6 flex flex-col items-center gap-3">
              <Loader2 size={28} className="text-yellow-400 animate-spin" />
              <p className="text-sm text-yellow-200/80 font-medium">Processando...</p>
            </div>
          )}

          {/* Hidden input to pass transcript value to onend */}
          <input
            id="voice-transcript-hidden"
            type="hidden"
            value={transcript}
            readOnly
          />
        </div>

        {/* Footer */}
        <div
          className="flex gap-2 px-4 pt-3 pb-safe-or-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={() => { stopRecording(); onClose() }}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-neutral-400 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={exercises.length === 0}
            onClick={() => { stopRecording(); onComplete(exercises) }}
            className="flex-1 py-3 rounded-xl font-black text-sm text-black bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
          >
            <Check size={15} />
            Concluir
            {exercises.length > 0 && (
              <span className="bg-black/20 px-1.5 py-0.5 rounded-md text-xs font-black">
                {exercises.length}
              </span>
            )}
          </button>
        </div>

        {/* Retry button when in listening phase and has exercises */}
        {showListening && !isRecording && exercises.length > 0 && (
          <div className="px-4 pb-2 flex justify-center -mt-1 flex-shrink-0">
            <button
              type="button"
              onClick={startRecording}
              className="text-xs text-neutral-500 hover:text-yellow-400 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw size={11} />
              Adicionar mais exercícios
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
