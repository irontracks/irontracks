'use client'

import React, { useState } from 'react'
import { FlaskConical, Plus, Loader2, X } from 'lucide-react'
import { useLabExams } from '@/hooks/useLabExams'
import type { LabExam } from '@/types/labExam'
import { LabExamUploadModal } from './LabExamUploadModal'
import { LabExamCard } from './LabExamCard'
import { LabExamProtocolView } from './LabExamProtocolView'
import { LabExamMarkersView } from './LabExamMarkersView'
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import { useFocusTrap } from '@/hooks/useFocusTrap'

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
  /** Aba do modal: os resultados são o dado primário, então abrem primeiro. */
  const [tab, setTab] = useState<'resultados' | 'protocolo'>('resultados')
  const [gerando, setGerando] = useState(false)
  const viewingRef = useFocusTrap(!!viewing, () => setViewing(null))
  const [erroProtocolo, setErroProtocolo] = useState('')

  /**
   * Gera o protocolo que faltou. O exame do dono estava `status: 'done'` com 34
   * marcadores e `protocol` NULL — a análise nunca completou, e não havia
   * nenhum caminho na UI para tentar de novo.
   */
  const gerarProtocolo = async (examId: string) => {
    if (gerando) return
    setGerando(true); setErroProtocolo('')
    try {
      const res = await fetch('/api/ai/lab-exam-protocol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId }),
      })
      const json = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Não consegui gerar o protocolo agora.')
      await reload()
      setViewing(null)
    } catch (e) {
      setErroProtocolo(e instanceof Error ? e.message : 'Não consegui gerar o protocolo agora.')
    } finally {
      setGerando(false)
    }
  }

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
          <p className="text-[11px] text-neutral-400 mt-1">Suba seus exames de sangue e receba um protocolo integrado de treino, dieta e suplementação.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {exams.map((exam) => (
            <LabExamCard
              key={exam.id}
              exam={exam}
              // Abre com QUALQUER conteúdo — antes exigia `protocol`, e um exame
              // analisado sem protocolo mostrava a seta de "abrir" e não abria
              // nada ao toque (falha silenciosa relatada em ago/2026).
              onView={() => {
                if (!exam.protocol && !exam.extracted_markers) return
                setTab(exam.protocol && !exam.extracted_markers ? 'protocolo' : 'resultados')
                setErroProtocolo('')
                setViewing(exam)
              }}
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

      {/* Resultados + protocolo do exame já analisado */}
      {viewing && (viewing.extracted_markers || viewing.protocol) && (
        <div className="fixed inset-0 z-[2200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" {...backdropProps(() => setViewing(null))}>
          <div ref={viewingRef} {...dialogProps('Exame de sangue')} className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)' }}>
                  <FlaskConical className="w-5 h-5 text-yellow-500" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black text-white truncate">Exame de sangue</h2>
                  {viewing.lab_name ? <p className="text-[11px] text-neutral-400 truncate">{viewing.lab_name}</p> : null}
                </div>
              </div>
              <button onClick={() => setViewing(null)} aria-label="Fechar"
                className="tap-44 w-9 h-9 shrink-0 rounded-xl border border-neutral-700 text-neutral-400 hover:text-white hover:border-yellow-500/40 transition flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas só quando há os dois conteúdos — senão é ruído. */}
            {viewing.extracted_markers && viewing.protocol ? (
              <div className="flex gap-1 px-5 pt-3 shrink-0">
                {([['resultados', 'Resultados'], ['protocolo', 'Protocolo']] as const).map(([id, rotulo]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors ${tab === id ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' : 'text-neutral-400 border border-transparent hover:text-neutral-300'}`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'protocolo' && viewing.protocol ? (
                <LabExamProtocolView protocol={viewing.protocol} />
              ) : viewing.extracted_markers ? (
                <>
                  <LabExamMarkersView extracted={viewing.extracted_markers} />
                  {!viewing.protocol ? (
                    <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
                      <p className="text-[13px] font-bold text-white">
                        {viewing.status === 'failed' ? 'A geração do protocolo falhou' : 'Protocolo ainda não gerado'}
                      </p>
                      <p className="mt-1 text-[12px] leading-snug text-neutral-400">
                        {viewing.status === 'failed'
                          ? 'Seus resultados estão salvos e completos — só o plano em cima deles não foi concluído. Pode tentar de novo.'
                          : 'Os resultados foram lidos, mas o plano de treino, dieta e suplementação em cima deles não chegou a ser criado.'}
                      </p>
                      {erroProtocolo ? (
                        <p className="mt-2 text-[12px] text-red-400">{erroProtocolo}</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => gerarProtocolo(viewing.id)}
                        disabled={gerando}
                        className="mt-3 inline-flex tap-44 min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 px-4 text-[13px] font-black text-black transition-transform active:scale-95 disabled:opacity-60"
                      >
                        {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {gerando ? 'Gerando…' : 'Gerar protocolo'}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
