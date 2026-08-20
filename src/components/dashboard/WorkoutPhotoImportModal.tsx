'use client'

/**
 * WorkoutPhotoImportModal — importar treino a partir de FOTO ou PDF da ficha.
 *
 * Fluxo: escolher arquivos → subir → IA lê → REVISAR → criar os treinos.
 *
 * A revisão não é enfeite: a IA lê letra de personal em papel amassado e vai
 * errar às vezes. Mostrar o que foi lido, editável, antes de gravar é o que
 * diferencia "importou seu treino" de "criou um treino parecido com o seu".
 *
 * Diferença central em relação ao `VoiceWorkoutModal` (o irmão mais próximo):
 * aqui vêm VÁRIOS treinos de uma vez — uma ficha traz o programa da semana
 * inteira. Por isso a revisão tem abas por treino, e não uma lista só.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, FileText, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackHandler } from '@/hooks/useBackHandler'
import { plainFieldProps, properNameFieldProps } from '@/utils/ui/textFieldProps'
import { uploadWorkoutImportFile, resolveImportMime } from '@/utils/storage/workoutImportUpload'
import { WORKOUT_IMPORT_MAX_FILES } from '@/types/workoutPhotoImport'
import { METHOD_TO_EDITOR } from '@/utils/ai/workoutPhotoNormalize'
import type { PhotoImportMethod } from '@/schemas/workoutPhotoImport'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ImportedExercise {
  id: string
  name: string
  /** Nome como estava na ficha, quando a padronização mudou. Só para exibir. */
  originalName?: string
  sets: number | null
  reps: string | null
  weightKg: number | null
  cadence: string | null
  restSeconds: number | null
  rpe: number | null
  method: PhotoImportMethod | null
  notes: string | null
}

export interface ImportedWorkout {
  id: string
  title: string
  exercises: ImportedExercise[]
}

type Phase = 'select' | 'uploading' | 'extracting' | 'review' | 'saving' | 'error'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Recebe os treinos revisados. Quem salva é o chamador (usa o mesmo caminho do wizard). */
  onComplete: (workouts: ImportedWorkout[]) => void | Promise<void>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function methodLabel(m: PhotoImportMethod | null): string | null {
  if (!m || m === 'normal') return null
  return METHOD_TO_EDITOR[m] ?? null
}

/** Resumo de uma linha: "4×8-12 · 60kg · RPE 9 · Drop-set". */
function exerciseSummary(ex: ImportedExercise): string {
  const parts: string[] = []
  if (ex.sets && ex.reps) parts.push(`${ex.sets}×${ex.reps}`)
  else if (ex.sets) parts.push(`${ex.sets} séries`)
  else if (ex.reps) parts.push(`${ex.reps} reps`)
  if (ex.weightKg != null) parts.push(`${ex.weightKg}kg`)
  if (ex.rpe != null) parts.push(`RPE ${ex.rpe}`)
  if (ex.restSeconds != null) parts.push(`${ex.restSeconds}s desc.`)
  const m = methodLabel(ex.method)
  if (m) parts.push(m)
  return parts.join(' · ') || 'sem detalhes na ficha'
}

const MENSAGENS_ETAPA: Record<Exclude<Phase, 'select' | 'review' | 'error'>, string> = {
  uploading: 'Enviando a ficha…',
  extracting: 'Lendo sua ficha…',
  saving: 'Criando os treinos…',
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function WorkoutPhotoImportModal({ isOpen, onClose, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('select')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [workouts, setWorkouts] = useState<ImportedWorkout[]>([])
  const [activeTab, setActiveTab] = useState(0)
  /** Guardado para "tentar de novo" sem obrigar a subir a ficha outra vez. */
  const importIdRef = useRef<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  const focusTrapRef = useFocusTrap(isOpen, onClose)
  useBackHandler(isOpen, onClose)

  const totalExercicios = useMemo(
    () => workouts.reduce((acc, w) => acc + w.exercises.length, 0),
    [workouts],
  )

  const addFiles = useCallback((picked: FileList | null) => {
    if (!picked?.length) return
    setError('')
    setFiles((prev) => {
      const livres = WORKOUT_IMPORT_MAX_FILES - prev.length
      if (livres <= 0) {
        setError(`Máximo de ${WORKOUT_IMPORT_MAX_FILES} páginas por ficha.`)
        return prev
      }
      const aceitos: File[] = []
      for (const f of Array.from(picked).slice(0, livres)) {
        if (!resolveImportMime(f)) {
          setError('Tipo não aceito. Use foto (JPG/PNG/HEIC) ou PDF.')
          continue
        }
        aceitos.push(f)
      }
      return [...prev, ...aceitos]
    })
  }, [])

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  /** Sobe os arquivos e chama a extração. Reaproveita o importId num retry. */
  const extrair = useCallback(async () => {
    if (!files.length) return
    setError('')
    setPhase('uploading')

    try {
      let importId = importIdRef.current
      if (!importId) {
        const res = await fetch('/api/workout-photo-import/create', { method: 'POST' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.ok) {
          setError(json?.message || (json?.error === 'vip_required'
            ? 'Importar ficha é um recurso VIP.'
            : 'Não consegui iniciar a importação.'))
          setPhase('error')
          return
        }
        importId = String(json.importId)
        importIdRef.current = importId

        // Upload só na primeira passada: no retry os arquivos já estão lá.
        for (const f of files) {
          const up = await uploadWorkoutImportFile(f, importId)
          if (!up.ok) {
            setError(up.error)
            setPhase('error')
            return
          }
        }
      }

      setPhase('extracting')
      const res = await fetch('/api/ai/workout-photo-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok || !Array.isArray(json.workouts) || !json.workouts.length) {
        setError(
          json?.message ||
            'Não consegui identificar exercícios nesta imagem. Tente uma foto mais nítida, com a ficha inteira enquadrada.',
        )
        setPhase('error')
        return
      }

      const lidos: ImportedWorkout[] = (json.workouts as Array<Record<string, unknown>>).map((w) => ({
        id: rid(),
        title: String(w.title || 'Treino'),
        exercises: (Array.isArray(w.exercises) ? w.exercises : []).map((raw) => {
          const e = raw as Record<string, unknown>
          return {
            id: rid(),
            name: String(e.name || ''),
            ...(e.originalName ? { originalName: String(e.originalName) } : {}),
            sets: typeof e.sets === 'number' ? e.sets : null,
            reps: e.reps == null ? null : String(e.reps),
            weightKg: typeof e.weightKg === 'number' ? e.weightKg : null,
            cadence: e.cadence == null ? null : String(e.cadence),
            restSeconds: typeof e.restSeconds === 'number' ? e.restSeconds : null,
            rpe: typeof e.rpe === 'number' ? e.rpe : null,
            method: (e.method as PhotoImportMethod) ?? null,
            notes: e.notes == null ? null : String(e.notes),
          }
        }),
      }))

      setWorkouts(lidos)
      setActiveTab(0)
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha inesperada.')
      setPhase('error')
    }
  }, [files])

  const patchExercise = useCallback((wIdx: number, exId: string, patch: Partial<ImportedExercise>) => {
    setWorkouts((prev) =>
      prev.map((w, i) =>
        i !== wIdx ? w : { ...w, exercises: w.exercises.map((e) => (e.id === exId ? { ...e, ...patch } : e)) },
      ),
    )
  }, [])

  const removeExercise = useCallback((wIdx: number, exId: string) => {
    setWorkouts((prev) =>
      prev.map((w, i) => (i !== wIdx ? w : { ...w, exercises: w.exercises.filter((e) => e.id !== exId) })),
    )
  }, [])

  const removeWorkout = useCallback((wIdx: number) => {
    setWorkouts((prev) => prev.filter((_, i) => i !== wIdx))
    setActiveTab((t) => Math.max(0, t >= wIdx ? t - 1 : t))
  }, [])

  const confirmar = useCallback(async () => {
    // Treino sem exercício não vira treino — o usuário pode ter esvaziado uma aba.
    const validos = workouts.filter((w) => w.exercises.length > 0)
    if (!validos.length) return
    setPhase('saving')
    try {
      await onComplete(validos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui criar os treinos.')
      setPhase('error')
    }
  }, [workouts, onComplete])

  if (!isOpen) return null

  const emProgresso = phase === 'uploading' || phase === 'extracting' || phase === 'saving'
  const aba = workouts[activeTab]

  return (
    <div className="fixed inset-0 z-[1500] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-sm border-0"
      />

      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-photo-import-title"
        className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(160deg, #111000 0%, #0a0a0a 30%)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(234,179,8,0.18)',
          maxHeight: '90vh',
        }}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/70 to-transparent flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)' }}
            >
              <Camera size={17} className="text-yellow-400" />
            </div>
            <div>
              <div className="text-[10px] t-meta-inherit text-yellow-500">Importar ficha</div>
              <div id="workout-photo-import-title" className="text-white font-black text-base leading-tight">
                Treino por Foto/PDF
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-44 w-8 h-8 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            aria-label="Voltar"
          >
            <ArrowLeft size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
          {/* ── Seleção de arquivos ─────────────────────────────────────── */}
          {phase === 'select' && (
            <div className="space-y-3">
              <p className="text-sm text-neutral-300 leading-snug">
                Fotografe a ficha do seu personal, ou envie o PDF. A IA lê os exercícios e
                você confere antes de salvar.
              </p>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full rounded-2xl border border-dashed border-yellow-500/30 bg-yellow-500/[0.04] px-4 py-6 text-center hover:bg-yellow-500/[0.08] transition-colors active:scale-[0.99]"
              >
                <Plus size={20} className="mx-auto text-yellow-400 mb-1.5" />
                <div className="text-sm font-bold text-white">Escolher foto ou PDF</div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Até {WORKOUT_IMPORT_MAX_FILES} páginas · JPG, PNG, HEIC ou PDF
                </div>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/*"
                multiple
                className="hidden"
                aria-label="Escolher foto ou PDF da ficha de treino"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = '' // permite reescolher o mesmo arquivo
                }}
              />

              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2"
                    >
                      <FileText size={14} className="text-neutral-400 shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-xs text-neutral-200">{f.name}</span>
                      <span className="text-[10px] text-neutral-400 shrink-0">
                        {(f.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        aria-label={`Remover ${f.name}`}
                        className="tap-44 w-7 h-7 inline-flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-400 transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {error && <p className="text-xs font-semibold text-red-300">{error}</p>}
            </div>
          )}

          {/* ── Progresso ───────────────────────────────────────────────── */}
          {emProgresso && (
            <div className="py-10 text-center">
              <Loader2 size={28} className="mx-auto animate-spin text-yellow-400 mb-3" />
              <div className="text-sm font-bold text-white">{MENSAGENS_ETAPA[phase]}</div>
              {phase === 'extracting' && (
                <div className="text-[11px] text-neutral-400 mt-1">Pode levar alguns segundos.</div>
              )}
            </div>
          )}

          {/* ── Erro ────────────────────────────────────────────────────── */}
          {phase === 'error' && (
            <div className="py-6 text-center space-y-3">
              <div className="text-sm text-neutral-200 leading-snug">{error}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setError(''); setPhase('select') }}
                  className="flex-1 min-h-[44px] rounded-xl border border-neutral-700 bg-neutral-900 text-sm font-bold text-neutral-200"
                >
                  Trocar arquivos
                </button>
                <button
                  type="button"
                  onClick={extrair}
                  className="flex-1 min-h-[44px] rounded-xl bg-yellow-500 text-black text-sm font-black"
                >
                  Tentar de novo
                </button>
              </div>
            </div>
          )}

          {/* ── Revisão ─────────────────────────────────────────────────── */}
          {phase === 'review' && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-400 leading-snug">
                Confira o que foi lido da ficha. Toque para corrigir qualquer campo — o que
                estiver errado aqui vai errado para o treino.
              </p>

              {/* Abas por treino */}
              {workouts.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                  {workouts.map((w, i) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setActiveTab(i)}
                      className={[
                        'shrink-0 tap-44 min-h-[36px] px-3 rounded-xl text-xs t-action border transition-colors',
                        i === activeTab
                          ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400',
                      ].join(' ')}
                    >
                      {w.title || `Treino ${i + 1}`}
                      <span className="ml-1.5 text-[10px] opacity-70">{w.exercises.length}</span>
                    </button>
                  ))}
                </div>
              )}

              {aba && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      {...plainFieldProps}
                      value={aba.title}
                      onChange={(e) =>
                        setWorkouts((prev) =>
                          prev.map((w, i) => (i === activeTab ? { ...w, title: e.target.value } : w)),
                        )
                      }
                      aria-label="Nome do treino"
                      className="flex-1 min-w-0 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeWorkout(activeTab)}
                      aria-label="Descartar este treino"
                      className="tap-44 w-10 h-10 inline-flex items-center justify-center rounded-xl border border-red-500/25 text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {aba.exercises.map((ex) => (
                    <ExerciseReviewCard
                      key={ex.id}
                      ex={ex}
                      onChange={(patch) => patchExercise(activeTab, ex.id, patch)}
                      onRemove={() => removeExercise(activeTab, ex.id)}
                    />
                  ))}

                  {!aba.exercises.length && (
                    <p className="text-xs text-neutral-400 text-center py-4">
                      Nenhum exercício neste treino.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé */}
        {(phase === 'select' || phase === 'review') && (
          <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-white/5">
            {phase === 'select' ? (
              <button
                type="button"
                disabled={!files.length}
                onClick={extrair}
                className="w-full min-h-[48px] rounded-xl bg-yellow-500 text-black font-black text-sm disabled:opacity-40 active:scale-[0.99] transition-transform"
              >
                Ler ficha ({files.length})
              </button>
            ) : (
              <button
                type="button"
                disabled={!totalExercicios}
                onClick={confirmar}
                className="w-full min-h-[48px] rounded-xl bg-yellow-500 text-black font-black text-sm disabled:opacity-40 active:scale-[0.99] transition-transform"
              >
                Criar {workouts.filter((w) => w.exercises.length).length} treino(s) · {totalExercicios} exercícios
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card de revisão ──────────────────────────────────────────────────────────

function ExerciseReviewCard({
  ex,
  onChange,
  onRemove,
}: {
  ex: ImportedExercise
  onChange: (patch: Partial<ImportedExercise>) => void
  onRemove: () => void
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="flex-1 min-w-0 text-left"
        >
          <div className="text-sm font-bold text-white truncate">{ex.name}</div>
          <div className="text-[11px] text-neutral-400 truncate">{exerciseSummary(ex)}</div>
          {/* A ficha dizia outra coisa: mostrar evita o "isso não é o que eu escrevi". */}
          {ex.originalName && (
            <div className="text-[10px] text-neutral-400 truncate mt-0.5">
              na ficha: {ex.originalName}
            </div>
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${ex.name}`}
          className="tap-44 w-8 h-8 inline-flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-400 transition-colors shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {aberto && (
        <div className="px-3 pb-3 pt-1 border-t border-neutral-800/80 space-y-2">
          <label className="block">
            <span className="text-[10px] t-meta">Exercício</span>
            <input
              {...properNameFieldProps}
              value={ex.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="mt-1 w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <NumField label="Séries" value={ex.sets} onChange={(v) => onChange({ sets: v })} />
            <TextField label="Reps" value={ex.reps} onChange={(v) => onChange({ reps: v })} />
            <NumField label="Peso (kg)" value={ex.weightKg} onChange={(v) => onChange({ weightKg: v })} decimal />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumField label="RPE" value={ex.rpe} onChange={(v) => onChange({ rpe: v })} decimal />
            <NumField label="Descanso (s)" value={ex.restSeconds} onChange={(v) => onChange({ restSeconds: v })} />
            <TextField label="Cadência" value={ex.cadence} onChange={(v) => onChange({ cadence: v })} />
          </div>

          <label className="block">
            <span className="text-[10px] t-meta">Observação</span>
            <input
              {...plainFieldProps}
              value={ex.notes ?? ''}
              onChange={(e) => onChange({ notes: e.target.value || null })}
              className="mt-1 w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
            />
          </label>
        </div>
      )}
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
  decimal = false,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  decimal?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[10px] t-meta">{label}</span>
      <input
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.').trim()
          if (!raw) return onChange(null)
          const n = Number(raw)
          onChange(Number.isFinite(n) ? n : null)
        }}
        aria-label={label}
        className="mt-1 w-full bg-black/30 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-white text-center outline-none focus:ring-1 ring-yellow-500"
      />
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <label className="block">
      <span className="text-[10px] t-meta">{label}</span>
      <input
        {...plainFieldProps}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={label}
        className="mt-1 w-full bg-black/30 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-white text-center outline-none focus:ring-1 ring-yellow-500"
      />
    </label>
  )
}
