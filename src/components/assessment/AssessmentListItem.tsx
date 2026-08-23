'use client'

import React from 'react'
import { ChevronDown, ChevronUp, Sparkles, Edit3, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { computeDelta, daysBetween, type MetricDelta } from './assessmentDelta'
import dynamic from 'next/dynamic'

import type { AssessmentRow } from './assessmentUtils'
import {
  getWeightKg,
  getBodyFatPercent,
  getLeanMassKg,
  getBmrKcal,
  getMeasurementCm,
  getSkinfoldMm,
} from './assessmentUtils'
import { formatDateCompact, formatWeekdayCompact, safeGender } from './assessmentChartData'
import type { AiPlanEntry } from '@/hooks/useAssessmentHistoryData'
import { combinedBodyFat, isPlausibleBodyFat } from '@/utils/calculations/bodyComposition'
import { resolveBodyFatFromPair } from '@/utils/calculations/assessmentPairing'
import { FileText, ImageIcon } from 'lucide-react'
import { getBiaSignedUrl } from '@/utils/storage/biaAttachmentUpload'

const AssessmentPDFGenerator = dynamic(() => import('@/components/assessment/AssessmentPDFGenerator'), { ssr: false })
const BodyMeasurementMap = dynamic(() => import('@/components/assessment/BodyMeasurementMap'), { ssr: false })

/**
 * Blocos de número da avaliação. Vivem no MÓDULO, não dentro do componente:
 * declarados lá dentro, o React os trata como um tipo NOVO a cada render e
 * remonta a subárvore inteira em vez de atualizá-la — perde estado e anima de
 * novo à toa. É o que a regra `react-hooks/static-components` acusa.
 */
const tomCor = (d: MetricDelta | null) =>
  d?.tone === 'good' ? '#4ade80' : d?.tone === 'bad' ? '#f87171' : '#a3a3a3'

const Delta = ({ d, unidade }: { d: MetricDelta | null; unidade: string }) =>
  d ? (
    <span
      className="inline-flex items-center gap-0.5 text-[12px] font-bold"
      style={{ color: tomCor(d) }}
    >
      {d.diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {d.label}{unidade}
    </span>
  ) : null

const Destaque = ({ rotulo, valor, d, unidade }: {
  rotulo: string; valor: string; d: MetricDelta | null; unidade: string
}) => (
  <div className="flex-1 min-w-0 rounded-2xl border border-neutral-800 bg-gradient-to-b from-neutral-900/80 to-neutral-900/30 px-4 py-3">
    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">{rotulo}</div>
    <div className="mt-1 flex items-baseline gap-2">
      <span className="text-[26px] font-black leading-none text-white tabular-nums">{valor}</span>
      <Delta d={d} unidade={unidade} />
    </div>
  </div>
)

const Secundario = ({ rotulo, valor }: { rotulo: string; valor: string }) => (
  <div className="min-w-0 flex-1">
    <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-neutral-600">{rotulo}</div>
    <div className="mt-0.5 truncate text-[13px] font-bold text-neutral-200 tabular-nums">{valor}</div>
  </div>
)

// ────────────────────────────────────────────────────────────────
// Shared field definitions
// ────────────────────────────────────────────────────────────────

export const measurementFields = [
  { key: 'arm', label: 'Braço' },
  { key: 'chest', label: 'Peito' },
  { key: 'waist', label: 'Cintura' },
  { key: 'hip', label: 'Quadril' },
  { key: 'thigh', label: 'Coxa' },
  { key: 'calf', label: 'Panturrilha' },
] as const

export const skinfoldFields = [
  { key: 'triceps', label: 'Tríceps' },
  { key: 'biceps', label: 'Bíceps' },
  { key: 'subscapular', label: 'Subescapular' },
  { key: 'suprailiac', label: 'Suprailíaca' },
  { key: 'abdominal', label: 'Abdominal' },
  { key: 'thigh', label: 'Coxa' },
  { key: 'calf', label: 'Panturrilha' },
] as const

// ────────────────────────────────────────────────────────────────
// AI Plan Section (inline within details)
// ────────────────────────────────────────────────────────────────

function AiPlanSection({
  assessment: _assessment,
  planState,
  planAnchorRef,
}: {
  assessment: AssessmentRow
  planState: AiPlanEntry | undefined
  planAnchorRef: (el: HTMLDivElement | null) => void
}) {
  if (!planState) return null
  const plan = planState.plan && typeof planState.plan === 'object' ? planState.plan : null
  if (!plan && !planState.loading && !planState.error) return null

  const badge = (() => {
    if (planState.loading) return null
    if (planState.error) return null
    if (planState.usedAi) return { text: 'IA', tone: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' }
    if (planState.reason === 'missing_api_key') return { text: 'Sem IA (config)', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' }
    if (planState.reason === 'insufficient_data') return { text: 'Dados insuf.', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' }
    if (planState.reason === 'ai_failed') return { text: 'Fallback', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' }
    return { text: 'Plano base', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' }
  })()

  const renderList = (raw: unknown) => {
    const items = Array.isArray(raw) ? raw : []
    if (!items.length) return null
    return items.map((item: unknown, idx: number) => <li key={idx}>{String(item ?? '')}</li>)
  }

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4" ref={planAnchorRef}>
      <div className="bg-neutral-900/70 border border-neutral-700 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="t-meta-inherit text-xs text-yellow-500">Resumo Tático</div>
          {badge ? (
            <div className={`px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${badge.tone}`}>
              {badge.text}
            </div>
          ) : null}
        </div>
        {planState.loading ? (
          <div className="text-sm text-neutral-300">Gerando plano tático personalizado…</div>
        ) : planState.error ? (
          <div className="text-sm text-red-400">{planState.error}</div>
        ) : plan ? (
          <ul className="text-sm text-neutral-200 space-y-1 list-disc list-inside">
            {renderList(plan.summary)}
          </ul>
        ) : null}
      </div>
      {plan ? (
        <div className="bg-neutral-900/70 border border-neutral-700 rounded-xl p-4 space-y-3">
          {[
            { key: 'training', label: 'Treino' },
            { key: 'nutrition', label: 'Nutrição' },
            { key: 'habits', label: 'Hábitos' },
            { key: 'warnings', label: 'Alertas' },
          ].map(({ key, label }) => {
            const items = renderList(plan[key])
            if (!items) return null
            return (
              <div key={key}>
                <div className="t-meta-inherit text-xs text-yellow-500 mb-1">{label}</div>
                <ul className={`text-sm ${key === 'warnings' ? 'text-neutral-300' : 'text-neutral-200'} space-y-1 list-disc list-inside`}>
                  {items}
                </ul>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────

interface AssessmentListItemProps {
  assessment: AssessmentRow
  /**
   * Contraparte resolvida pelo parent quando essa avaliação está
   * pareada (full ↔ bia em ±14 dias). null = não tem par.
   */
  pairedAssessment?: AssessmentRow | null
  /** Avaliação anterior no TEMPO — base da variação mostrada no card. */
  previousAssessment?: AssessmentRow | null
  idx: number
  isSelected: boolean
  aiPlanState: AiPlanEntry | undefined
  workoutSessionsLoading: boolean
  tdee: number | undefined
  deletingId: string | null
  confirmDeleteId: string | null
  onToggleDetails: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onConfirmDelete: (id: string | null) => void
  onOpenPlanModal: (assessment: AssessmentRow) => void
  setPlanAnchorRef: (id: string, el: HTMLDivElement | null) => void
}

export function AssessmentListItem({
  assessment,
  pairedAssessment,
  previousAssessment,
  idx,
  isSelected,
  aiPlanState,
  workoutSessionsLoading,
  tdee,
  deletingId,
  confirmDeleteId,
  onToggleDetails,
  onEdit,
  onDelete,
  onConfirmDelete,
  onOpenPlanModal,
  setPlanAnchorRef,
}: AssessmentListItemProps) {
  const assessmentId = String(assessment?.id ?? idx)
  // Anexo BIA vive em bucket PRIVADO — abrir = mintar signed URL curta.
  const [biaOpening, setBiaOpening] = React.useState(false)
  const openBiaAttachment = async (p: string) => {
    if (!p || biaOpening) return
    setBiaOpening(true)
    try {
      const url = await getBiaSignedUrl(p)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setBiaOpening(false)
    }
  }
  const photos = Array.isArray(assessment?.photos) ? assessment.photos : []
  const ageLabel = String(assessment?.age ?? '-')
  // Discriminação BIA-only vs full + sinal de pareamento. O hook
  // normalizeAssessmentRow garante esses 2 campos sempre presentes.
  const isBiaOnly = String(assessment?.assessment_type ?? 'full') === 'bia'
  const isPaired = !!assessment?.paired_assessment_id
  // Anexo do PDF/foto da bioimpedância — pode estar nesse registro ou no
  // par linkado (a UI considera os dois pra decidir se mostra o badge).
  const hasAttachment = !!(
    (typeof assessment?.bia_attachment_url === 'string' && assessment.bia_attachment_url)
    || (pairedAssessment && typeof pairedAssessment.bia_attachment_url === 'string' && pairedAssessment.bia_attachment_url)
  )

  const pdfFormData = React.useMemo(() => ({
    assessment_date: String(assessment.assessment_date ?? ''),
    weight: String(assessment.weight || ''),
    height: String(assessment.height || ''),
    age: String(assessment.age || ''),
    gender: safeGender(assessment.gender),
    arm_circ: String(getMeasurementCm(assessment, 'arm') || ''),
    chest_circ: String(getMeasurementCm(assessment, 'chest') || ''),
    waist_circ: String(getMeasurementCm(assessment, 'waist') || ''),
    hip_circ: String(getMeasurementCm(assessment, 'hip') || ''),
    thigh_circ: String(getMeasurementCm(assessment, 'thigh') || ''),
    calf_circ: String(getMeasurementCm(assessment, 'calf') || ''),
    pectoral_skinfold: String(getSkinfoldMm(assessment, 'pectoral') || ''),
    midaxillary_skinfold: String(getSkinfoldMm(assessment, 'midaxillary') || ''),
    triceps_skinfold: String(getSkinfoldMm(assessment, 'triceps') || ''),
    biceps_skinfold: String(getSkinfoldMm(assessment, 'biceps') || ''),
    subscapular_skinfold: String(getSkinfoldMm(assessment, 'subscapular') || ''),
    suprailiac_skinfold: String(getSkinfoldMm(assessment, 'suprailiac') || ''),
    abdominal_skinfold: String(getSkinfoldMm(assessment, 'abdominal') || ''),
    thigh_skinfold: String(getSkinfoldMm(assessment, 'thigh') || ''),
    calf_skinfold: String(getSkinfoldMm(assessment, 'calf') || ''),
    arm_circ_left: '',
    arm_circ_right: '',
    thigh_circ_left: '',
    thigh_circ_right: '',
    calf_circ_left: '',
    calf_circ_right: '',
    triceps_skinfold_left: '',
    triceps_skinfold_right: '',
    biceps_skinfold_left: '',
    biceps_skinfold_right: '',
    thigh_skinfold_left: '',
    thigh_skinfold_right: '',
    calf_skinfold_left: '',
    calf_skinfold_right: '',
    bia_body_fat_percentage: String(assessment.bia_body_fat_percentage ?? ''),
    bia_lean_mass: String(assessment.bia_lean_mass ?? ''),
    bia_fat_mass: String(assessment.bia_fat_mass ?? ''),
    bia_water_percentage: String(assessment.bia_water_percentage ?? ''),
    bia_visceral_fat: String(assessment.bia_visceral_fat ?? ''),
    bia_metabolic_age: String(assessment.bia_metabolic_age ?? ''),
    bia_attachment_url: String(assessment.bia_attachment_url ?? ''),
    observations: '',
              }), [assessment])
  const pdfStudentName = String(assessment.student_name ?? '')
  const pdfAssessmentDate = React.useMemo(() => new Date(
    typeof assessment.assessment_date === 'string' || typeof assessment.assessment_date === 'number' || assessment.assessment_date instanceof Date
      ? assessment.assessment_date
      : String(assessment.assessment_date ?? Date.now()),
  ), [assessment.assessment_date])

  return (
    <div className="p-5 hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-black text-white text-sm sm:text-base truncate">
                {formatDateCompact(assessment.date || assessment.assessment_date)}
              </div>
              <div className="text-xs text-neutral-400 mt-0.5 truncate">
                {formatWeekdayCompact(assessment.date || assessment.assessment_date)}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
              {isBiaOnly && (
                <span className="px-2.5 py-1 bg-amber-500/15 text-amber-300 text-xs rounded-full border border-amber-500/30 font-bold">
                  Bioimpedância
                </span>
              )}
              {isPaired && (
                <span
                  className="px-2.5 py-1 bg-emerald-500/15 text-emerald-300 text-xs rounded-full border border-emerald-500/30 font-bold inline-flex items-center gap-1"
                  title="Linkada com a contraparte (full ↔ BIA) em ±14 dias"
                >
                  🔗 Linkada
                </span>
              )}
              {hasAttachment && (
                <span
                  className="px-2.5 py-1 bg-neutral-700/40 text-neutral-300 text-xs rounded-full border border-neutral-600/40 font-bold inline-flex items-center gap-1"
                  title="Tem anexo (PDF ou foto) da bioimpedância"
                >
                  📎 Comprovante
                </span>
              )}
              {!isBiaOnly && (
                <span className="px-2.5 py-1 bg-yellow-500/15 text-yellow-400 text-xs rounded-full border border-yellow-500/20 font-bold">
                  {ageLabel} anos
                </span>
              )}
              {photos.length > 0 && (
                <span className="px-2.5 py-1 bg-green-500/15 text-green-400 text-xs rounded-full border border-green-500/20 font-bold">
                  Com fotos
                </span>
              )}
            </div>
          </div>

          {(() => {
            /* Redesign ago/2026 — pedido do dono ("muito amador").
             *
             * O que estava errado não era só o acabamento: eram cinco números do
             * MESMO tamanho, numa grade 2×2+1 que deixava o TDEE órfão, e
             * NENHUMA evolução. Os dados da mudança estavam na tela (88,2 kg em
             * março, 92,5 em setembro) e o usuário tinha de fazer a conta de
             * cabeça, rolando entre cards.
             *
             * Agora: peso e gordura em destaque com a variação vs. a avaliação
             * anterior; composição e metabolismo numa faixa secundária. Peso é
             * o número que a pessoa procura primeiro — merece ser o maior.
             */
            const peso = getWeightKg(assessment)
            const bf = getBodyFatPercent(assessment)
            const lean = getLeanMassKg(assessment)
            const bmr = getBmrKcal(assessment)

            const dPeso = computeDelta(peso, previousAssessment ? getWeightKg(previousAssessment) : null, null)
            const dBf = computeDelta(bf, previousAssessment ? getBodyFatPercent(previousAssessment) : null, 'down')
            const dLean = computeDelta(lean, previousAssessment ? getLeanMassKg(previousAssessment) : null, 'up')
            const dias = previousAssessment
              ? daysBetween(assessment?.date ?? assessment?.assessment_date,
                            previousAssessment?.date ?? previousAssessment?.assessment_date)
              : null


            return (
              <div className="mt-4">
                <div className="flex gap-2.5">
                  <Destaque
                    rotulo="Peso"
                    valor={peso ? `${peso.toFixed(1)}` : '—'}
                    d={dPeso}
                    unidade=" kg"
                  />
                  <Destaque
                    rotulo="Gordura"
                    valor={bf ? `${bf.toFixed(1)}%` : '—'}
                    d={dBf}
                    unidade="%"
                  />
                </div>

                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-neutral-800/70 bg-neutral-900/30 px-4 py-2.5">
                  <Secundario rotulo="Massa magra" valor={lean ? `${lean.toFixed(1)} kg` : '—'} />
                  <div className="h-7 w-px shrink-0 bg-neutral-800" />
                  <Secundario rotulo="BMR" valor={bmr ? `${bmr.toFixed(0)} kcal` : '—'} />
                  <div className="h-7 w-px shrink-0 bg-neutral-800" />
                  <Secundario rotulo="TDEE" valor={workoutSessionsLoading ? '…' : tdee ? `${tdee.toFixed(0)} kcal` : '—'} />
                </div>

                {/* Dá ESCALA à variação: "+4.3 kg" em 30 dias e em 300 dias são
                    coisas completamente diferentes. */}
                {dias && (dPeso || dBf || dLean) ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-400">
                    <span>Desde a anterior, há {dias} {dias === 1 ? 'dia' : 'dias'}:</span>
                    {dLean ? (
                      <span style={{ color: tomCor(dLean) }} className="font-bold">
                        massa magra {dLean.label} kg
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })()}
        </div>

        {/* Props do PDF extraídas para constantes: ficavam inline num JSX de
            ~45 linhas dentro da barra de ações, o que tornava impossível ler o
            layout dos botões. Mesmo conteúdo, nada renomeado. */}
        {/* Barra de ações — UMA linha (redesenho ago/2026, "não estou gostando
            dos botões").
            O que havia: cinco ações em duas linhas, com DOIS botões amarelos
            competindo (Gerar PDF e Plano IA). Quando tudo é primário, nada é —
            e a lixeira vermelha ficava permanentemente em destaque para uma
            ação rara e destrutiva.
            Agora: Detalhes (o que mais se usa) e Plano IA (a ação premium, e a
            ÚNICA dourada) dividem a linha; PDF, Editar e Excluir viram ícones
            discretos. A confirmação de exclusão continua inline. */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => onToggleDetails(assessmentId)}
            type="button"
            className="inline-flex tap-44 min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-colors active:scale-95"
            style={{
              background: isSelected ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.03)',
              borderColor: isSelected ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.08)',
              color: isSelected ? '#facc15' : '#d4d4d4',
            }}
          >
            {isSelected ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {isSelected ? 'Ocultar' : 'Detalhes'}
          </button>

          {!isBiaOnly && (
            <button
              type="button"
              onClick={() => onOpenPlanModal(assessment)}
              disabled={!!aiPlanState?.loading}
              className="inline-flex tap-44 min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 px-3 text-sm font-black text-black transition-transform active:scale-95 disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4" />
              {aiPlanState?.loading ? 'Gerando…' : 'Plano IA'}
            </button>
          )}

          {/* Secundárias: ícone só, com rótulo acessível. */}
          {!isBiaOnly && (
            <AssessmentPDFGenerator
              variant="icon"
              formData={pdfFormData}
              studentName={pdfStudentName}
              trainerName={String(assessment.trainer_name ?? '')}
              assessmentDate={pdfAssessmentDate}
              photos={photos}
            />
          )}

          {!isBiaOnly && (
            <button
              type="button"
              onClick={() => onEdit(assessmentId)}
              title="Editar avaliação"
              aria-label="Editar avaliação"
              className="inline-flex tap-44 h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/60 text-neutral-400 transition-colors hover:text-white hover:border-neutral-700 active:scale-95"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}

          {confirmDeleteId === assessmentId ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onDelete(assessmentId)}
                disabled={deletingId === assessmentId}
                className="tap-44 min-h-[40px] rounded-xl bg-red-600 px-3 text-sm font-bold text-white transition-colors hover:bg-red-500 active:scale-95 disabled:opacity-60"
              >
                {deletingId === assessmentId ? '…' : 'Excluir'}
              </button>
              <button
                type="button"
                onClick={() => onConfirmDelete(null)}
                className="tap-44 min-h-[40px] rounded-xl border border-neutral-700 px-3 text-sm font-bold text-neutral-400 transition-colors hover:text-white active:scale-95"
              >
                Não
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onConfirmDelete(assessmentId)}
              title="Excluir avaliação"
              aria-label="Excluir avaliação"
              className="inline-flex tap-44 h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/60 text-neutral-400 transition-colors hover:text-red-400 hover:border-red-500/40 active:scale-95"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {isSelected && (
        <div className="mt-4 pt-4 border-t border-neutral-700">
          {/* ── Anexo do PDF/foto da bioimpedância ── */}
          {(() => {
            // Anexo pode estar tanto no registro principal (bia standalone
            // ou full com BIA preenchido nos steps) quanto no par linkado.
            const ownAttachment = typeof assessment.bia_attachment_url === 'string'
              ? assessment.bia_attachment_url
              : null;
            const pairedAttachment = pairedAssessment && typeof pairedAssessment.bia_attachment_url === 'string'
              ? pairedAssessment.bia_attachment_url
              : null;
            const attachment = ownAttachment || pairedAttachment;
            if (!attachment) return null;
            const isPdf = /\.pdf(\?|$)/i.test(attachment);
            const isImage = /\.(jpe?g|png|webp|heic|heif)(\?|$)/i.test(attachment);
            const fromPair = !ownAttachment && !!pairedAttachment;
            return (
              <div className="mb-4">
                <h4 className="font-bold text-white mb-2 text-sm">Comprovante da Bioimpedância</h4>
                <button
                  type="button"
                  onClick={() => openBiaAttachment(attachment)}
                  disabled={biaOpening}
                  className="w-full text-left flex items-center gap-3 rounded-xl p-3 border transition-all hover:border-emerald-500/40 disabled:opacity-60"
                  style={{
                    background: 'rgba(34,197,94,0.06)',
                    borderColor: 'rgba(34,197,94,0.25)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(34,197,94,0.15)' }}
                  >
                    {isPdf ? (
                      <FileText className="w-5 h-5 text-emerald-400" />
                    ) : isImage ? (
                      <ImageIcon className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <FileText className="w-5 h-5 text-emerald-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">
                      {biaOpening ? 'Abrindo…' : isPdf ? 'Abrir PDF' : isImage ? 'Abrir foto' : 'Abrir arquivo'}
                    </p>
                    <p className="text-[11px] text-emerald-300 mt-0.5">
                      {fromPair ? 'do registro de bioimpedância linkado' : 'do registro atual'}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">↗</span>
                </button>
              </div>
            );
          })()}

          {/* ── Métodos de %BF ── */}
          {(() => {
            // Resolve dobras (Siri) e BIA, puxando do par quando o registro
            // atual só tem um dos dois (caso típico de pareamento).
            const breakdown = resolveBodyFatFromPair(
              {
                assessment_type: (assessment.assessment_type === 'bia' ? 'bia' : 'full') as 'full' | 'bia',
                body_fat_percentage_skinfold: typeof assessment.body_fat_percentage_skinfold === 'number'
                  ? assessment.body_fat_percentage_skinfold : undefined,
                bia_body_fat_percentage: typeof assessment.bia_body_fat_percentage === 'number'
                  ? assessment.bia_body_fat_percentage : undefined,
              },
              pairedAssessment ? {
                assessment_type: (pairedAssessment.assessment_type === 'bia' ? 'bia' : 'full') as 'full' | 'bia',
                body_fat_percentage_skinfold: typeof pairedAssessment.body_fat_percentage_skinfold === 'number'
                  ? pairedAssessment.body_fat_percentage_skinfold : undefined,
                bia_body_fat_percentage: typeof pairedAssessment.bia_body_fat_percentage === 'number'
                  ? pairedAssessment.bia_body_fat_percentage : undefined,
              } : null,
            );
            const combined = combinedBodyFat(breakdown.skinfold, breakdown.bia);
            // O card "Média ÷ 2" só faz sentido quando os DOIS valores realmente
            // entram no blend (ambos plausíveis). Se o BIA é implausível (ex.: 90 por
            // erro de vírgula), combinedBodyFat o descarta e retorna só as dobras —
            // mostrar isso rotulado "(dobras + BIA) ÷ 2" seria enganoso.
            const hasBoth = isPlausibleBodyFat(breakdown.skinfold) && isPlausibleBodyFat(breakdown.bia);
            const hasAny = breakdown.skinfold != null || breakdown.bia != null;
            if (!hasAny) return null;
            const cards: Array<{ label: string; value: number | null; sub: string; tone: string }> = [];
            if (breakdown.skinfold != null) {
              cards.push({ label: '7 Dobras (Siri)', value: breakdown.skinfold, sub: 'Pollock + Siri', tone: 'rgba(234,179,8,0.10)' });
            }
            if (breakdown.bia != null) {
              cards.push({ label: 'Bioimpedância', value: breakdown.bia, sub: 'Aparelho do usuário', tone: 'rgba(59,130,246,0.10)' });
            }
            if (hasBoth && combined != null) {
              cards.push({ label: 'Média', value: combined, sub: '(dobras + BIA) ÷ 2', tone: 'rgba(34,197,94,0.10)' });
            }
            const cols = cards.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2';
            return (
              <div className="mb-4">
                <h4 className="font-bold text-white mb-2 text-sm flex items-center gap-2">
                  Métodos de % Gordura
                  {pairedAssessment && (
                    <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5">
                      🔗 cruzado com avaliação de {formatDateCompact(String(pairedAssessment.assessment_date ?? pairedAssessment.date ?? ''))}
                    </span>
                  )}
                </h4>
                <div className={`grid ${cols} gap-3`}>
                  {cards.map((c) => (
                    <div
                      key={c.label}
                      className="text-center p-3 rounded-xl border border-neutral-800"
                      style={{ background: c.tone }}
                    >
                      <div className="text-[10px] text-neutral-400 uppercase tracking-wide font-bold">{c.label}</div>
                      <div className="text-xl font-black text-white mt-1">
                        {c.value != null ? `${c.value.toFixed(1)}%` : '-'}
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">{c.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-bold text-white mb-2">Dobras Cutâneas (mm)</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {skinfoldFields.map(({ key, label }) => {
                  const value = getSkinfoldMm(assessment, key)
                  return (
                    <div key={key} className="flex justify-between">
                      <span className="text-neutral-400">{label}:</span>
                      <span className="font-medium text-white">{value == null ? '-' : String(value)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div>
              <h4 className="font-bold text-white mb-2">Circunferências (cm)</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {measurementFields.map(({ key, label }) => {
                  const value = getMeasurementCm(assessment, key)
                  return (
                    <div key={key} className="flex justify-between">
                      <span className="text-neutral-400">{label}:</span>
                      <span className="font-medium text-white">{value == null ? '-' : String(value)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {/* Mapa Corporal */}
          <BodyMeasurementMap
            formData={{
              gender: safeGender(assessment.gender),
              weight: String(assessment.weight || ''),
              height: String(assessment.height || ''),
              age: String(assessment.age || ''),
              assessment_date: String(assessment.assessment_date ?? ''),
              arm_circ: String(getMeasurementCm(assessment, 'arm') || ''),
              arm_circ_left: String(assessment.arm_circ_left ?? ''),
              arm_circ_right: String(assessment.arm_circ_right ?? ''),
              chest_circ: String(getMeasurementCm(assessment, 'chest') || ''),
              waist_circ: String(getMeasurementCm(assessment, 'waist') || ''),
              hip_circ: String(getMeasurementCm(assessment, 'hip') || ''),
              thigh_circ: String(getMeasurementCm(assessment, 'thigh') || ''),
              thigh_circ_left: String(assessment.thigh_circ_left ?? ''),
              thigh_circ_right: String(assessment.thigh_circ_right ?? ''),
              calf_circ: String(getMeasurementCm(assessment, 'calf') || ''),
              calf_circ_left: String(assessment.calf_circ_left ?? ''),
              calf_circ_right: String(assessment.calf_circ_right ?? ''),
            } as any}
            bodyFatPercentage={getBodyFatPercent(assessment) ?? undefined}
          />
          <AiPlanSection
            assessment={assessment}
            planState={aiPlanState}
            planAnchorRef={(el) => setPlanAnchorRef(String(assessment.id), el)}
          />
        </div>
      )}
    </div>
  )
}
