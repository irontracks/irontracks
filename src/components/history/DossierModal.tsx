'use client'
import React from 'react'
import { Download, Loader2, X } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackHandler } from '@/hooks/useBackHandler'
import type { DossierState } from '@/hooks/useDossier'
import type { DossierTipo, RegistroResolvido } from '@/lib/dossier/buildDossier'
import { avisoForaDoPeriodo, formatarDataBr, SEM_REGISTRO } from '@/lib/dossier/buildDossier'

interface Props {
  state: DossierState
  exporting: boolean
  onTrocarTipo: (tipo: DossierTipo) => void
  onClose: () => void
  onExportar: () => void
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-neutral-800/60 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-bold">{label}</span>
      <span className="text-sm text-white font-black tabular-nums">{valor}</span>
    </div>
  )
}

function Cabecalho<T>({ r }: { r: RegistroResolvido<T> | null }) {
  if (!r) return <p className="text-xs text-neutral-400">{SEM_REGISTRO}</p>
  if (r.foraDoPeriodo) {
    return <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">{avisoForaDoPeriodo(r.data)}</p>
  }
  return <p className="text-xs text-neutral-400">Registro de {formatarDataBr(r.data)}</p>
}

const num = (v: unknown, casas = 0, sufixo = '') => {
  const n = Number(v)
  return Number.isFinite(n) ? `${n.toLocaleString('pt-BR', { maximumFractionDigits: casas })}${sufixo}` : '—'
}

/**
 * Prévia do dossiê na tela (o PDF é o `buildDossierHtml`, com o mesmo input).
 * Mostra só o essencial de cada seção — o documento completo sai em "Exportar".
 */
export function DossierModal({ state, exporting, onTrocarTipo, onClose, onExportar }: Props) {
  const focusTrapRef = useFocusTrap(true, onClose)
  useBackHandler(true, onClose)
  const tipo: DossierTipo = state.status === 'idle' ? 'week' : state.tipo
  const titulo = tipo === 'week' ? 'Dossiê semanal' : 'Dossiê mensal'

  return (
    <div role="presentation" className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div role="none" className="bg-neutral-900 w-full max-w-lg max-h-[calc(100dvh-2rem)] rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div ref={focusTrapRef} role="dialog" aria-modal="true" aria-label={titulo} className="flex flex-col min-h-0">
          <div className="shrink-0 p-4 border-b border-neutral-800 flex items-start gap-3">
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-bold">Avaliação externa</div>
              <div className="text-lg font-black text-white">{titulo}</div>
              {state.status === 'ready' && (
                <div className="text-xs text-neutral-400">{formatarDataBr(state.input.periodo.inicio)} – {formatarDataBr(state.input.periodo.fim)}</div>
              )}
            </div>
            <div className="flex rounded-lg border border-neutral-700 overflow-hidden" role="group" aria-label="Período do dossiê">
              {(['week', 'month'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tipo === t}
                  onClick={() => onTrocarTipo(t)}
                  className={`tap-44 px-2.5 py-1 text-[11px] font-bold ${tipo === t ? 'bg-yellow-500 text-black' : 'text-neutral-300'}`}
                >
                  {t === 'week' ? 'Semanal' : 'Mensal'}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar dossiê" className="tap-44 p-1 text-neutral-400 hover:text-white"><X size={18} /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {state.status === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-neutral-300"><Loader2 size={16} className="animate-spin" /> Montando o dossiê…</div>
            )}
            {state.status === 'error' && <p className="text-sm text-red-400">{state.error}</p>}
            {state.status === 'ready' && (() => {
              const { input } = state
              const t = input.treino?.stats
              const n = input.nutricao
              const ex = input.exame
              const av = input.avaliacaoFisica
              const ft = input.avaliacaoFoto
              const exProt = (ex?.registro.protocol && typeof ex.registro.protocol === 'object' ? ex.registro.protocol : {}) as Record<string, unknown>
              const avReg = av?.registro ?? {}
              const ftReg = ft?.registro ?? {}
              const ftAn = (ftReg.analysis && typeof ftReg.analysis === 'object' ? ftReg.analysis : {}) as Record<string, unknown>
              return (
                <>
                  <section aria-label="Treinos" className="space-y-1">
                    <h3 className="text-[11px] t-meta-inherit text-yellow-500/80">Treinos</h3>
                    {t && Number(t.count) > 0 ? (
                      <>
                        <Linha label="Treinos" valor={num(t.count)} />
                        <Linha label="Tempo total" valor={`${num(t.totalMinutes)} min`} />
                        <Linha label="Volume" valor={`${num(t.totalVolumeKg)} kg`} />
                      </>
                    ) : <p className="text-xs text-neutral-400">Nenhum treino concluído no período.</p>}
                  </section>
                  <section aria-label="Dieta" className="space-y-1">
                    <h3 className="text-[11px] t-meta-inherit text-yellow-500/80">Dieta</h3>
                    {n && n.loggedDays > 0 ? (
                      <>
                        <Linha label="Média diária" valor={`${num(n.avgCalories)} kcal`} />
                        <Linha label="Proteína" valor={`${num(n.avgProtein)} g`} />
                        <Linha label="Dias lançados" valor={`${n.loggedDays} de ${n.windowDays}`} />
                      </>
                    ) : <p className="text-xs text-neutral-400">Nenhuma refeição lançada no período.</p>}
                  </section>
                  <section aria-label="Exames" className="space-y-1">
                    <h3 className="text-[11px] t-meta-inherit text-yellow-500/80">Exames</h3>
                    <Cabecalho r={ex} />
                    {ex && typeof exProt.headline === 'string' && exProt.headline && <p className="text-sm text-white font-bold">{exProt.headline}</p>}
                  </section>
                  <section aria-label="Avaliação física" className="space-y-1">
                    <h3 className="text-[11px] t-meta-inherit text-yellow-500/80">Avaliação física</h3>
                    <Cabecalho r={av} />
                    {av && (
                      <>
                        <Linha label="Peso" valor={num(avReg.weight, 1, ' kg')} />
                        <Linha label="Gordura" valor={num(avReg.body_fat_percentage ?? avReg.body_fat_percentage_skinfold ?? avReg.bia_body_fat_percentage, 1, '%')} />
                      </>
                    )}
                  </section>
                  <section aria-label="Avaliação por foto" className="space-y-1">
                    <h3 className="text-[11px] t-meta-inherit text-yellow-500/80">Avaliação por foto</h3>
                    <Cabecalho r={ft} />
                    {ft && (
                      <>
                        <Linha label="Gordura estimada" valor={`${num(ftReg.body_fat_estimate_low)}–${num(ftReg.body_fat_estimate_high)}%`} />
                        {typeof ftAn.summary === 'string' && ftAn.summary && <p className="text-xs text-neutral-300">{ftAn.summary}</p>}
                      </>
                    )}
                  </section>
                </>
              )
            })()}
          </div>

          <div className="shrink-0 p-4 border-t border-neutral-800 flex gap-2">
            <button
              type="button"
              disabled={state.status !== 'ready' || exporting}
              onClick={onExportar}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-500 text-black font-black py-3 disabled:opacity-50"
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {exporting ? 'Gerando…' : 'Exportar dossiê (PDF)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DossierModal
