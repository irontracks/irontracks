'use client'

import React from 'react'
import { AlertTriangle, Dumbbell, Apple, Pill, CalendarClock, ShieldAlert, Stethoscope } from 'lucide-react'
import type { LabProtocol, Priority } from '@/schemas/labExam'
import { LAB_PROTOCOL_DISCLAIMER } from '@/schemas/labExam'

const PRIORITY_STYLE: Record<Priority, { label: string; cls: string }> = {
  high: { label: 'Alta', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  medium: { label: 'Média', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  low: { label: 'Baixa', cls: 'bg-neutral-700/40 text-neutral-300 border-neutral-600/40' },
}

const SEVERITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-500/15 border-red-500/40 text-red-200',
  moderate: 'bg-amber-500/15 border-amber-500/40 text-amber-200',
  watch: 'bg-sky-500/10 border-sky-500/30 text-sky-200',
}

function PriorityBadge({ p }: { p: Priority }) {
  const s = PRIORITY_STYLE[p]
  return <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded border ${s.cls}`}>{s.label}</span>
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">
        {icon}
      </div>
      <h3 className="text-sm font-black text-white">{children}</h3>
    </div>
  )
}

export function LabExamProtocolView({ protocol }: { protocol: LabProtocol }) {
  return (
    <div className="space-y-5">
      {/* Headline + avaliação geral */}
      <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.04] p-4">
        <h2 className="text-base font-black text-white leading-snug">{protocol.headline}</h2>
        {protocol.overallAssessment ? (
          <p className="text-sm text-neutral-300 mt-2 leading-relaxed">{protocol.overallAssessment}</p>
        ) : null}
      </div>

      {/* Alertas médicos */}
      {protocol.medicalAlerts.length > 0 && (
        <div>
          <SectionTitle icon={<Stethoscope className="w-4 h-4" />}>Atenção médica</SectionTitle>
          <div className="space-y-2">
            {protocol.medicalAlerts.map((a, i) => (
              <div key={i} className={`rounded-xl border p-3 ${SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.watch}`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-bold">{a.marker}</span>
                  <span className="text-xs opacity-80">({a.value})</span>
                </div>
                <p className="text-xs mt-1 leading-snug">{a.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Treino */}
      <div>
        <SectionTitle icon={<Dumbbell className="w-4 h-4" />}>Protocolo de treino</SectionTitle>
        {protocol.trainingProtocol.summary ? (
          <p className="text-sm text-neutral-300 mb-3 leading-relaxed">{protocol.trainingProtocol.summary}</p>
        ) : null}
        <div className="space-y-2">
          {protocol.trainingProtocol.adjustments.map((adj, i) => (
            <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">{adj.area}</span>
                <PriorityBadge p={adj.priority} />
              </div>
              <p className="text-sm text-neutral-300 mt-1">{adj.recommendation}</p>
              <p className="text-xs text-neutral-500 mt-1 italic">Porquê: {adj.reason}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Nutrição */}
      <div>
        <SectionTitle icon={<Apple className="w-4 h-4" />}>Protocolo nutricional</SectionTitle>
        {protocol.nutritionProtocol.summary ? (
          <p className="text-sm text-neutral-300 mb-3 leading-relaxed">{protocol.nutritionProtocol.summary}</p>
        ) : null}
        <div className="space-y-2">
          {protocol.nutritionProtocol.adjustments.map((adj, i) => (
            <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">{adj.nutrient}</span>
                <PriorityBadge p={adj.priority} />
              </div>
              <p className="text-sm text-neutral-300 mt-1">{adj.recommendation}</p>
              <p className="text-xs text-neutral-500 mt-1 italic">Porquê: {adj.reason}</p>
            </div>
          ))}
        </div>
        {protocol.nutritionProtocol.foodSuggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {protocol.nutritionProtocol.foodSuggestions.map((f, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Suplementação */}
      {protocol.supplementation.length > 0 && (
        <div>
          <SectionTitle icon={<Pill className="w-4 h-4" />}>Suplementação</SectionTitle>
          <div className="space-y-2">
            {protocol.supplementation.map((s, i) => (
              <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white">{s.name}</span>
                  <div className="flex items-center gap-1.5">
                    {!s.otcAvailable && (
                      <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded border bg-red-500/15 text-red-300 border-red-500/30">
                        Com receita
                      </span>
                    )}
                    <PriorityBadge p={s.priority} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
                  <div><span className="text-neutral-500">Dose:</span> <span className="text-neutral-200 font-bold">{s.dose}</span></div>
                  <div><span className="text-neutral-500">Quando:</span> <span className="text-neutral-200">{s.timing}</span></div>
                  <div className="col-span-2"><span className="text-neutral-500">Duração:</span> <span className="text-neutral-200">{s.duration}</span></div>
                </div>
                <p className="text-xs text-neutral-500 mt-1.5 italic">Porquê: {s.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acompanhamento */}
      <div>
        <SectionTitle icon={<CalendarClock className="w-4 h-4" />}>Acompanhamento</SectionTitle>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 space-y-2">
          <p className="text-sm text-neutral-200">
            <span className="text-neutral-500">Reexaminar em:</span> <span className="font-bold">{protocol.followUp.retestIn}</span>
          </p>
          {protocol.followUp.markersToWatch.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {protocol.followUp.markersToWatch.map((m, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300">{m}</span>
              ))}
            </div>
          )}
          {protocol.followUp.notes ? <p className="text-xs text-neutral-400 leading-snug">{protocol.followUp.notes}</p> : null}
        </div>
      </div>

      {/* Disclaimer fixo — sempre presente */}
      <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3 flex gap-2.5">
        <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-red-200/90 leading-relaxed">{LAB_PROTOCOL_DISCLAIMER}</p>
      </div>
    </div>
  )
}
