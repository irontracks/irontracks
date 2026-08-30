'use client'
// v2: voice workout integration
import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles, Loader2, Wand2, Mic, Camera } from 'lucide-react'
import dynamic from 'next/dynamic'
import { type VoiceExerciseDraft } from './VoiceWorkoutModal'
import { type ImportedWorkout } from './WorkoutPhotoImportModal'
import { METHOD_TO_EDITOR } from '@/utils/ai/workoutPhotoNormalize'
// Lazy: o VoiceWorkoutModal (854 linhas + deps de áudio/IA) só carrega quando o usuário abre
// a captura por voz (showVoice) — sai do chunk inicial do Wizard.
const VoiceWorkoutModal = dynamic(() => import('./VoiceWorkoutModal'), { ssr: false })
// Mesmo motivo do lazy acima: o import por foto carrega upload + compressão de
// imagem, peso morto para quem nunca abre a opção.
const WorkoutPhotoImportModal = dynamic(() => import('./WorkoutPhotoImportModal'), { ssr: false })
import { trackUserEvent } from '@/lib/telemetry/userActivity'
import { VipUpsellCard } from '@/components/vip/VipUpsellCard'
import { useVipCredits } from '@/hooks/useVipCredits'
import { useFocusTrap } from '@/hooks/useFocusTrap'
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
  /**
   * Abre já no import por foto/PDF, pulando a lista de entradas.
   *
   * Existe pelo funil: de quem nunca criou um treino, 13 chegam ao dashboard e
   * só 4 abrem o editor. Quem chega com a ficha do personal na mão não deveria
   * ter de descobrir que ela cabe aqui — o atalho entra no estado VAZIO da
   * lista, ao lado de "Criar meu primeiro treino".
   */
  abrirImportDeFoto?: boolean
}

const clampDays = (n: number): 2 | 3 | 4 | 5 | 6 => {
  if (n <= 2) return 2
  if (n >= 6) return 6
  if (n === 3) return 3
  if (n === 4) return 4
  return 5
}

// ── Step data ──────────────────────────────────────────────────────────
const STEP_META = [
  { icon: '🚀', label: 'Modo' },
  { icon: '🎯', label: 'Objetivo' },
  { icon: '🔀', label: 'Divisão' },
  { icon: '⏱️', label: 'Tempo' },
  { icon: '✨', label: 'Gerar' },
] as const

// ── Option Card ────────────────────────────────────────────────────────
type OptionCardProps = {
  emoji: string
  title: string
  desc?: string
  selected: boolean
  onClick: () => void
  compact?: boolean
}

function OptionCard({ emoji, title, desc, selected, onClick, compact }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left rounded-xl transition-all duration-200 active:scale-[0.97] ${
        compact ? 'px-3 py-2.5' : 'px-4 py-3'
      } ${
        selected
          ? 'bg-yellow-500/10 border-yellow-500/60 text-white ring-1 ring-yellow-500/30'
          : 'bg-neutral-900/60 border-neutral-800 text-neutral-300 hover:bg-neutral-800/70 hover:border-neutral-700'
      } border`}
      style={selected ? { boxShadow: '0 0 12px rgba(234,179,8,0.12)' } : undefined}
    >
      <span className="flex items-center gap-2.5">
        <span className={`text-base ${compact ? 'text-sm' : ''}`}>{emoji}</span>
        <span className="flex flex-col gap-0">
          <span className={`font-black ${compact ? 'text-xs' : 'text-sm'} ${selected ? 'text-yellow-400' : 'text-white'}`}>
            {title}
          </span>
          {desc && <span className="text-[10px] text-neutral-400 leading-tight">{desc}</span>}
        </span>
      </span>
      {selected && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-yellow-500" style={{ boxShadow: '0 0 6px rgba(234,179,8,0.6)' }} />
      )}
    </button>
  )
}

// ── Progress Bar ───────────────────────────────────────────────────────
function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1 w-full">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={`h-1 w-full rounded-full transition-all duration-500 ${
              i <= current
                ? 'bg-gradient-to-r from-yellow-600 to-yellow-400'
                : 'bg-neutral-800'
            }`}
            style={i <= current ? { boxShadow: '0 0 6px rgba(234,179,8,0.3)' } : undefined}
          />
          <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors duration-300 ${
            i === current ? 'text-yellow-400' : i < current ? 'text-yellow-600' : 'text-neutral-400'
          }`}>
            {STEP_META[i]?.icon} {STEP_META[i]?.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Title helpers ──────────────────────────────────────────────────────
const titleGoal = (g: WorkoutWizardGoal) =>
  g === 'hypertrophy' ? 'Hipertrofia' : g === 'strength' ? 'Força' : g === 'conditioning' ? 'Condicionamento' : 'Manutenção'

const titleSplit = (s: WorkoutWizardSplit) => (s === 'full_body' ? 'Full Body' : s === 'upper_lower' ? 'Upper/Lower' : 'PPL')

const titleLevel = (l: WorkoutWizardLevel) => (l === 'beginner' ? 'Iniciante' : l === 'intermediate' ? 'Intermediário' : 'Avançado')

const titleFocus = (f: WorkoutWizardFocus) =>
  f === 'balanced' ? 'Equilibrado' : f === 'upper' ? 'Parte superior' : f === 'lower' ? 'Parte inferior' : f === 'push' ? 'Push' : f === 'pull' ? 'Pull' : 'Pernas'

const titleEquipment = (e: WorkoutWizardEquipment) => (e === 'gym' ? 'Academia' : e === 'home' ? 'Casa' : 'Mínimo')

// ── Voice → WorkoutDraft conversion ───────────────────────────────────
function voiceToWorkoutDraft(exercises: VoiceExerciseDraft[]): WorkoutDraft {
  return {
    title: 'Treino por Voz',
    exercises: exercises.map((e) => {
      const noteParts: string[] = []
      if (e.weightKg != null) noteParts.push(`${e.weightKg}kg`)
      if (e.notes) noteParts.push(e.notes)
      return {
        id: e.id,
        name: e.name,
        sets: e.sets ?? 3,
        reps: e.reps,
        rpe: e.rpe,
        method: e.method,
        restTime: e.restSeconds,
        cadence: e.cadence,
        notes: noteParts.length ? noteParts.join(' • ') : null,
      }
    }),
  }
}

/**
 * Ficha importada → drafts do wizard.
 *
 * O peso lido da ficha vai para as NOTAS, não para uma coluna de carga: o
 * template guarda o PLANO (o que fazer), e a carga real de cada série nasce na
 * sessão. Gravar 60kg no template faria o motor de carga automática competir
 * com um número que veio de um papel, possivelmente de meses atrás.
 */
function importedToWorkoutDrafts(workouts: ImportedWorkout[]): WorkoutDraft[] {
  return workouts.map((w) => ({
    title: w.title,
    exercises: w.exercises.map((e) => {
      const noteParts: string[] = []
      if (e.weightKg != null) noteParts.push(`${e.weightKg}kg`)
      if (e.notes) noteParts.push(e.notes)
      return {
        id: e.id,
        name: e.name,
        sets: e.sets ?? 3,
        reps: e.reps,
        rpe: e.rpe,
        method: e.method ? METHOD_TO_EDITOR[e.method] : null,
        restTime: e.restSeconds,
        cadence: e.cadence,
        notes: noteParts.length ? noteParts.join(' • ') : null,
      }
    }),
  }))
}

// ── Main Component ─────────────────────────────────────────────────────
export default function WorkoutWizardModal(props: Props) {
  const { credits, loading: creditsLoading, error: creditsError } = useVipCredits()
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
  const [showVoice, setShowVoice] = useState(false)
  const [showPhotoImport, setShowPhotoImport] = useState(false)

  // Abre direto no import quando o atalho do estado vazio pediu. Depende de
  // `isOpen` também: sem isso, fechar o import deixaria a flag ligada e ele
  // reabriria sozinho na próxima vez que o wizard subisse.
  useEffect(() => {
    if (props.isOpen && props.abrirImportDeFoto) setShowPhotoImport(true)
  }, [props.isOpen, props.abrirImportDeFoto])
  /** Limite semanal batido → card de venda inline (era um confirm() seco). */
  const [showUpsell, setShowUpsell] = useState(false)

  // WCAG 2.4.3 + 2.1.2 — Escape fecha (a menos que gerando/salvando) + focus trap
  const focusTrapRef = useFocusTrap(isOpen, (generating || savingAll) ? undefined : props.onClose)

  const canBack = step > 0
  const canNext = step < 4
  const formatLimit = (limit: number | null | undefined) => (limit == null ? '∞' : limit > 1000 ? '∞' : limit)
  const isWizardExhausted = (entry?: { used: number; limit: number | null }) => !!entry && entry.limit !== null && entry.used >= entry.limit

  /**
   * Funil de criação de treino (ago/2026).
   *
   * A telemetria pulava do clique em "Novo treino" direto para `workout_create`
   * — nada no meio. Medido em 01/08: 29 pessoas clicaram, só 14 chegaram a
   * salvar. Metade sumia aqui dentro e não havia como saber onde: uma aluna
   * clicou 8 vezes em dias diferentes e nunca criou um treino.
   *
   * `deepestStepRef` guarda o passo mais fundo alcançado, não o atual — quem
   * chega no 3 e volta pro 1 antes de desistir travou no 3, não no 1.
   */
  const deepestStepRef = React.useRef(0)
  /** `true` depois que a pessoa pediu um treino à IA — separa quem tentou de quem só espiou. */
  const hasStartedRef = React.useRef(false)
  /** Último erro visto: distingue desistência de fracasso do produto. */
  const lastErrorRef = React.useRef<string>('')
  const outcomeRef = React.useRef<'pending' | 'manual' | 'draft_used' | 'drafts_saved'>('pending')

  useEffect(() => { if (step > deepestStepRef.current) deepestStepRef.current = step }, [step])

  useEffect(() => {
    if (!isOpen) return
    deepestStepRef.current = 0
    outcomeRef.current = 'pending'
    hasStartedRef.current = false
    lastErrorRef.current = ''
    try { trackUserEvent('wizard_open', { type: 'wizard', screen: 'create_workout' }) } catch { }
    setStep(0)
    setMode('single')
    setDraft(null)
    setDrafts(null)
    setDraftIdx(0)
    setError('')
    setGenerating(false)
    setSavingAll(false)
    setShowUpsell(false)

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
    } catch { }
  }, [isOpen])

  // Abandono é medido no FECHAMENTO, com o passo mais fundo alcançado. É o
  // único evento que responde "onde ela desistiu?" — a pergunta que a
  // instrumentação antiga não conseguia sequer formular.
  useEffect(() => {
    if (isOpen) return
    if (outcomeRef.current !== 'pending') return
    // ⚠️ Abrir e fechar na etapa 0 TAMBÉM conta — a guarda que descartava esse
    // caso escondia justamente o mais comum. Medido em 30/08/2026: 53 aberturas
    // do wizard, 12 treinos criados e apenas **3 abandonos registrados**. As
    // outras 38 saídas não deixavam rastro nenhum, e sem elas não dá para
    // separar "abriu sem querer" de "olhou a primeira tela e desistiu" — que
    // pedem respostas opostas.
    //
    // O ruído não some: ele fica IDENTIFICÁVEL. `interagiu` separa quem mexeu
    // em alguma resposta de quem só viu a tela; filtrar por ele devolve o
    // número antigo, e ignorá-lo devolve o total.
    try {
      trackUserEvent('wizard_abandoned', {
        type: 'wizard', screen: 'create_workout',
        metadata: {
          deepestStep: deepestStepRef.current,
          hadError: lastErrorRef.current || null,
          interagiu: hasStartedRef.current,
        },
      })
    } catch { }
  }, [isOpen])

  const goBack = () => { if (canBack) { setError(''); setStep((s) => Math.max(0, s - 1)) } }
  const goNext = () => { if (canNext) { setError(''); setStep((s) => Math.min(4, s + 1)) } }

  /** A IA falhou: registra o MOTIVO. Sem isso, "não criou treino" e "o produto
   *  não conseguiu montar" viram o mesmo número. */
  const failGenerate = (reason: string, message: string) => {
    lastErrorRef.current = reason
    setError(message)
    try { trackUserEvent('wizard_generate_fail', { type: 'wizard', screen: 'create_workout', metadata: { reason } }) } catch { }
  }

  const okGenerate = (count: number) => {
    try { trackUserEvent('wizard_generate_ok', { type: 'wizard', screen: 'create_workout', metadata: { drafts: count } }) } catch { }
  }

  const doGenerate = async () => {
    if (generating) return
    const wizardCredits = credits?.wizard
    if (isWizardExhausted(wizardCredits)) {
      // Paywall que VENDE (02/08/2026): o momento de maior desejo — a pessoa
      // acabou de PEDIR um treino — era respondido por um confirm() de sistema.
      // O card lista o que cada plano destrava e mede impressão/clique.
      setShowUpsell(true)
      return
    }
    setGenerating(true)
    setError('')
    setDraft(null)
    setDrafts(null)
    setDraftIdx(0)
    hasStartedRef.current = true
    try { trackUserEvent('wizard_generate_start', { type: 'wizard', screen: 'create_workout', metadata: { mode } }) } catch { }
    try {
      const res = await Promise.resolve(props.onGenerate(answers, { mode }))
      const many = res && typeof res === 'object' && Array.isArray((res as Record<string, unknown>)?.drafts) ? ((res as Record<string, unknown>).drafts as WorkoutDraft[]) : null
      if (many && many.length) {
        const safe = many
          .map((d) => ({ title: String(d?.title || '').trim() || 'Treino', exercises: Array.isArray(d?.exercises) ? d.exercises : [] }))
          .filter((d) => d.exercises.length > 0)
        if (!safe.length) { failGenerate('empty_plan', 'Não consegui montar um plano com esses parâmetros.'); return }
        setDrafts(safe)
        setDraftIdx(0)
        okGenerate(safe.length)
      } else {
        const d = res as Record<string, unknown>
        const title = String(d?.title || '').trim() || 'Treino'
        const exercises = Array.isArray(d?.exercises) ? d.exercises : []
        if (!exercises.length) { failGenerate('empty_workout', 'Não consegui montar um treino com esses parâmetros.'); setDraft(null); return }
        setDraft({ title, exercises })
        okGenerate(1)
      }
    } catch (e: unknown) {
      failGenerate('exception', getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao gerar treino.')
      setDraft(null)
      setDrafts(null)
    } finally {
      setGenerating(false)
    }
  }

  const doSaveAll = async () => {
    if (savingAll) return
    const list = Array.isArray(drafts) ? drafts : []
    if (!list.length || !props.onSaveDrafts) return
    setSavingAll(true)
    setError('')
    outcomeRef.current = 'drafts_saved'
    try { trackUserEvent('wizard_drafts_saved', { type: 'wizard', screen: 'create_workout', metadata: { count: list.length } }) } catch { }
    try { await Promise.resolve(props.onSaveDrafts(list)) } catch (e: unknown) {
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao salvar treinos.')
    } finally { setSavingAll(false) }
  }

  if (!isOpen) return null

  // ── Step subtitles ───────────────────────────────────────────────────
  const stepSubtitles = [
    'Escolha como criar seu treino',
    'Defina o foco principal do seu treino',
    'Configure a divisão e frequência semanal',
    'Escolha duração e local de treino',
    'Últimos detalhes antes de gerar',
  ]

  // ── Render helpers ───────────────────────────────────────────────────
  const renderExerciseList = (exercises: unknown[], limit = 10) => {
    const exs = (Array.isArray(exercises) ? exercises : []) as Record<string, unknown>[]
    return (
      <div className="space-y-1.5">
        {exs.slice(0, limit).map((ex, idx) => (
          <div key={String(ex?.name || idx)} className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-neutral-900/40">
            <span className="text-[10px] font-mono text-yellow-600 w-5 text-center">{idx + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white truncate">{String(ex?.name || 'Exercício')}</div>
              <div className="text-[11px] text-neutral-400">{String(ex?.sets ?? '')} séries • {String(ex?.reps ?? '')} reps</div>
            </div>
          </div>
        ))}
        {exs.length > limit && <div className="text-xs text-neutral-400 text-center py-1">+ mais {exs.length - limit}</div>}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 pt-safe" style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)' }} role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div
        ref={focusTrapRef}
        className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(15,14,10,0.99) 0%, rgba(10,10,10,0.99) 100%)',
          border: '1px solid rgba(234,179,8,0.15)',
          boxShadow: '0 0 60px rgba(234,179,8,0.06), 0 32px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="p-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Image src="/icons/btn-novo-treino.png" alt="" width={28} height={28} className="rounded-lg" />
                <div>
                  <div className="flex items-center gap-2">
                    <span id="wizard-title" className="text-sm font-black text-white">Criar Treino</span>
                    {credits?.wizard && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${isWizardExhausted(credits.wizard) ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}>
                        {credits.wizard.used}/{formatLimit(credits.wizard.limit)} créditos
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">{stepSubtitles[step]}</div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              className="tap-44 w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white transition-all active:scale-90"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              aria-label="Voltar"
              title="Voltar"
            >
              <ArrowLeft size={16} />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <StepProgress current={step} total={5} />
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────────── */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">

          {/* STEP 0: Modo de Criação */}
          {showUpsell && (
            <div className="px-1 py-2">
              <VipUpsellCard feature="wizard" onDismiss={() => setShowUpsell(false)} />
            </div>
          )}
          {!showUpsell && step === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Manual */}
                <button
                  type="button"
                  onClick={() => {
                    outcomeRef.current = 'manual'
                    try { trackUserEvent('wizard_manual_chosen', { type: 'wizard', screen: 'create_workout' }) } catch { }
                    props.onClose(); props.onManual()
                  }}
                  className="group text-left rounded-xl p-4 bg-neutral-900/60 border border-neutral-800 hover:border-neutral-600 transition-all active:scale-[0.97]"
                >
                  <span className="text-2xl">📝</span>
                  <div className="mt-2 font-black text-sm text-white">Criar Manualmente</div>
                  <div className="text-[11px] text-neutral-400 mt-1">Monte exercício por exercício no editor completo.</div>
                </button>
                {/* IA Auto */}
                <button
                  type="button"
                  onClick={goNext}
                  className="btn-shimmer-sweep group text-left rounded-xl p-4 border transition-all active:scale-[0.97]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(234,179,8,0.08) 0%, rgba(234,179,8,0.02) 100%)',
                    border: '1px solid rgba(234,179,8,0.3)',
                    boxShadow: '0 0 20px rgba(234,179,8,0.08)',
                  }}
                >
                  <span className="text-2xl">✨</span>
                  <div className="mt-2 font-black text-sm text-yellow-400 flex items-center gap-1.5">
                    <Sparkles size={14} />
                    IA Automática
                  </div>
                  <div className="text-[11px] text-yellow-600/80 mt-1">Responda 4 perguntas e a IA monta tudo pra você.</div>
                </button>
              </div>

              {/* Por Voz */}
              <button
                type="button"
                aria-label="Criar treino por voz"
                onClick={() => setShowVoice(true)}
                className="group w-full text-left rounded-xl p-4 border transition-all active:scale-[0.97]"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.02) 100%)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  boxShadow: '0 0 20px rgba(245,158,11,0.06)',
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
                    <Mic size={20} className="text-amber-400" />
                  </span>
                  <div>
                    <div className="font-black text-sm text-amber-400">Por Voz</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">Dite os exercícios e a IA transcreve e estrutura automaticamente.</div>
                  </div>
                </div>
              </button>

              {/* Por Foto/PDF — mesma forma do "Por Voz": entrada que abre um
                  modal próprio, em vez de entrar no fluxo de 4 perguntas. */}
              <button
                type="button"
                aria-label="Importar treino por foto ou PDF"
                onClick={() => setShowPhotoImport(true)}
                className="group w-full text-left rounded-xl p-4 border transition-all active:scale-[0.97]"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.02) 100%)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  boxShadow: '0 0 20px rgba(245,158,11,0.06)',
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
                    <Camera size={20} className="text-amber-400" />
                  </span>
                  <div>
                    <div className="font-black text-sm text-amber-400">Por Foto/PDF</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">Fotografe a ficha do seu personal e a IA estrutura os treinos.</div>
                  </div>
                </div>
              </button>

              {/* Mode toggle */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Modo de geração</div>
                <div className="grid grid-cols-2 gap-2">
                  <OptionCard emoji="1️⃣" title="Treino único" desc="Um treino completo" selected={mode === 'single'} onClick={() => setMode('single')} compact />
                  <OptionCard emoji="📅" title="Plano semanal" desc="Programa de vários dias" selected={mode === 'program'} onClick={() => setMode('program')} compact />
                </div>
              </div>
            </div>
          )}

          {/* STEP 1: Objetivo */}
          {!showUpsell && step === 1 && (
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Qual seu objetivo principal?</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <OptionCard emoji="💪" title="Hipertrofia" desc="Ganho máximo de massa muscular" selected={answers.goal === 'hypertrophy'} onClick={() => setAnswers((p) => ({ ...p, goal: 'hypertrophy' }))} />
                <OptionCard emoji="🏋️" title="Força" desc="Aumentar cargas e potência" selected={answers.goal === 'strength'} onClick={() => setAnswers((p) => ({ ...p, goal: 'strength' }))} />
                <OptionCard emoji="🫀" title="Condicionamento" desc="Resistência e capacidade cardio" selected={answers.goal === 'conditioning'} onClick={() => setAnswers((p) => ({ ...p, goal: 'conditioning' }))} />
                <OptionCard emoji="⚖️" title="Manutenção" desc="Manter o shape e saúde geral" selected={answers.goal === 'maintenance'} onClick={() => setAnswers((p) => ({ ...p, goal: 'maintenance' }))} />
              </div>
            </div>
          )}

          {/* STEP 2: Divisão & Frequência */}
          {!showUpsell && step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Divisão de treino</div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <OptionCard emoji="🔄" title="Full Body" desc="Corpo todo em cada sessão" selected={answers.split === 'full_body'} onClick={() => setAnswers((p) => ({ ...p, split: 'full_body' }))} />
                  <OptionCard emoji="⬆️" title="Upper / Lower" desc="Alternancia superior e inferior" selected={answers.split === 'upper_lower'} onClick={() => setAnswers((p) => ({ ...p, split: 'upper_lower' }))} />
                  <OptionCard emoji="🔀" title="PPL" desc="Push, Pull e Legs" selected={answers.split === 'ppl'} onClick={() => setAnswers((p) => ({ ...p, split: 'ppl' }))} />
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">📆 Dias por semana</div>
                    <div className="text-[11px] text-neutral-400">Define volume e rotatividade</div>
                  </div>
                  <div className="flex gap-1.5">
                    {[2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAnswers((p) => ({ ...p, daysPerWeek: clampDays(n) }))}
                        className={`tap-44 w-9 h-9 rounded-lg font-black text-sm transition-all active:scale-90 ${
                          answers.daysPerWeek === n
                            ? 'bg-yellow-500 text-black'
                            : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Tempo & Equipamento */}
          {!showUpsell && step === 3 && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">⏱️ Duração da sessão</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {([30, 45, 60, 90, 120] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAnswers((p) => ({ ...p, timeMinutes: m }))}
                      className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all active:scale-95 ${
                        answers.timeMinutes === m
                          ? 'bg-yellow-500/10 border-yellow-500/60 text-yellow-400 ring-1 ring-yellow-500/30'
                          : 'bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:bg-neutral-800/70'
                      } border`}
                      style={answers.timeMinutes === m ? { boxShadow: '0 0 10px rgba(234,179,8,0.1)' } : undefined}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">🏢 Local de treino</div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <OptionCard emoji="🏢" title="Academia" desc="Equipamentos completos" selected={answers.equipment === 'gym'} onClick={() => setAnswers((p) => ({ ...p, equipment: 'gym' }))} />
                  <OptionCard emoji="🏠" title="Casa" desc="Halteres e barras" selected={answers.equipment === 'home'} onClick={() => setAnswers((p) => ({ ...p, equipment: 'home' }))} />
                  <OptionCard emoji="🎒" title="Mínimo" desc="Halteres ou elástico" selected={answers.equipment === 'minimal'} onClick={() => setAnswers((p) => ({ ...p, equipment: 'minimal' }))} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Preferências + Preview + Gerar */}
          {!showUpsell && step === 4 && (
            <div className="space-y-4">
              {/* Level */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Seu nível de treino</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <OptionCard emoji="🌱" title="Iniciante" selected={answers.level === 'beginner'} onClick={() => setAnswers((p) => ({ ...p, level: 'beginner' }))} compact />
                  <OptionCard emoji="🔥" title="Intermediário" selected={answers.level === 'intermediate'} onClick={() => setAnswers((p) => ({ ...p, level: 'intermediate' }))} compact />
                  <OptionCard emoji="⚡" title="Avançado" selected={answers.level === 'advanced'} onClick={() => setAnswers((p) => ({ ...p, level: 'advanced' }))} compact />
                </div>
              </div>

              {/* Focus */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Foco muscular</div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <OptionCard emoji="⚖️" title="Equilibrado" selected={answers.focus === 'balanced'} onClick={() => setAnswers((p) => ({ ...p, focus: 'balanced' }))} compact />
                  <OptionCard emoji="💪" title="Superior" selected={answers.focus === 'upper'} onClick={() => setAnswers((p) => ({ ...p, focus: 'upper' }))} compact />
                  <OptionCard emoji="🦵" title="Inferior" selected={answers.focus === 'lower'} onClick={() => setAnswers((p) => ({ ...p, focus: 'lower' }))} compact />
                  <OptionCard emoji="👊" title="Push" selected={answers.focus === 'push'} onClick={() => setAnswers((p) => ({ ...p, focus: 'push' }))} compact />
                  <OptionCard emoji="🤏" title="Pull" selected={answers.focus === 'pull'} onClick={() => setAnswers((p) => ({ ...p, focus: 'pull' }))} compact />
                  <OptionCard emoji="🦿" title="Pernas" selected={answers.focus === 'legs'} onClick={() => setAnswers((p) => ({ ...p, focus: 'legs' }))} compact />
                </div>
              </div>

              {/* Constraints */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm font-bold text-white">📋 Preferências e restrições</div>
                <div className="text-[11px] text-neutral-400 mt-1">Ex.: foco em deltoide lateral, evitar overhead, dor no joelho, sem barra.</div>
                <textarea
                  aria-label="Preferências e restrições"
                  value={answers.constraints}
                  onChange={(e) => setAnswers((p) => ({ ...p, constraints: e.target.value }))}
                  rows={3}
                  className="mt-2 w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:border-yellow-500 focus:outline-none input-premium-focus resize-none"
                  placeholder="Escreva aqui preferências e restrições..."
                />
              </div>

              {/* Summary card */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-yellow-500 mb-2">📊 Resumo do treino</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-300">
                  <span>🎯 {titleGoal(answers.goal)}</span>
                  <span>🔀 {titleSplit(answers.split)}</span>
                  <span>📆 {answers.daysPerWeek}x/sem</span>
                  <span>⏱️ {answers.timeMinutes}min</span>
                  <span>🏢 {titleEquipment(answers.equipment)}</span>
                  <span>📈 {titleLevel(answers.level)}</span>
                  <span>🎯 {titleFocus(answers.focus)}</span>
                </div>
              </div>

              {/* credits loading/error */}
              {creditsLoading && (
                <div className="flex items-center justify-center bg-neutral-900/60 p-2 rounded-lg border border-neutral-800">
                  <div className="text-xs text-neutral-400 animate-pulse">Carregando créditos...</div>
                </div>
              )}
              {creditsError && (
                <div className="flex items-center justify-center bg-red-900/20 p-2 rounded-lg border border-red-900/50">
                  <div className="text-xs text-red-400">Erro: {creditsError}</div>
                </div>
              )}
              {credits?.wizard && (
                <div className="flex items-center justify-between bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800">
                  <div className="text-xs text-neutral-400 font-bold">Créditos semanais</div>
                  <div className={`text-xs font-mono font-bold ${isWizardExhausted(credits.wizard) ? 'text-red-400' : 'text-green-400'}`}>
                    {credits.wizard.used} / {formatLimit(credits.wizard.limit)}
                  </div>
                </div>
              )}

              {/* Generate button */}
              <button
                type="button"
                onClick={doGenerate}
                disabled={generating}
                className="btn-shimmer-sweep w-full rounded-xl p-[1px] transition-all active:scale-[0.97] disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #D4A017, #F5C542, #D4A017)',
                  boxShadow: '0 0 20px rgba(234,179,8,0.2)',
                }}
              >
                <span className="flex items-center justify-center gap-2 rounded-lg px-5 py-3.5 font-black text-sm" style={{ background: 'linear-gradient(160deg, rgba(20,16,8,0.95), rgba(30,24,12,0.92))' }}>
                  {generating ? (
                    <Loader2 size={18} className="animate-spin text-yellow-400" />
                  ) : (
                    <Wand2 size={18} className="text-yellow-400" />
                  )}
                  <span className="text-white">
                    {generating ? 'Gerando com IA...' : mode === 'program' ? `Gerar plano (${answers.daysPerWeek} treinos)` : 'Gerar treino com IA'}
                  </span>
                </span>
              </button>

              {/* Action buttons for draft */}
              {(draft || (drafts && drafts.length > 0)) && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (drafts && drafts.length) {
                        const d = drafts[Math.max(0, Math.min(drafts.length - 1, draftIdx))]
                        if (!d) return
                        props.onClose()
                        outcomeRef.current = 'draft_used'
                        try { trackUserEvent('wizard_draft_used', { type: 'wizard', screen: 'create_workout' }) } catch { }
                        props.onUseDraft(d)
                        return
                      }
                      if (!draft) return
                      props.onClose()
                      outcomeRef.current = 'draft_used'
                      try { trackUserEvent('wizard_draft_used', { type: 'wizard', screen: 'create_workout' }) } catch { }
                      props.onUseDraft(draft)
                    }}
                    className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400"
                  >
                    {drafts && drafts.length ? 'Abrir dia selecionado' : 'Abrir no editor'}
                  </button>
                  {mode === 'program' && drafts && drafts.length > 0 && props.onSaveDrafts && (
                    <button
                      type="button"
                      onClick={doSaveAll}
                      disabled={savingAll || generating}
                      className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-50"
                    >
                      {savingAll ? 'Salvando...' : 'Salvar todos'}
                    </button>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
              )}

              {/* Drafts preview */}
              {drafts && drafts.length > 0 && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-yellow-500">📅 Plano semanal</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {drafts.map((d, idx) => (
                      <button
                        key={`${String(d?.title || idx)}-${idx}`}
                        type="button"
                        onClick={() => setDraftIdx(idx)}
                        className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all ${
                          draftIdx === idx
                            ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/40'
                            : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700'
                        }`}
                      >
                        Dia {idx + 1}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const d = drafts[Math.max(0, Math.min(drafts.length - 1, draftIdx))]
                    if (!d) return null
                    return (
                      <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                        <div className="text-xs font-black text-yellow-400 mb-2">{d.title}</div>
                        {renderExerciseList(d.exercises)}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Single draft preview */}
              {draft && !drafts && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                  <div className="text-xs font-black text-yellow-400 mb-2">{draft.title}</div>
                  {renderExerciseList(draft.exercises)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div className="p-4 flex items-center justify-between gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {canBack ? (
            <button
              type="button"
              onClick={goBack}
              className="tap-44 min-h-[42px] px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider hover:bg-neutral-800 inline-flex items-center gap-1.5 transition-all active:scale-95"
            >
              <ChevronLeft size={14} />
              Voltar
            </button>
          ) : (
            <div />
          )}

          {/* Step dots mini */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'bg-yellow-400 w-4' : i < step ? 'bg-yellow-700' : 'bg-neutral-700'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step < 4 && (
              <button
                type="button"
                onClick={goNext}
                className="tap-44 min-h-[42px] px-5 py-2.5 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-wider hover:bg-yellow-400 inline-flex items-center gap-1.5 transition-all active:scale-95"
              >
                Continuar
                <ChevronRight size={14} />
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                onClick={props.onClose}
                className="tap-44 min-h-[42px] px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-300 font-bold text-xs hover:bg-neutral-700 transition-all active:scale-95"
              >
                Fechar
              </button>
            )}
          </div>
        </div>
      </div>
      {showPhotoImport && (
        <WorkoutPhotoImportModal
          isOpen={showPhotoImport}
          onClose={() => setShowPhotoImport(false)}
          onComplete={async (imported) => {
            const drafts = importedToWorkoutDrafts(imported)
            setShowPhotoImport(false)
            props.onClose()
            // Vários treinos → o caminho de salvar em lote que o plano semanal
            // já usa. Um treino só → abre o editor, para o usuário conferir no
            // mesmo lugar onde revisa um treino gerado pela IA.
            if (drafts.length > 1 && props.onSaveDrafts) await props.onSaveDrafts(drafts)
            else if (drafts[0]) props.onUseDraft(drafts[0])
          }}
        />
      )}
      {showVoice && (
        <VoiceWorkoutModal
          isOpen={showVoice}
          onClose={() => setShowVoice(false)}
          onComplete={(exercises) => {
            setShowVoice(false)
            props.onClose()
            props.onUseDraft(voiceToWorkoutDraft(exercises))
          }}
        />
      )}
    </div>
  )
}
