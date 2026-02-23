'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, Sparkles } from 'lucide-react'
import { useVipCredits } from '@/hooks/useVipCredits'
import { getErrorMessage } from '@/utils/errorMessage'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

export type WorkoutWizardGoal = 'hypertrophy' | 'strength' | 'conditioning' | 'maintenance'
export type WorkoutWizardSplit = 'full_body' | 'upper_lower' | 'ppl'
export type WorkoutWizardLevel = 'beginner' | 'intermediate' | 'advanced'
export type WorkoutWizardFocus = 'balanced' | 'upper' | 'lower' | 'push' | 'pull' | 'legs'
export type WorkoutWizardEquipment = 'gym' | 'home' | 'minimal'

export type WorkoutWizardAnswers = {
  goal: WorkoutWizardGoal
  split: WorkoutWizardSplit
  daysPerWeek: 2 | 3 | 4 | 5 | 6
  timeMinutes: 30 | 45 | 60 | 90 | 120
  equipment: WorkoutWizardEquipment
  level: WorkoutWizardLevel
  focus: WorkoutWizardFocus
  constraints: string
}

export type WorkoutDraft = {
  title: string
  exercises: unknown[]
}

type MaybePromise<T> = T | Promise<T>

type GenerateMode = 'single' | 'program'

type GenerateResult = WorkoutDraft | { drafts: WorkoutDraft[] }

type Props = {
  isOpen: boolean
  onClose: () => void
  onManual: () => void
  onGenerate: (answers: WorkoutWizardAnswers, options?: { mode?: GenerateMode }) => MaybePromise<GenerateResult>
  onUseDraft: (draft: WorkoutDraft) => void
  onSaveDrafts?: (drafts: WorkoutDraft[]) => MaybePromise<void>
}

const clampDays = (n: number): 2 | 3 | 4 | 5 | 6 => {
  if (n <= 2) return 2
  if (n >= 6) return 6
  if (n === 3) return 3
  if (n === 4) return 4
  return 5
}

const titleGoal = (g: WorkoutWizardGoal) =>
  g === 'hypertrophy' ? 'Hipertrofia' : g === 'strength' ? 'Força' : g === 'conditioning' ? 'Condicionamento' : 'Manutenção'

const titleSplit = (s: WorkoutWizardSplit) => (s === 'full_body' ? 'Full Body' : s === 'upper_lower' ? 'Upper/Lower' : 'PPL')

const titleLevel = (l: WorkoutWizardLevel) => (l === 'beginner' ? 'Iniciante' : l === 'intermediate' ? 'Intermediário' : 'Avançado')

const titleFocus = (f: WorkoutWizardFocus) =>
  f === 'balanced'
    ? 'Equilibrado'
    : f === 'upper'
      ? 'Parte superior'
      : f === 'lower'
        ? 'Parte inferior'
        : f === 'push'
          ? 'Push'
          : f === 'pull'
            ? 'Pull'
            : 'Pernas'

const titleEquipment = (e: WorkoutWizardEquipment) => (e === 'gym' ? 'Academia' : e === 'home' ? 'Casa' : 'Mínimo (halteres/elástico)')

export default function WorkoutWizardModal(props: Props) {
  const { credits: creditsRaw, loading: creditsLoading, error: creditsError } = useVipCredits() as { credits: unknown; loading: boolean; error: string | null }
  const credits = creditsRaw as Record<string, Record<string, number>> | null | undefined
  const isOpen = !!props.isOpen
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<GenerateMode>('single')
  const [answers, setAnswers] = useState<WorkoutWizardAnswers>(() => ({
    goal: 'hypertrophy',
    split: 'full_body',
    daysPerWeek: 3,
    timeMinutes: 45,
    equipment: 'gym',
    level: 'beginner',
    focus: 'balanced',
    constraints: '',
  }))
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<WorkoutDraft | null>(null)
  const [drafts, setDrafts] = useState<WorkoutDraft[] | null>(null)
  const [draftIdx, setDraftIdx] = useState(0)
  const [savingAll, setSavingAll] = useState(false)
  const [error, setError] = useState('')

  const canBack = step > 0
  const canNext = step < 4

  useEffect(() => {
    if (!isOpen) return
    setStep(0)
    setMode('single')
    setDraft(null)
    setDrafts(null)
    setDraftIdx(0)
    setError('')
    setGenerating(false)
    setSavingAll(false)

    try {
      const raw = window.localStorage.getItem('irontracks_wizard_prefill_v1')
      if (raw) {
        window.localStorage.removeItem('irontracks_wizard_prefill_v1')
        const parsed = parseJsonWithSchema(raw, z.record(z.unknown()))
        const extra = parsed && typeof parsed === 'object' ? String(parsed?.constraints || '').trim() : ''
        if (extra) {
          setAnswers((prev) => ({ ...prev, constraints: prev.constraints ? `${prev.constraints}\n\n${extra}` : extra }))
        }
      }
    } catch {}
  }, [isOpen])

  const previewTitle = useMemo(() => {
    return `${titleGoal(answers.goal)} • ${titleSplit(answers.split)} • ${answers.timeMinutes}min`
  }, [answers.goal, answers.split, answers.timeMinutes])

  const goBack = () => {
    if (!canBack) return
    setError('')
    setStep((s) => Math.max(0, s - 1))
  }

  const goNext = () => {
    if (!canNext) return
    setError('')
    setStep((s) => Math.min(4, s + 1))
  }

  const doGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setError('')
    setDraft(null)
    setDrafts(null)
    setDraftIdx(0)
    try {
      const res = await Promise.resolve(props.onGenerate(answers, { mode }))
      const many = res && typeof res === 'object' && Array.isArray((res as Record<string, unknown>)?.drafts) ? ((res as Record<string, unknown>).drafts as WorkoutDraft[]) : null
      if (many && many.length) {
        const safe = many
          .map((d) => ({
            title: String(d?.title || '').trim() || 'Treino',
            exercises: Array.isArray(d?.exercises) ? d.exercises : [],
          }))
          .filter((d) => d.exercises.length > 0)
        if (!safe.length) {
          setError('Não consegui montar um plano com esses parâmetros.')
          return
        }
        setDrafts(safe)
        setDraftIdx(0)
      } else {
        const d = res as Record<string, unknown>
        const title = String(d?.title || '').trim() || 'Treino'
        const exercises = Array.isArray(d?.exercises) ? d.exercises : []
        if (!exercises.length) {
          setError('Não consegui montar um treino com esses parâmetros.')
          setDraft(null)
          return
        }
        setDraft({ title, exercises })
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao gerar treino.')
      setDraft(null)
      setDrafts(null)
    } finally {
      setGenerating(false)
    }
  }

  const doSaveAll = async () => {
    if (savingAll) return
    const list = Array.isArray(drafts) ? drafts : []
    if (!list.length) return
    if (!props.onSaveDrafts) return
    setSavingAll(true)
    setError('')
    try {
      await Promise.resolve(props.onSaveDrafts(list))
    } catch (e: unknown) {
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao salvar treinos.')
    } finally {
      setSavingAll(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500 flex items-center gap-2">
              Criar Treino
              {credits?.wizard && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono text-white ${credits.wizard.used >= credits.wizard.limit ? 'bg-red-500/40' : 'bg-neutral-800'}`}>
                  {credits.wizard.used}/{credits.wizard.limit > 1000 ? '∞' : credits.wizard.limit}
                </span>
              )}
            </div>
            <div className="text-white font-black text-lg truncate">Wizard Automático</div>
            <div className="text-xs text-neutral-400">Responda rápido e gere um treino pronto para editar.</div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-2">
          <div className="text-xs text-neutral-400 font-bold">Etapa {step + 1} de 5</div>
          <div className="text-xs text-neutral-500 font-mono">{previewTitle}</div>
        </div>

        <div className="p-4 space-y-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
          {step === 0 ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-sm font-black text-white">Como você quer criar?</div>
                <div className="mt-1 text-xs text-neutral-400">Você pode gerar automaticamente e ajustar no editor.</div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      props.onClose()
                      props.onManual()
                    }}
                    className="min-h-[52px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                  >
                    Criar manualmente
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="min-h-[52px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 flex items-center justify-center gap-2"
                  >
                    <Sparkles size={16} /> Criar automaticamente
                  </button>
                </div>
                <div className="mt-4">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Modo de geração</div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('single')}
                      className={
                        mode === 'single'
                          ? 'min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                          : 'min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                      }
                    >
                      Treino único
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('program')}
                      className={
                        mode === 'program'
                          ? 'min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                          : 'min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                      }
                    >
                      Plano semanal
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Objetivo</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(['hypertrophy', 'strength', 'conditioning', 'maintenance'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, goal: g }))}
                      className={
                        answers.goal === g
                          ? 'min-h-[52px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                          : 'min-h-[52px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                      }
                    >
                      {titleGoal(g)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Divisão & Frequência</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['full_body', 'upper_lower', 'ppl'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, split: s }))}
                      className={
                        answers.split === s
                          ? 'min-h-[52px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                          : 'min-h-[52px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                      }
                    >
                      {titleSplit(s)}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Dias por semana</div>
                    <div className="text-xs text-neutral-400">Ajuda a escolher volume e rotatividade.</div>
                  </div>
                  <select
                    value={answers.daysPerWeek}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, daysPerWeek: clampDays(Number(e.target.value)) }))}
                    className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={String(n)} value={String(n)}>
                        {n}x
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Tempo & Equipamento</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {([30, 45, 60, 90, 120] as const).map((m) => (
                    <button
                      key={String(m)}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, timeMinutes: m }))}
                      className={
                        answers.timeMinutes === m
                          ? 'min-h-[44px] px-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                          : 'min-h-[44px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                      }
                    >
                      {m} min
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['gym', 'home', 'minimal'] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, equipment: e }))}
                      className={
                        answers.equipment === e
                          ? 'min-h-[52px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                          : 'min-h-[52px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                      }
                    >
                      {titleEquipment(e)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Preferências</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['beginner', 'intermediate', 'advanced'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, level: l }))}
                      className={
                        answers.level === l
                          ? 'min-h-[52px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                          : 'min-h-[52px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                      }
                    >
                      {titleLevel(l)}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['balanced', 'upper', 'lower', 'push', 'pull', 'legs'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, focus: f }))}
                      className={
                        answers.focus === f
                          ? 'min-h-[44px] px-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                          : 'min-h-[44px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                      }
                    >
                      {titleFocus(f)}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="text-sm font-bold text-white">Preferências e restrições (opcional)</div>
                  <div className="text-xs text-neutral-400">Ex.: foco em deltoide lateral, evitar overhead, dor no joelho, sem barra.</div>
                  <textarea
                    value={answers.constraints}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, constraints: e.target.value }))}
                    rows={3}
                    className="mt-2 w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none"
                    placeholder="Escreva aqui preferências e restrições..."
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-sm font-black text-white">Preview</div>
                <div className="text-xs text-neutral-400 mt-1">Gere e depois abra no editor para ajustar.</div>
                
                {creditsLoading && (
                  <div className="mt-3 flex items-center justify-center bg-neutral-900/60 p-2 rounded-lg border border-neutral-800">
                    <div className="text-xs text-neutral-500 animate-pulse">Carregando créditos...</div>
                  </div>
                )}

                {creditsError && (
                  <div className="mt-3 flex items-center justify-center bg-red-900/20 p-2 rounded-lg border border-red-900/50">
                    <div className="text-xs text-red-400">Erro: {creditsError}</div>
                  </div>
                )}

                {credits?.wizard && (
                  <div className="mt-3 flex items-center justify-between bg-neutral-900/60 p-2 rounded-lg border border-neutral-800">
                    <div className="text-xs text-neutral-400 font-bold">Seus créditos semanais</div>
                    <div className={`text-xs font-mono font-bold ${credits.wizard.used >= credits.wizard.limit ? 'text-red-400' : 'text-green-400'}`}>
                      {credits.wizard.used} / {credits.wizard.limit > 1000 ? '∞' : credits.wizard.limit}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={doGenerate}
                    disabled={generating}
                    className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 disabled:opacity-70"
                  >
                    {generating ? 'Gerando...' : mode === 'program' ? `Gerar plano (${answers.daysPerWeek} treinos)` : 'Gerar treino'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (drafts && drafts.length) {
                        const d = drafts[Math.max(0, Math.min(drafts.length - 1, draftIdx))]
                        if (!d) return
                        props.onClose()
                        props.onUseDraft(d)
                        return
                      }
                      if (!draft) return
                      props.onClose()
                      props.onUseDraft(draft)
                    }}
                    disabled={!draft && !(drafts && drafts.length)}
                    className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {drafts && drafts.length ? 'Abrir dia selecionado' : 'Abrir no editor'}
                  </button>
                  {mode === 'program' && drafts && drafts.length && props.onSaveDrafts ? (
                    <button
                      type="button"
                      onClick={doSaveAll}
                      disabled={savingAll || generating}
                      className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-50"
                    >
                      {savingAll ? 'Salvando...' : 'Salvar todos'}
                    </button>
                  ) : null}
                </div>
                {error ? (
                  <div className="mt-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{error}</div>
                ) : null}
                {drafts && drafts.length ? (
                  <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Plano semanal</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {drafts.map((d, idx) => (
                        <button
                          key={`${String(d?.title || idx)}-${idx}`}
                          type="button"
                          onClick={() => setDraftIdx(idx)}
                          className={
                            draftIdx === idx
                              ? 'min-h-[36px] px-3 rounded-xl bg-yellow-500 text-black font-black text-[11px] uppercase tracking-widest'
                              : 'min-h-[36px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-[11px] uppercase tracking-widest hover:bg-neutral-800'
                          }
                        >
                          Dia {idx + 1}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const d = drafts[Math.max(0, Math.min(drafts.length - 1, draftIdx))]
                      if (!d) return null
                      const safeExercises = (Array.isArray(d?.exercises) ? d.exercises : []) as Record<string, unknown>[]
                      return (
                        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                          <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{d.title}</div>
                          <div className="mt-2 space-y-2">
                            {safeExercises.slice(0, 10).map((ex, idx) => (
                              <div key={String(ex?.name || idx)} className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-white truncate">{String(ex?.name || 'Exercício')}</div>
                                  <div className="text-xs text-neutral-400">
                                    {String(ex?.sets ?? '')} séries • {String(ex?.reps ?? '')} reps
                                  </div>
                                </div>
                              </div>
                            ))}
                            {safeExercises.length > 10 ? <div className="text-xs text-neutral-500">+ mais {safeExercises.length - 10}</div> : null}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                ) : draft ? (
                  <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{draft.title}</div>
                    <div className="mt-2 space-y-2">
                      {(Array.isArray(draft?.exercises) ? draft.exercises as Record<string, unknown>[] : []).slice(0, 10).map((ex, idx) => (
                        <div key={String(ex?.name || idx)} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">{String(ex?.name || 'Exercício')}</div>
                            <div className="text-xs text-neutral-400">
                              {String(ex?.sets ?? '')} séries • {String(ex?.reps ?? '')} reps
                            </div>
                          </div>
                        </div>
                      ))}
                      {(Array.isArray(draft?.exercises) ? draft.exercises : []).length > 10 ? (
                        <div className="text-xs text-neutral-500">+ mais {(Array.isArray(draft?.exercises) ? draft.exercises : []).length - 10}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
          {canBack ? (
            <button
              type="button"
              onClick={goBack}
              className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 inline-flex items-center gap-2"
            >
              <ChevronLeft size={16} />
              Voltar
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {step < 4 ? (
              <button
                type="button"
                onClick={goNext}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400"
              >
                Continuar
              </button>
            ) : null}
            {step === 4 ? (
              <button
                type="button"
                onClick={props.onClose}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
              >
                Fechar
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
