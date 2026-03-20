'use client'

import React from 'react'
import NextImage from 'next/image'

type AnyObj = Record<string, unknown>

interface ReportTeamSectionProps {
  isTeamSession: boolean
  partners: unknown[]
  onPartnerPlan: (partner: AnyObj) => void
}

export function ReportTeamSection({ isTeamSession, partners, onPartnerPlan }: ReportTeamSectionProps) {
  if (!isTeamSession) return null

  return (
    <div className="mb-8 p-4 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/8 to-neutral-900/80 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
      style={{ boxShadow: '0 0 20px rgba(245,158,11,0.08)' }}>
      <div className="flex items-center gap-3">
        <div className="w-16 h-12 rounded-xl overflow-hidden shrink-0"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <NextImage src="/report-team-duo.png" alt="" width={64} height={48} unoptimized className="w-full h-full object-cover object-top" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Treino em Equipe</p>
          <p className="text-sm font-semibold text-neutral-100">
            {partners.length === 1 ? '1 parceiro treinando com você' : `${partners.length} parceiros treinando com você`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {partners.map((p: unknown, idx: number) => {
          const part = p && typeof p === 'object' ? (p as AnyObj) : ({} as AnyObj)
          return (
            <button
              key={String(part.uid || part.id || idx)}
              onClick={() => onPartnerPlan(part)}
              className="px-3 py-2 rounded-full bg-black text-white text-xs font-bold uppercase tracking-wide hover:bg-neutral-900"
            >
              Ver PDF de {String(part.name || 'Parceiro')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
