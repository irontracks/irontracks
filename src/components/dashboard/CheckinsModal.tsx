'use client'

import { X } from 'lucide-react'

type UnknownRecord = Record<string, unknown>

type CheckinsModalProps = {
  isOpen: boolean
  onClose: () => void
  checkinsRange: '7d' | '30d'
  setCheckinsRange: (value: '7d' | '30d') => void
  checkinsFilter: 'all' | 'pre' | 'post'
  setCheckinsFilter: (value: 'all' | 'pre' | 'post') => void
  checkinsRows: Array<UnknownRecord>
  checkinsLoading: boolean
  toNumberOrNull: (v: unknown) => number | null
  isPlainRecord: (v: unknown) => v is UnknownRecord
}

export const CheckinsModal = ({
  isOpen,
  onClose,
  checkinsRange,
  setCheckinsRange,
  checkinsFilter,
  setCheckinsFilter,
  checkinsRows,
  checkinsLoading,
  toNumberOrNull,
  isPlainRecord,
}: CheckinsModalProps) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Check-ins</div>
            <div className="text-white font-black text-lg truncate">Histórico</div>
            <div className="text-xs text-neutral-400">Tendências, alertas e sugestões.</div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-neutral-800 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {(['7d', '30d'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setCheckinsRange(k)}
                className={
                  checkinsRange === k
                    ? 'min-h-[36px] px-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                    : 'min-h-[36px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                }
              >
                {k === '7d' ? '7 dias' : '30 dias'}
              </button>
            ))}
            <div className="ml-auto text-xs text-neutral-500">
              {checkinsLoading ? 'Carregando…' : `${checkinsRows.length} item(s)`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(['all', 'pre', 'post'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setCheckinsFilter(k)}
                className={
                  checkinsFilter === k
                    ? 'min-h-[36px] px-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                    : 'min-h-[36px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                }
              >
                {k === 'all' ? 'Todos' : k === 'pre' ? 'Pré' : 'Pós'}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
          {(() => {
            const rows = Array.isArray(checkinsRows) ? checkinsRows : []
            const filtered = checkinsFilter === 'all' ? rows : rows.filter((r) => String(r?.kind || '').trim() === checkinsFilter)
            const avg = (vals: Array<number | null>) => {
              const list = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
              if (!list.length) return null
              return list.reduce((a, b) => a + b, 0) / list.length
            }
            const preRows = rows.filter((r) => String(r?.kind || '').trim() === 'pre')
            const postRows = rows.filter((r) => String(r?.kind || '').trim() === 'post')
            const preAvgEnergy = avg(preRows.map((r) => toNumberOrNull(r?.energy)))
            const preAvgSoreness = avg(preRows.map((r) => toNumberOrNull(r?.soreness)))
            const preAvgTime = avg(
              preRows.map((r) => {
                const answers: UnknownRecord = isPlainRecord(r?.answers) ? r.answers : {}
                return toNumberOrNull(answers?.time_minutes ?? answers?.timeMinutes)
              }),
            )
            const postAvgSoreness = avg(postRows.map((r) => toNumberOrNull(r?.soreness)))
            const postAvgSatisfaction = avg(postRows.map((r) => toNumberOrNull(r?.mood)))
            const postAvgRpe = avg(
              postRows.map((r) => {
                const answers: UnknownRecord = isPlainRecord(r?.answers) ? r.answers : {}
                return toNumberOrNull(answers?.rpe)
              }),
            )

            const highSorenessCount = rows.filter((r) => {
              const s = toNumberOrNull(r?.soreness)
              return s != null && s >= 7
            }).length
            const lowEnergyCount = preRows.filter((r) => {
              const e = toNumberOrNull(r?.energy)
              return e != null && e <= 2
            }).length

            const alerts: string[] = []
            if (highSorenessCount >= 3) alerts.push('Dor alta (≥ 7) apareceu 3+ vezes no período.')
            if (preAvgSoreness != null && preAvgSoreness >= 7) alerts.push('Média de dor no pré está alta (≥ 7).')
            if (lowEnergyCount >= 3) alerts.push('Energia baixa (≤ 2) apareceu 3+ vezes no período.')
            if (postAvgSatisfaction != null && postAvgSatisfaction <= 2) alerts.push('Satisfação média no pós está baixa (≤ 2).')

            const suggestions: string[] = []
            if (highSorenessCount >= 3 || (preAvgSoreness != null && preAvgSoreness >= 7) || (postAvgSoreness != null && postAvgSoreness >= 7)) {
              suggestions.push('Dor alta: considere reduzir volume/carga 20–30% e priorizar técnica + mobilidade.')
            }
            if (lowEnergyCount >= 3 || (preAvgEnergy != null && preAvgEnergy <= 2.2)) {
              suggestions.push('Energia baixa: mantenha um treino mais curto, evite falha, e foque em recuperação (sono/estresse).')
            }
            if (postAvgRpe != null && postAvgRpe >= 9) {
              suggestions.push('RPE médio alto: reduza um pouco a intensidade e aumente descanso entre séries.')
            }
            if (postAvgSatisfaction != null && postAvgSatisfaction <= 2) {
              suggestions.push('Satisfação baixa: revise seleção de exercícios e meta da sessão para manter consistência.')
            }

            return (
              <>
                {(alerts.length > 0 || suggestions.length > 0) && (
                  <div className="mb-4 space-y-3">
                    {alerts.length > 0 && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        <div className="text-xs font-black uppercase tracking-widest text-red-300 mb-2">Alertas</div>
                        <ul className="space-y-1">
                          {alerts.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {suggestions.length > 0 && (
                      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                        <div className="text-xs font-black uppercase tracking-widest text-yellow-300 mb-2">Sugestões</div>
                        <ul className="space-y-1">
                          {suggestions.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {filtered.length === 0 ? (
                  <div className="text-sm text-neutral-400">Nenhum check-in registrado.</div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((row, idx) => {
                      const answers: UnknownRecord = isPlainRecord(row?.answers) ? row.answers : {}
                      return (
                        <div key={`${row?.id ?? idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-neutral-500 font-bold">
                            <span>{String(row?.kind || '').toUpperCase() || '—'}</span>
                            <span>•</span>
                            <span>{String(row?.created_at || '').slice(0, 10) || '—'}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-neutral-300">
                            <div>
                              <div className="text-neutral-500">Energia</div>
                              <div className="font-semibold">{toNumberOrNull(row?.energy) ?? '—'}</div>
                            </div>
                            <div>
                              <div className="text-neutral-500">Dor</div>
                              <div className="font-semibold">{toNumberOrNull(row?.soreness) ?? '—'}</div>
                            </div>
                            <div>
                              <div className="text-neutral-500">Humor</div>
                              <div className="font-semibold">{toNumberOrNull(row?.mood) ?? '—'}</div>
                            </div>
                            <div>
                              <div className="text-neutral-500">RPE</div>
                              <div className="font-semibold">{toNumberOrNull(answers?.rpe) ?? '—'}</div>
                            </div>
                          </div>
                          {row?.notes ? <div className="mt-2 text-xs text-neutral-300">{String(row.notes)}</div> : null}
                          {answers?.time_minutes || answers?.timeMinutes ? (
                            <div className="mt-1 text-xs text-neutral-500">
                              Tempo: {toNumberOrNull(answers?.time_minutes ?? answers?.timeMinutes) ?? '—'} min
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
