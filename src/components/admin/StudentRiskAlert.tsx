'use client'

import React, { useState, useMemo } from 'react'
import { AlertTriangle, Clock, TrendingDown, ChevronDown, ChevronUp, User, Activity } from 'lucide-react'

/* ──────────────────────────────────────────────────────────
 * StudentRiskAlert
 *
 * Feature 18: Detecção de aluno em risco
 * Shows coaches which students are inactive, losing
 * performance, or need intervention.
 * ────────────────────────────────────────────────────────── */

interface StudentRisk {
  id: string
  name: string
  avatarUrl?: string
  lastTrainingDate: string | null
  daysSinceLastTraining: number
  performanceTrend: 'up' | 'stable' | 'down'
  riskLevel: 'high' | 'medium' | 'low'
  reason: string
}

interface StudentRiskAlertProps {
  students: StudentRisk[]
  onContactStudent?: (studentId: string) => void
}

export default function StudentRiskAlert({
  students,
  onContactStudent,
}: StudentRiskAlertProps) {
  const [expanded, setExpanded] = useState(false)

  const atRisk = useMemo(
    () => students.filter(s => s.riskLevel === 'high' || s.riskLevel === 'medium')
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 }
        return order[a.riskLevel] - order[b.riskLevel]
      }),
    [students]
  )

  if (atRisk.length === 0) return null

  const highRisk = atRisk.filter(s => s.riskLevel === 'high')

  const riskColor = (level: string) =>
    level === 'high' ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'

  const riskBadge = (level: string) =>
    level === 'high' ? 'RISCO ALTO' : 'ATENÇÃO'

  return (
    <div className="rounded-2xl bg-neutral-900/80 border border-red-500/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <AlertTriangle size={18} className="text-red-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-white text-sm">Alunos em Risco</h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">
            {highRisk.length > 0
              ? `${highRisk.length} aluno${highRisk.length > 1 ? 's' : ''} precisam de atenção urgente`
              : `${atRisk.length} aluno${atRisk.length > 1 ? 's' : ''} requerem acompanhamento`
            }
          </p>
        </div>
        <span className="shrink-0 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/25 text-red-400 text-[10px] font-black">
          {atRisk.length}
        </span>
        {expanded ? <ChevronUp size={14} className="text-neutral-500" /> : <ChevronDown size={14} className="text-neutral-500" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {atRisk.map((student) => (
            <div
              key={student.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${riskColor(student.riskLevel)} cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all`}
              onClick={() => onContactStudent?.(student.id)}
            >
              <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0 overflow-hidden">
                {student.avatarUrl ? (
                  <img src={student.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={14} className="text-neutral-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-xs truncate">{student.name}</span>
                  <span className={`px-1 py-0.5 rounded text-[8px] font-black ${riskColor(student.riskLevel)}`}>
                    {riskBadge(student.riskLevel)}
                  </span>
                </div>
                <p className="text-[10px] text-neutral-400 mt-0.5">{student.reason}</p>
                <div className="flex items-center gap-3 mt-1 text-[9px] text-neutral-500">
                  <span className="flex items-center gap-0.5">
                    <Clock size={8} />
                    {student.daysSinceLastTraining}d sem treinar
                  </span>
                  <span className="flex items-center gap-0.5">
                    {student.performanceTrend === 'down' ? (
                      <><TrendingDown size={8} className="text-red-400" /> Performance ↓</>
                    ) : (
                      <><Activity size={8} /> {student.performanceTrend}</>
                    )}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
