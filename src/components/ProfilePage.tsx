'use client'

import React, { useState, useCallback, useMemo } from 'react'
import {
  User, Scale, Ruler, Calendar, Phone, MapPin, Building2, Dumbbell,
  Activity, Target, BarChart3, ChevronLeft, Save, Check, Flame
} from 'lucide-react'
import { getProfileCompletenessScore } from '@/schemas/settings'
import type { UserSettings } from '@/schemas/settings'
import dynamic from 'next/dynamic'
const GymSettingsWrapper = dynamic(() => import('@/components/settings/GymSettingsWrapper'), { ssr: false })

interface ProfilePageProps {
  settings: UserSettings | null
  displayName: string
  onSave: (next: Partial<UserSettings>) => Promise<boolean>
  onBack: () => void
}

type SexOption = 'male' | 'female' | 'not_informed'
type FitnessLevel = 'beginner' | 'intermediate' | 'advanced' | 'not_informed'
type FitnessGoal = 'hypertrophy' | 'weight_loss' | 'strength' | 'performance' | 'health' | 'not_informed'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sexOptions: Array<{ value: SexOption; label: string; icon: string }> = [
  { value: 'male', label: 'Masculino', icon: '♂' },
  { value: 'female', label: 'Feminino', icon: '♀' },
  { value: 'not_informed', label: 'Não informar', icon: '·' },
]

const fitnessLevelOptions: Array<{ value: FitnessLevel; label: string; desc: string; color: string }> = [
  { value: 'beginner', label: 'Iniciante', desc: '< 1 ano', color: 'from-green-500/20 to-green-600/5 border-green-500/30 text-green-400' },
  { value: 'intermediate', label: 'Intermediário', desc: '1–3 anos', color: 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/30 text-yellow-400' },
  { value: 'advanced', label: 'Avançado', desc: '3+ anos', color: 'from-orange-500/20 to-orange-600/5 border-orange-500/30 text-orange-400' },
]

const fitnessGoalOptions: Array<{ value: FitnessGoal; label: string; icon: string }> = [
  { value: 'hypertrophy', label: 'Hipertrofia', icon: '💪' },
  { value: 'weight_loss', label: 'Emagrecimento', icon: '🔥' },
  { value: 'strength', label: 'Força', icon: '🏋️' },
  { value: 'performance', label: 'Performance', icon: '⚡' },
  { value: 'health', label: 'Saúde', icon: '❤️' },
]

const weekDayOptions = [1, 2, 3, 4, 5, 6, 7]

// ─── Field components ─────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/25 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={16} className="text-yellow-400" />
      </div>
      <div>
        <p className="text-sm font-black text-white leading-none">{title}</p>
        {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="text-xs font-black uppercase tracking-widest text-neutral-500">{label}</label>
      {hint && <p className="text-[10px] text-yellow-500/60 mt-0.5">{hint}</p>}
    </div>
  )
}

function TextInput({
  value, onChange, placeholder, type = 'text', step
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; step?: string
}) {
  return (
    <input
      type={type}
      step={step}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-neutral-800/80 border border-neutral-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60 transition-colors"
    />
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProfilePage({ settings, displayName, onSave, onBack }: ProfilePageProps) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Local draft state mirroring settings
  const [draft, setDraft] = useState<Partial<UserSettings>>({
    biologicalSex: settings?.biologicalSex ?? 'not_informed',
    bodyWeightKg: settings?.bodyWeightKg ?? null,
    heightCm: settings?.heightCm ?? null,
    age: settings?.age ?? null,
    phone: settings?.phone ?? '',
    city: settings?.city ?? '',
    state: settings?.state ?? '',
    gym: settings?.gym ?? '',
    trainingExperienceYears: settings?.trainingExperienceYears ?? null,
    trainingFrequencyPerWeek: settings?.trainingFrequencyPerWeek ?? null,
    fitnessLevel: settings?.fitnessLevel ?? 'not_informed',
    fitnessGoal: settings?.fitnessGoal ?? 'not_informed',
  })

  const set = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }, [])

  // Completeness based on merged draft + existing settings
  const mergedForScore = useMemo(() => {
    const base = settings ?? {} as UserSettings
    return { ...base, ...draft } as UserSettings
  }, [settings, draft])

  const { score, missingFields } = useMemo(() => getProfileCompletenessScore(mergedForScore), [mergedForScore])

  const handleSave = async () => {
    setSaving(true)
    try {
      const ok = await onSave(draft)
      if (ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  // Color ring for completeness
  const ringColor = score >= 90 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  const ringStroke = score >= 90 ? '#4ade80' : score >= 60 ? '#facc15' : '#f87171'

  const circumference = 2 * Math.PI * 28
  const dashOffset = circumference * (1 - score / 100)

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-xl border-b border-white/5 px-4 pt-[env(safe-area-inset-top)]" style={{ minHeight: 'calc(3.5rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between h-14">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors active:scale-95"
          >
            <ChevronLeft size={20} />
            <span className="text-sm font-bold">Voltar</span>
          </button>
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">Meu Perfil</p>
            <p className="text-xs text-neutral-400 leading-none">{displayName || 'Atleta'}</p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-[12px] uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 ${saved ? 'bg-green-500/20 border border-green-500/40 text-green-400' : 'bg-yellow-500 text-black hover:bg-yellow-400'}`}
          >
            {saved ? <><Check size={13} />Salvo</> : saving ? 'Salvando...' : <><Save size={13} />Salvar</>}
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}>
        <div className="max-w-lg mx-auto px-4 pb-[env(safe-area-inset-bottom)] pb-8 space-y-6 pt-4">

          {/* Profile Completeness Ring */}
          <div className="rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-950 border border-white/[0.06] p-5 flex items-center gap-5">
            <div className="relative flex-shrink-0">
              <svg width="72" height="72" className="-rotate-90">
                <circle cx="36" cy="36" r="28" fill="none" stroke="#262626" strokeWidth="4" />
                <circle
                  cx="36" cy="36" r="28" fill="none"
                  stroke={ringStroke} strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-black ${ringColor}`}>{score}%</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white mb-1">
                {score >= 90 ? '✅ Perfil completo!' : score >= 60 ? '⚡ Quase lá!' : '📋 Complete seu perfil'}
              </p>
              <p className="text-xs text-neutral-500 leading-relaxed">
                {score >= 90
                  ? 'Seus cálculos de calorias estão na máxima precisão.'
                  : missingFields.length > 0
                    ? `Faltam: ${missingFields.slice(0, 3).join(', ')}${missingFields.length > 3 ? ' e mais...' : ''}`
                    : 'Complete os campos para melhorar a precisão dos cálculos.'}
              </p>
            </div>
          </div>

          {/* ── Seção 1: Dados Pessoais ──────────────────────────────────────── */}
          <div className="rounded-3xl bg-neutral-900/60 border border-white/[0.05] p-5">
            <SectionTitle icon={User} title="Dados Pessoais" subtitle="Informações básicas sobre você" />

            {/* Sexo biológico */}
            <div className="mb-5">
              <FieldLabel label="Sexo biológico" hint="⚡ Impacta ±10% no cálculo de calorias" />
              <div className="flex gap-2">
                {sexOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('biologicalSex', opt.value)}
                    className={`flex-1 py-3 rounded-2xl border text-sm font-black transition-all active:scale-95 flex flex-col items-center gap-0.5 ${draft.biologicalSex === opt.value
                      ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                      : 'bg-neutral-800/60 border-neutral-700/40 text-neutral-500 hover:border-neutral-600'}`}
                  >
                    <span className="text-base">{opt.icon}</span>
                    <span className="text-[11px]">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Idade */}
            <div className="mb-5">
              <FieldLabel label="Idade" hint="⚡ Melhora a estimativa de TMB" />
              <div className="relative">
                <Calendar size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="number"
                  min="10" max="100"
                  value={draft.age ?? ''}
                  onChange={e => set('age', e.target.value ? Number(e.target.value) : null as unknown as number)}
                  placeholder="Ex: 28"
                  className="w-full bg-neutral-800/80 border border-neutral-700/60 rounded-xl pl-9 pr-4 py-3 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60 transition-colors"
                />
              </div>
            </div>

            {/* Telefone */}
            <div className="mb-0">
              <FieldLabel label="Telefone" hint="Opcional — não será exibido publicamente" />
              <div className="relative">
                <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="tel"
                  value={draft.phone ?? ''}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="Ex: (11) 98765-4321"
                  className="w-full bg-neutral-800/80 border border-neutral-700/60 rounded-xl pl-9 pr-4 py-3 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* ── Seção 2: Biometria ───────────────────────────────────────────── */}
          <div className="rounded-3xl bg-neutral-900/60 border border-white/[0.05] p-5">
            <SectionTitle icon={Activity} title="Biometria" subtitle="Peso e altura melhoram muito a precisão" />

            <div className="grid grid-cols-2 gap-3 mb-0">
              {/* Peso */}
              <div>
                <FieldLabel label="Peso (kg)" hint="⚡ Usado no cálculo de calorias" />
                <div className="relative">
                  <Scale size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="number" step="0.1" min="30" max="300"
                    value={draft.bodyWeightKg ?? ''}
                    onChange={e => set('bodyWeightKg', e.target.value ? Number(e.target.value) : null as unknown as number)}
                    placeholder="Ex: 80.5"
                    className="w-full bg-neutral-800/80 border border-neutral-700/60 rounded-xl pl-8 pr-4 py-3 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60 transition-colors"
                  />
                </div>
              </div>
              {/* Altura */}
              <div>
                <FieldLabel label="Altura (cm)" hint="⚡ Melhora o cálculo de TMB" />
                <div className="relative">
                  <Ruler size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="number" step="0.5" min="100" max="250"
                    value={draft.heightCm ?? ''}
                    onChange={e => set('heightCm', e.target.value ? Number(e.target.value) : null as unknown as number)}
                    placeholder="Ex: 175"
                    className="w-full bg-neutral-800/80 border border-neutral-700/60 rounded-xl pl-8 pr-4 py-3 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Seção 3: Localização ─────────────────────────────────────────── */}
          <div className="rounded-3xl bg-neutral-900/60 border border-white/[0.05] p-5">
            <SectionTitle icon={MapPin} title="Localização" />

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <FieldLabel label="Cidade" />
                <TextInput value={draft.city ?? ''} onChange={v => set('city', v)} placeholder="São Paulo" />
              </div>
              <div>
                <FieldLabel label="Estado" />
                <TextInput value={draft.state ?? ''} onChange={v => set('state', v)} placeholder="SP" />
              </div>
            </div>

            {/* Academia */}
            <div>
              <FieldLabel label="Academia" />
              <div className="relative">
                <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  value={draft.gym ?? ''}
                  onChange={e => set('gym', e.target.value)}
                  placeholder="Ex: Smart Fit - Centro"
                  className="w-full bg-neutral-800/80 border border-neutral-700/60 rounded-xl pl-8 pr-4 py-3 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* ── Seção 4: Treino ──────────────────────────────────────────────── */}
          <div className="rounded-3xl bg-neutral-900/60 border border-white/[0.05] p-5">
            <SectionTitle icon={Dumbbell} title="Dados do Treino" subtitle="Personaliza sugestões e relatórios" />

            {/* Frequency */}
            <div className="mb-5">
              <FieldLabel label="Quantos dias treina por semana?" />
              <div className="flex gap-2 flex-wrap">
                {weekDayOptions.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('trainingFrequencyPerWeek', d)}
                    className={`w-10 h-10 rounded-xl border text-sm font-black transition-all active:scale-95 ${draft.trainingFrequencyPerWeek === d
                      ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                      : 'bg-neutral-800/60 border-neutral-700/40 text-neutral-500 hover:border-neutral-600'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience */}
            <div className="mb-5">
              <FieldLabel label="Há quantos anos treina?" />
              <div className="relative">
                <BarChart3 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="number" step="0.5" min="0" max="50"
                  value={draft.trainingExperienceYears ?? ''}
                  onChange={e => set('trainingExperienceYears', e.target.value ? Number(e.target.value) : null as unknown as number)}
                  placeholder="Ex: 2.5"
                  className="w-full bg-neutral-800/80 border border-neutral-700/60 rounded-xl pl-8 pr-4 py-3 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60 transition-colors"
                />
              </div>
            </div>

            {/* Level */}
            <div className="mb-5">
              <FieldLabel label="Nível de condicionamento" hint="⚡ Melhor sugestão de progressão" />
              <div className="space-y-2">
                {fitnessLevelOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('fitnessLevel', opt.value)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-bold transition-all active:scale-[0.98] ${draft.fitnessLevel === opt.value
                      ? `bg-gradient-to-r ${opt.color} font-black`
                      : 'bg-neutral-800/40 border-neutral-700/40 text-neutral-400 hover:border-neutral-600'}`}
                  >
                    <span>{opt.label}</span>
                    <span className={`text-[11px] ${draft.fitnessLevel === opt.value ? '' : 'text-neutral-600'}`}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Goal */}
            <div className="mb-0">
              <FieldLabel label="Objetivo principal" hint="⚡ Personaliza volume e deload" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {fitnessGoalOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('fitnessGoal', opt.value)}
                    className={`flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border text-sm font-bold transition-all active:scale-95 ${draft.fitnessGoal === opt.value
                      ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300 font-black'
                      : 'bg-neutral-800/40 border-neutral-700/40 text-neutral-500 hover:border-neutral-600'}`}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <span className="text-[11px] leading-tight text-center">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* GPS & Location Settings */}
          <div className="mb-5 rounded-2xl border border-neutral-800/40 bg-neutral-900/40 p-4">
            <GymSettingsWrapper />
          </div>

          {/* Save button (sticky bottom) */}
          <div className="py-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 ${saved
                ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                : 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black shadow-lg shadow-yellow-500/20 hover:from-yellow-400 hover:to-amber-400'}`}
            >
              {saved ? <><Check size={16} />Perfil Salvo!</> : saving ? 'Salvando...' : <><Flame size={16} />Salvar Perfil</>}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
