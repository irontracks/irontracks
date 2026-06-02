'use client'

import React, { useState } from 'react'
import { FlaskConical, Plus, Loader2, X } from 'lucide-react'
import { useLabExams } from '@/hooks/useLabExams'
import type { LabExam } from '@/types/labExam'
import { LabExamUploadModal } from './LabExamUploadModal'
import { LabExamCard } from './LabExamCard'
import { LabExamProtocolView } from './LabExamProtocolView'

/**
 * Seção de Exames Laboratoriais — botão de adicionar, lista de exames e os
 * modais de upload e visualização do protocolo. Auto-contida pra plugar no
 * AssessmentHistory com uma linha.
 *
 * studentUserId: null/undefined = autoavaliação; preenchido = fluxo personal.
 */
export function LabExamsSection({ studentUserId }: { studentUserId?: string | null }) {
  const { exams, loading, error, reload, removeExam } = useLabExams(studentUserId)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [viewing, setViewing] = useState<LabExam | null>(null)

  const handleDelete = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Apagar este exame e seu protocolo?')) return
    await removeExam(id)
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-yellow-500" />
          <h2 className="text-base font-black text-white">Exames Laboratoriais</h2>
          <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">VIP</span>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition active:scale-95"
          style={{ background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.3)', color: '#fde047' }}
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </button>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      ) : exams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 p-6 text-center">
          <FlaskConical className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
          <p className="text-sm text-neutral-400">Nenhum exame ainda.</p>
          <p className="text-[11px] text-neutral-600 mt-1">Suba seus exames de sangue e receba um protocolo integrado de treino, dieta e suplementação.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {exams.map((exam) => (
            <LabExamCard
              key={exam.id}
              exam={exam}
              onView={() => exam.protocol && setViewing(exam)}
              onDelete={() => handleDelete(exam.id)}
            />
          ))}
        </div>
      )}

      <LabExamUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        studentUserId={studentUserId}
        onSaved={() => { void reload() }}
      />

      {/* Visualização do protocolo de um exame já analisado */}
      {viewing?.protocol && (
        <div className="fixed inset-0 z-[2200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)' }}>
                  <FlaskConical className="w-5 h-5 text-yellow-500" />
                </div>
                <h2 className="text-base font-black text-white">Protocolo do exame</h2>
              </div>
              <button onClick={() => setViewing(null)} aria-label="Fechar"
                className="w-9 h-9 rounded-xl border border-neutral-700 text-neutral-400 hover:text-white hover:border-yellow-500/40 transition flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <LabExamProtocolView protocol={viewing.protocol} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
