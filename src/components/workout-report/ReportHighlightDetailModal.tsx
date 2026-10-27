'use client'

/**
 * A janela que abre ao tocar num card de "Destaques da sessão".
 *
 * Uma janela, quatro conteúdos — um por card. Todas respondem a mesma pergunta:
 * "de onde veio este número?", exercício a exercício. As contas NÃO moram aqui:
 * chegam prontas de `utils/report/highlightDetails` (via `useReportData`), as
 * mesmas que geram o número do card. Esta tela só desenha.
 *
 * Portal para o `body`: o relatório é um `fixed z-[1000]` com cabeçalho próprio
 * em `z-[1100]`; montada dentro dele, a janela disputaria o contexto de
 * empilhamento com esse cabeçalho.
 */
import React from 'react'
import { X } from 'lucide-react'
import { FullscreenPortal } from '@/components/stories/FullscreenPortal'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { dialogProps, backdropProps } from '@/utils/a11y/backdrop'
import type { ComparacaoDoExercicio, SeriesDoExercicio, VolumeDoExercicio } from '@/utils/report/highlightDetails'

export type DestaqueAberto = 'prs' | 'variacao' | 'volume' | 'series'

export interface PrDetalhado {
  exerciseName?: string
  e1rm: number
  prevE1rm?: number
  isAllTimePr?: boolean
  /** Melhor 1RM estimado antes desta sessão; 0 = sem histórico. */
  recordeAnterior?: number
}

interface Props {
  aberto: DestaqueAberto
  onClose: () => void
  detectedPrs: PrDetalhado[]
  volumeDetalhe: VolumeDoExercicio[]
  comparacaoVolume: ComparacaoDoExercicio[]
  seriesDetalhe: SeriesDoExercicio[]
  currentVolume: number
  volumeDeltaAbs: number
  volumeDelta: number
  setsCompleted: number
  setsPlanned: number
  emDeload: boolean
}

const TITULOS: Record<DestaqueAberto, string> = {
  prs: 'Recordes da sessão',
  variacao: 'Comparação com a sessão anterior',
  volume: 'Volume por exercício',
  series: 'Séries por exercício',
}

const kg = (n: number) => `${Math.round(n).toLocaleString('pt-BR')} kg`
const kg1 = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
/** Peso da série: sem casa decimal à toa (80 kg, 22,5 kg). */
const pesoDaSerie = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`
const sinal = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '')
const deltaKg = (n: number) => `${sinal(Math.round(n))}${Math.abs(Math.round(n)).toLocaleString('pt-BR')} kg`

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-400 leading-relaxed">{children}</p>
}

function ConteudoPrs({ prs }: { prs: PrDetalhado[] }) {
  return (
    <div className="flex flex-col gap-3">
      <Nota>
        1RM estimado é a carga que você levantaria numa repetição só, calculada a partir da sua melhor
        série de trabalho (fórmula de Epley). Aquecimento não entra na conta.
      </Nota>
      <ul className="flex flex-col gap-2">
        {prs.map((pr, i) => {
          const anterior = Number(pr.prevE1rm ?? 0)
          const recorde = Number(pr.recordeAnterior ?? 0)
          return (
            <li key={`${pr.exerciseName}-${i}`} className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 flex flex-col gap-1">
              <div className="text-sm font-bold text-white">{pr.exerciseName}</div>
              <div className="text-xl font-black text-yellow-400">{kg1(pr.e1rm)} <span className="text-xs font-semibold text-neutral-400">1RM estimado</span></div>
              <div className="text-xs text-neutral-300">
                {anterior > 0
                  ? <>Última vez: {kg1(anterior)} · <span className="text-green-400 font-bold">+{kg1(pr.e1rm - anterior)}</span></>
                  : 'Primeira vez que este exercício entra na comparação'}
              </div>
              {pr.isAllTimePr ? (
                <div className="text-xs font-bold text-amber-300">
                  ★ Recorde histórico{recorde > 0 ? ` (o anterior era ${kg1(recorde)})` : ''}
                </div>
              ) : recorde > 0 ? (
                <div className="text-xs text-neutral-400">Seu recorde histórico segue em {kg1(recorde)}</div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ConteudoVariacao({ linhas, currentVolume, volumeDeltaAbs, volumeDelta, emDeload }: {
  linhas: ComparacaoDoExercicio[]
  currentVolume: number
  volumeDeltaAbs: number
  volumeDelta: number
  emDeload: boolean
}) {
  if (linhas.length === 0) return <Nota>Não há sessão anterior deste treino para comparar.</Nota>
  const anterior = currentVolume - volumeDeltaAbs
  // Descarga: a queda foi pedida, então não se pinta de alarme exercício a
  // exercício — o mesmo critério do card (utils/report/volumeVariation).
  const corDelta = (d: number) => (emDeload || Math.round(d) === 0 ? 'text-neutral-300' : d > 0 ? 'text-green-400' : 'text-red-400')
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-neutral-900 border border-neutral-800 p-3">
        <div><div className="text-xs text-neutral-400">Hoje</div><div className="text-sm font-bold text-white">{kg(currentVolume)}</div></div>
        <div><div className="text-xs text-neutral-400">Anterior</div><div className="text-sm font-bold text-white">{kg(anterior)}</div></div>
        <div>
          <div className="text-xs text-neutral-400">Diferença</div>
          <div className={`text-sm font-bold ${corDelta(volumeDeltaAbs)}`}>
            {deltaKg(volumeDeltaAbs)}{Math.abs(volumeDelta) > 0 ? ` (${sinal(volumeDelta)}${Math.abs(volumeDelta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)` : ''}
          </div>
        </div>
      </div>
      {emDeload && <Nota>Sessão com descarga: a carga menor foi planejada.</Nota>}
      <ul className="flex flex-col divide-y divide-neutral-800">
        {linhas.map((l) => (
          <li key={l.chave} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">{l.nome}</div>
              <div className="text-xs text-neutral-400">
                {l.atualKg === 0 ? `Não feito hoje · antes ${kg(l.anteriorKg)}`
                  : l.anteriorKg === 0 ? `Novo hoje · ${kg(l.atualKg)}`
                    : `Hoje ${kg(l.atualKg)} · antes ${kg(l.anteriorKg)}`}
              </div>
            </div>
            <div className={`shrink-0 text-sm font-black tabular-nums ${corDelta(l.deltaKg)}`}>{deltaKg(l.deltaKg)}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ConteudoVolume({ linhas, currentVolume }: { linhas: VolumeDoExercicio[]; currentVolume: number }) {
  if (linhas.length === 0) return <Nota>Nenhuma série de trabalho registrada.</Nota>
  return (
    <div className="flex flex-col gap-3">
      <Nota>Volume = peso × repetições de cada série de trabalho. Aquecimento não conta.</Nota>
      <ul className="flex flex-col gap-3">
        {linhas.map((l) => {
          const pct = currentVolume > 0 ? (l.volumeKg / currentVolume) * 100 : 0
          return (
            <li key={l.chave} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-bold text-white truncate">{l.nome}</div>
                <div className="shrink-0 text-sm font-black text-white tabular-nums">{kg(l.volumeKg)}</div>
              </div>
              <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div className="h-full rounded-full bg-neutral-300" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <div className="text-xs text-neutral-400">
                {l.series} {l.series === 1 ? 'série' : 'séries'} · {Math.round(pct)}% do total
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ConteudoSeries({ linhas, setsCompleted, setsPlanned }: { linhas: SeriesDoExercicio[]; setsCompleted: number; setsPlanned: number }) {
  if (linhas.length === 0) return <Nota>Nenhuma série planejada neste treino.</Nota>
  const faltam = setsPlanned - setsCompleted
  return (
    <div className="flex flex-col gap-3">
      <Nota>
        {faltam > 0 ? `Você fez ${setsCompleted} de ${setsPlanned} séries — ${faltam === 1 ? 'faltou 1' : `faltaram ${faltam}`}.` : `Você fez as ${setsPlanned} séries planejadas.`}
      </Nota>
      <ul className="flex flex-col gap-3">
        {linhas.map((ex, i) => {
          const completo = ex.feitas >= ex.planejadas
          return (
            <li key={`${ex.nome}-${i}`} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-bold text-white truncate">{ex.nome}</div>
                <div className={`shrink-0 text-sm font-black tabular-nums ${completo ? 'text-green-400' : 'text-yellow-400'}`}>
                  {ex.feitas}/{ex.planejadas}
                </div>
              </div>
              <ul className="flex flex-col gap-1">
                {ex.series.map((s) => (
                  <li key={s.numero} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-neutral-400">{s.numero}ª série{s.marca ? ` · ${s.marca}` : ''}</span>
                    {s.feita ? (
                      <span className="text-neutral-200 tabular-nums">
                        {s.peso > 0 ? pesoDaSerie(s.peso) : 'sem carga'}{s.reps > 0 ? ` × ${s.reps}` : ''} <span className="text-green-400">✓</span>
                      </span>
                    ) : (
                      <span className="text-neutral-400">não feita</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ReportHighlightDetailModal(props: Props) {
  const { aberto, onClose } = props
  const dlgRef = useFocusTrap(true, onClose)
  const titulo = TITULOS[aberto]

  return (
    <FullscreenPortal>
      <div className="no-print fixed inset-0 z-[1300] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4" {...backdropProps(onClose)}>
        <div
          ref={dlgRef}
          {...dialogProps(titulo)}
          className="w-full sm:max-w-md max-h-[85vh] flex flex-col bg-neutral-950 border border-neutral-800 rounded-t-3xl sm:rounded-3xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-800">
            <h2 className="text-base font-black text-white">{titulo}</h2>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="tap-44 w-8 h-8 shrink-0 rounded-full bg-neutral-800 text-neutral-300 flex items-center justify-center hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain px-4 py-4 pb-safe">
            {aberto === 'prs' && <ConteudoPrs prs={props.detectedPrs} />}
            {aberto === 'variacao' && (
              <ConteudoVariacao
                linhas={props.comparacaoVolume}
                currentVolume={props.currentVolume}
                volumeDeltaAbs={props.volumeDeltaAbs}
                volumeDelta={props.volumeDelta}
                emDeload={props.emDeload}
              />
            )}
            {aberto === 'volume' && <ConteudoVolume linhas={props.volumeDetalhe} currentVolume={props.currentVolume} />}
            {aberto === 'series' && (
              <ConteudoSeries linhas={props.seriesDetalhe} setsCompleted={props.setsCompleted} setsPlanned={props.setsPlanned} />
            )}
          </div>
        </div>
      </div>
    </FullscreenPortal>
  )
}
