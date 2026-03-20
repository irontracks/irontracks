'use client'

import React, { useState, useEffect } from 'react'
import { User, Scale, Ruler, Calendar, MapPin, Building2, Dumbbell, Target, BarChart3, Activity } from 'lucide-react'
import { useAdminPanel } from './AdminPanelContext'
import { getProfileCompletenessScore } from '@/schemas/settings'
import type { UserSettings } from '@/schemas/settings'
import { logInfo, logWarn } from '@/lib/logger'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ProfileBadge({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: React.ElementType }) {
  const empty = !value || String(value).trim() === '' || value === 'not_informed'
  return (
    <div className={`rounded-xl border p-3 flex items-start gap-2.5 ${empty ? 'border-neutral-800 bg-neutral-900/30' : 'border-neutral-700/60 bg-neutral-900/70'}`}>
      {Icon && (
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${empty ? 'bg-neutral-800' : 'bg-yellow-500/15 border border-yellow-500/25'}`}>
          <Icon size={13} className={empty ? 'text-neutral-600' : 'text-yellow-400'} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{label}</p>
        <p className={`text-sm font-bold mt-0.5 ${empty ? 'text-neutral-600 italic' : 'text-white'}`}>
          {empty ? '—' : String(value)}
        </p>
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-lg bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center">
        <Icon size={13} className="text-yellow-400" />
      </div>
      <h3 className="text-xs font-black uppercase tracking-widest text-yellow-400">{title}</h3>
    </div>
  )
}

const SEX_LABELS: Record<string, string> = {
  male: 'Masculino',
  female: 'Feminino',
  not_informed: 'Não informado',
}
const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
  not_informed: 'Não informado',
}
const GOAL_LABELS: Record<string, string> = {
  hypertrophy: 'Hipertrofia 💪',
  weight_loss: 'Emagrecimento 🔥',
  strength: 'Força 🏋️',
  performance: 'Performance ⚡',
  health: 'Saúde ❤️',
  not_informed: 'Não informado',
}

// ─── Component ────────────────────────────────────────────────────────────────

export const StudentProfileTab: React.FC = () => {
  const { selectedStudent, supabase, getAdminAuthHeaders } = useAdminPanel()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Fetch user_settings via admin API (bypasses RLS)
  useEffect(() => {
    const userId = String(selectedStudent?.user_id || selectedStudent?.id || '').trim()
    if (!userId) { setSettings(null); return }

    let cancelled = false
    setLoading(true)
    setError('')

    const run = async () => {
      try {
        const authHeaders = await getAdminAuthHeaders()
        const resp = await fetch(`/api/admin/students/settings?user_id=${encodeURIComponent(userId)}`, {
          headers: { 'Content-Type': 'application/json', ...authHeaders },
        })
        if (cancelled) return

        if (!resp.ok) {
          let detail = `HTTP ${resp.status}`
          try {
            const body = await resp.json()
            detail += `: ${body?.error || resp.statusText}`
          } catch { detail += `: ${resp.statusText}` }
          logWarn('StudentProfileTab', `settings fetch failed: ${detail}`, { userId, authHeaders })
          setError(`Erro ao carregar perfil (${detail})`)
          return
        }

        const json = await resp.json()
        if (cancelled) return

        logInfo('admin:student-profile-tab', 'settings OK', json)

        if (json.ok && json.settings && typeof json.settings === 'object') {
          setSettings(json.settings as UserSettings)
        } else {
          setSettings(null)
        }
      } catch {
        if (!cancelled) setError('Erro ao carregar dados de perfil.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [selectedStudent?.user_id, selectedStudent?.id, supabase, getAdminAuthHeaders])

  if (!selectedStudent) return null

  const { score, missingFields } = getProfileCompletenessScore(settings)
  const ringColor = score >= 90 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  const ringStroke = score >= 90 ? '#4ade80' : score >= 60 ? '#facc15' : '#f87171'
  const circumference = 2 * Math.PI * 22
  const dashOffset = circumference * (1 - score / 100)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-neutral-500">
        <span className="animate-pulse">Carregando perfil...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Completeness ring */}
      <div className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4 flex items-center gap-4">
        <div className="relative flex-shrink-0 w-[60px] h-[60px]">
          <svg width="60" height="60" className="-rotate-90">
            <circle cx="30" cy="30" r="22" fill="none" stroke="#262626" strokeWidth="4" />
            <circle
              cx="30" cy="30" r="22" fill="none"
              stroke={ringStroke} strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm font-black ${ringColor}`}>{score}%</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white">
            {score >= 90 ? '✅ Perfil completo' : score >= 60 ? '⚡ Perfil parcial' : '📋 Perfil incompleto'}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
            {score >= 90
              ? 'Cálculos de calorias na máxima precisão para este aluno.'
              : missingFields.length > 0
                ? `Falta: ${missingFields.slice(0, 3).join(', ')}${missingFields.length > 3 ? '...' : ''}`
                : 'Aluno ainda não preencheu o perfil.'}
          </p>
        </div>
        <div className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border ${score >= 90 ? 'bg-green-500/10 border-green-500/25 text-green-400' : score >= 60 ? 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400' : 'bg-red-500/10 border-red-500/25 text-red-400'}`}>
          {score}%
        </div>
      </div>

      {/* Biometria */}
      <div>
        <SectionTitle icon={Activity} title="Biometria & Dados Pessoais" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <ProfileBadge icon={User} label="Sexo biológico" value={SEX_LABELS[String(settings?.biologicalSex || '')] || null} />
          <ProfileBadge icon={Scale} label="Peso (kg)" value={settings?.bodyWeightKg != null ? `${settings.bodyWeightKg} kg` : null} />
          <ProfileBadge icon={Ruler} label="Altura (cm)" value={settings?.heightCm != null ? `${settings.heightCm} cm` : null} />
          <ProfileBadge icon={Calendar} label="Idade" value={settings?.age != null ? `${settings.age} anos` : null} />
          <ProfileBadge icon={User} label="Telefone" value={settings?.phone || null} />
        </div>
      </div>

      {/* Localização */}
      <div>
        <SectionTitle icon={MapPin} title="Localização" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <ProfileBadge icon={MapPin} label="Cidade" value={settings?.city || null} />
          <ProfileBadge icon={MapPin} label="Estado" value={settings?.state || null} />
          <ProfileBadge icon={Building2} label="Academia" value={settings?.gym || null} />
        </div>
      </div>

      {/* Treino */}
      <div>
        <SectionTitle icon={Dumbbell} title="Dados de Treino" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <ProfileBadge icon={BarChart3} label="Nível" value={LEVEL_LABELS[String(settings?.fitnessLevel || '')] || null} />
          <ProfileBadge icon={Target} label="Objetivo" value={GOAL_LABELS[String(settings?.fitnessGoal || '')] || null} />
          <ProfileBadge icon={Calendar} label="Freq. semanal" value={settings?.trainingFrequencyPerWeek != null ? `${settings.trainingFrequencyPerWeek}x / semana` : null} />
          <ProfileBadge icon={BarChart3} label="Anos treinando" value={settings?.trainingExperienceYears != null ? `${settings.trainingExperienceYears} anos` : null} />
        </div>
      </div>

      {/* Empty state if no settings at all */}
      {!settings && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 px-4 py-8 text-center">
          <User size={32} className="mx-auto mb-3 text-neutral-700" />
          <p className="text-sm font-bold text-neutral-500">Este aluno ainda não preencheu o perfil.</p>
          <p className="text-xs text-neutral-600 mt-1">Os dados aparecerão aqui quando o aluno acessar Menu → Meu Perfil.</p>
        </div>
      )}
    </div>
  )
}
