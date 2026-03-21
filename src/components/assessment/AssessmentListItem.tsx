'use client'

import React from 'react'
import { ChevronDown, ChevronUp, Sparkles, Edit3, Trash2 } from 'lucide-react'
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

const AssessmentPDFGenerator = dynamic(() => import('@/components/assessment/AssessmentPDFGenerator'), { ssr: false })
const BodyMeasurementMap = dynamic(() => import('@/components/assessment/BodyMeasurementMap'), { ssr: false })

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
  assessment,
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
          <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Resumo Tático</div>
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
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">{label}</div>
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
  const photos = Array.isArray(assessment?.photos) ? assessment.photos : []
  const ageLabel = String(assessment?.age ?? '-')

  return (
    <div className="p-5 hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-black text-white text-sm sm:text-base truncate">
                {formatDateCompact(assessment.date || assessment.assessment_date)}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5 truncate">
                {formatWeekdayCompact(assessment.date || assessment.assessment_date)}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className="px-2.5 py-1 bg-yellow-500/15 text-yellow-400 text-xs rounded-full border border-yellow-500/20 font-bold">
                {ageLabel} anos
              </span>
              {photos.length > 0 && (
                <span className="px-2.5 py-1 bg-green-500/15 text-green-400 text-xs rounded-full border border-green-500/20 font-bold">
                  Com fotos
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-sm">
            {[
              { label: 'Peso', value: (() => { const w = getWeightKg(assessment); return w ? `${w.toFixed(1)} kg` : '-' })() },
              { label: '% Gordura', value: (() => { const bf = getBodyFatPercent(assessment); return bf ? `${bf.toFixed(1)}%` : '-' })() },
              { label: 'Massa Magra', value: (() => { const lm = getLeanMassKg(assessment); return lm ? `${lm.toFixed(1)} kg` : '-' })() },
              { label: 'BMR', value: (() => { const v = getBmrKcal(assessment); return v ? `${v.toFixed(0)} kcal` : '-' })() },
              { label: 'TDEE', value: workoutSessionsLoading ? '...' : tdee ? `${tdee.toFixed(0)} kcal` : '-' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">{label}</div>
                <div className="text-white font-black mt-1">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-1">
          {/* Row 1: Main actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleDetails(assessmentId)}
              className="min-h-[40px] px-3 py-2 rounded-xl border text-sm font-bold transition-all duration-200 active:scale-95 flex items-center gap-1.5"
              style={{
                background: isSelected ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.03)',
                borderColor: isSelected ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.08)',
                color: isSelected ? '#facc15' : '#a3a3a3',
              }}
              type="button"
            >
              {isSelected ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {isSelected ? 'Ocultar' : 'Detalhes'}
            </button>
            <AssessmentPDFGenerator
              formData={{
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
                observations: '',
              }}
              studentName={String(assessment.student_name ?? '')}
              trainerName={String(assessment.trainer_name ?? '')}
              assessmentDate={new Date(
                typeof assessment.assessment_date === 'string' || typeof assessment.assessment_date === 'number' || assessment.assessment_date instanceof Date
                  ? assessment.assessment_date
                  : String(assessment.assessment_date ?? Date.now()),
              )}
            />
          </div>
          {/* Row 2: AI + Edit + Delete */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenPlanModal(assessment)}
              disabled={!!aiPlanState?.loading}
              className="min-h-[40px] flex-1 px-3 py-2 rounded-xl bg-yellow-500 text-black text-sm font-bold hover:bg-yellow-400 transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4" />
              {aiPlanState?.loading ? 'Gerando…' : 'Plano IA'}
            </button>
            <button
              type="button"
              onClick={() => onEdit(assessmentId)}
              className="min-h-[40px] px-3 py-2 rounded-xl border text-sm font-bold text-neutral-300 hover:text-white hover:border-yellow-500/40 transition-all duration-200 active:scale-95 flex items-center gap-1.5"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <Edit3 className="w-4 h-4" />
              Editar
            </button>
            {confirmDeleteId === assessmentId ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onDelete(assessmentId)}
                  disabled={deletingId === assessmentId}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition-all duration-200 active:scale-95 disabled:opacity-60"
                >
                  {deletingId === assessmentId ? '...' : 'Sim'}
                </button>
                <button
                  type="button"
                  onClick={() => onConfirmDelete(null)}
                  className="min-h-[40px] px-3 py-2 rounded-xl border border-neutral-700 text-neutral-400 text-sm font-bold hover:text-white transition-all duration-200 active:scale-95"
                >
                  Não
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onConfirmDelete(assessmentId)}
                className="min-h-[40px] px-3 py-2 rounded-xl border text-sm font-bold text-red-400 hover:text-red-300 hover:border-red-500/40 transition-all duration-200 active:scale-95 flex items-center gap-1.5"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      {isSelected && (
        <div className="mt-4 pt-4 border-t border-neutral-700">
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
