'use client'

/**
 * A janela que abre ao tocar num card de "Destaques da sessão".
 *
 * Uma janela, quatro conteúdos — um por card. Todas respondem a mesma pergunta:
 * "de onde veio este número?", exercício a exercício. As contas NÃO moram aqui:
 * chegam prontas de `utils/report/highlightDetails` (via `useReportData`), as
 * mesmas que geram o número do card. Esta tela só desenha.
 *
 * Desenho (pedido do dono, 27/10/2026, sobre a 1ª versão "simples demais, só
 * abre metade da tela"): folha de quase a tela inteira; topo com o ícone e a
 * COR do card que a abriu, e o número do card repetido em destaque — quem abre
 * a janela precisa reconhecer de onde veio antes de ler o detalhe. A cor segue o
 * card (dourado nos PRs, verde/vermelho/neutro na variação e nas séries), nunca
 * uma nova: o tom aqui é o MESMO julgamento que o card já fez.
 *
 * Portal (`FullscreenPortal` → `portalRoot`): o relatório é um `fixed z-[1000]`
 * com cabeçalho próprio em `z-[1100]`; montada dentro dele, a janela disputaria
 * o contexto de empilhamento com esse cabeçalho.
 */
import React from 'react'
import { X, Trophy, TrendingUp, TrendingDown, Minus, Dumbbell, ListChecks, Star, Info } from 'lucide-react'
import { FullscreenPortal } from '@/components/stories/FullscreenPortal'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { dialogProps, backdropProps } from '@/utils/a11y/backdrop'
import { classificarVariacaoVolume, rotuloVariacaoVolume } from '@/utils/report/volumeVariation'
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

// ── Formatação ──────────────────────────────────────────────────────────────
const num = (n: number) => Math.round(n).toLocaleString('pt-BR')
const kg = (n: number) => `${num(n)} kg`
const kg1 = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
/** Peso da série: sem casa decimal à toa (80 kg, 22,5 kg). */
const pesoDaSerie = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`
const sinal = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '')
const deltaKg = (n: number) => `${sinal(Math.round(n))}${num(Math.abs(n))} kg`
const pct1 = (n: number) => `${sinal(n)}${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

// ── Tons — os mesmos do card que abriu a janela ─────────────────────────────
type Tom = 'ouro' | 'alta' | 'queda' | 'neutro' | 'atencao'

const TOM: Record<Tom, { hero: string; numero: string; chip: string; barra: string }> = {
  ouro: {
    hero: 'border-yellow-500/30 bg-gradient-to-br from-yellow-500/15 via-amber-500/5 to-transparent',
    numero: 'text-yellow-400',
    chip: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    barra: 'bg-yellow-400',
  },
  alta: {
    hero: 'border-green-500/30 bg-gradient-to-br from-green-500/15 via-green-500/5 to-transparent',
    numero: 'text-green-400',
    chip: 'bg-green-500/15 text-green-400 border-green-500/30',
    barra: 'bg-green-400',
  },
  queda: {
    hero: 'border-red-500/30 bg-gradient-to-br from-red-500/15 via-red-500/5 to-transparent',
    numero: 'text-red-400',
    chip: 'bg-red-500/15 text-red-400 border-red-500/30',
    barra: 'bg-red-400',
  },
  atencao: {
    hero: 'border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 via-yellow-500/5 to-transparent',
    numero: 'text-yellow-400',
    chip: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    barra: 'bg-yellow-400',
  },
  neutro: {
    hero: 'border-neutral-700/60 bg-gradient-to-br from-neutral-800/80 to-neutral-900/40',
    numero: 'text-white',
    chip: 'bg-neutral-800 text-neutral-300 border-neutral-700',
    barra: 'bg-neutral-300',
  },
}

const tomDasSeries = (pct: number): Tom => (pct >= 90 ? 'alta' : pct >= 70 ? 'atencao' : 'queda')

// ── Peças ───────────────────────────────────────────────────────────────────
function Hero({ tom, rotulo, valor, sufixo, legenda, children }: {
  tom: Tom
  rotulo: string
  valor: string
  sufixo?: string
  legenda?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className={`rounded-2xl border p-4 ${TOM[tom].hero}`}>
      <div className="text-[10px] t-meta tracking-widest">{rotulo}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-4xl font-black tabular-nums tracking-tight ${TOM[tom].numero}`}>{valor}</span>
        {sufixo && <span className="text-sm font-semibold text-neutral-400">{sufixo}</span>}
      </div>
      {legenda && <div className="mt-1 text-sm text-neutral-300">{legenda}</div>}
      {children}
    </div>
  )
}

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] t-meta tracking-widest">{children}</h3>
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
      <Info size={14} aria-hidden className="mt-0.5 shrink-0 text-neutral-400" />
      <p className="text-xs leading-relaxed text-neutral-400">{children}</p>
    </div>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-300">{children}</p>
}

function Barra({ fracao, classe }: { fracao: number; classe: string }) {
  const w = Math.max(0, Math.min(1, fracao)) * 100
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
      <div className={`h-full rounded-full ${classe}`} style={{ width: `${w}%` }} />
    </div>
  )
}

// ── PRs ─────────────────────────────────────────────────────────────────────
function ConteudoPrs({ prs }: { prs: PrDetalhado[] }) {
  const historicos = prs.filter((p) => p.isAllTimePr).length
  return (
    <div className="flex flex-col gap-5">
      <Hero
        tom="ouro"
        rotulo="Nesta sessão"
        valor={String(prs.length)}
        sufixo={prs.length === 1 ? 'PR alcançado' : 'PRs alcançados'}
        legenda={historicos > 0
          ? <span className="font-bold text-amber-300">★ {historicos} {historicos === 1 ? 'recorde histórico' : 'recordes históricos'}</span>
          : 'Melhor que a última vez, ainda abaixo do recorde histórico'}
      />
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Exercício a exercício</SecaoTitulo>
        <ul className="flex flex-col gap-3">
          {prs.map((pr, i) => {
            const anterior = Number(pr.prevE1rm ?? 0)
            const recorde = Number(pr.recordeAnterior ?? 0)
            return (
              <li key={`${pr.exerciseName}-${i}`} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-bold leading-snug text-white">{pr.exerciseName}</div>
                  {pr.isAllTimePr && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      <Star size={10} aria-hidden className="fill-current" /> Histórico
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black tabular-nums text-yellow-400">{pr.e1rm.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                  <span className="text-sm font-semibold text-neutral-400">kg · 1RM estimado</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-neutral-950/60 p-2.5">
                    <div className="text-[10px] t-meta">Última vez</div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-white">{anterior > 0 ? kg1(anterior) : '—'}</div>
                    <div className={`text-xs ${anterior > 0 ? 'font-bold text-green-400' : 'text-neutral-400'}`}>
                      {anterior > 0 ? `+${kg1(pr.e1rm - anterior)}` : 'primeira comparação'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-neutral-950/60 p-2.5">
                    <div className="text-[10px] t-meta">Recorde anterior</div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-white">{recorde > 0 ? kg1(recorde) : '—'}</div>
                    <div className={`text-xs ${pr.isAllTimePr ? 'font-bold text-amber-300' : 'text-neutral-400'}`}>
                      {pr.isAllTimePr ? (recorde > 0 ? `superado em ${kg1(pr.e1rm - recorde)}` : 'primeiro registro') : 'ainda à frente'}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
      <Nota>
        1RM estimado é a carga que você levantaria numa repetição só, calculada a partir da sua melhor
        série de trabalho (fórmula de Epley). Aquecimento não entra na conta.
      </Nota>
    </div>
  )
}

// ── Variação contra a sessão anterior ───────────────────────────────────────
function ConteudoVariacao({ linhas, currentVolume, volumeDeltaAbs, volumeDelta, emDeload }: {
  linhas: ComparacaoDoExercicio[]
  currentVolume: number
  volumeDeltaAbs: number
  volumeDelta: number
  emDeload: boolean
}) {
  if (linhas.length === 0) return <Vazio>Não há sessão anterior deste treino para comparar.</Vazio>
  const anterior = currentVolume - volumeDeltaAbs
  const classe = classificarVariacaoVolume(volumeDelta, emDeload)
  const tom: Tom = classe === 'alta' ? 'alta' : classe === 'queda' ? 'queda' : 'neutro'
  // Descarga: a queda foi pedida, então não se pinta de alarme exercício a
  // exercício — o mesmo critério do card (utils/report/volumeVariation).
  const tomDaLinha = (d: number): Tom => (emDeload || Math.round(d) === 0 ? 'neutro' : d > 0 ? 'alta' : 'queda')
  const escala = Math.max(1, ...linhas.map((l) => Math.max(l.atualKg, l.anteriorKg)))
  const subiram = linhas.filter((l) => Math.round(l.deltaKg) > 0).length
  const cairam = linhas.filter((l) => Math.round(l.deltaKg) < 0).length

  return (
    <div className="flex flex-col gap-5">
      <Hero
        tom={tom}
        rotulo={rotuloVariacaoVolume(classe)}
        valor={deltaKg(volumeDeltaAbs)}
        legenda={Math.abs(volumeDelta) > 0 ? `${pct1(volumeDelta)} em relação à sessão anterior` : undefined}
      >
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-neutral-950/50 p-2.5">
            <div className="text-[10px] t-meta">Hoje</div>
            <div className="text-base font-black tabular-nums text-white">{kg(currentVolume)}</div>
          </div>
          <div className="rounded-xl bg-neutral-950/50 p-2.5">
            <div className="text-[10px] t-meta">Anterior</div>
            <div className="text-base font-black tabular-nums text-neutral-300">{kg(anterior)}</div>
          </div>
        </div>
      </Hero>
      {emDeload && <Nota>Sessão com descarga: a carga menor foi planejada, não é queda de rendimento.</Nota>}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <SecaoTitulo>Exercício a exercício</SecaoTitulo>
          <span className="text-xs text-neutral-400">{subiram} subiram · {cairam} caíram</span>
        </div>
        <ul className="flex flex-col gap-2">
          {linhas.map((l) => {
            const t = tomDaLinha(l.deltaKg)
            const Icone = t === 'alta' ? TrendingUp : t === 'queda' ? TrendingDown : Minus
            return (
              <li key={l.chave} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold leading-snug text-white">{l.nome}</div>
                    {(l.atualKg === 0 || l.anteriorKg === 0) && (
                      <div className="mt-0.5 text-xs text-neutral-400">{l.atualKg === 0 ? 'Não feito hoje' : 'Novo nesta sessão'}</div>
                    )}
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${TOM[t].chip}`}>
                    <Icone size={12} aria-hidden />
                    {Math.round(l.deltaKg) === 0 ? 'igual' : deltaKg(l.deltaKg)}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[10px] t-meta">Hoje</span>
                    <Barra fracao={l.atualKg / escala} classe={TOM[t].barra} />
                    <span className="w-20 shrink-0 text-right text-xs font-bold tabular-nums text-white">{kg(l.atualKg)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[10px] t-meta">Antes</span>
                    <Barra fracao={l.anteriorKg / escala} classe="bg-neutral-600" />
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-neutral-400">{kg(l.anteriorKg)}</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
      <Nota>O exercício é comparado pelo nome com a última sessão deste treino. Aquecimento não entra no volume.</Nota>
    </div>
  )
}

// ── Volume total ────────────────────────────────────────────────────────────
function ConteudoVolume({ linhas, currentVolume }: { linhas: VolumeDoExercicio[]; currentVolume: number }) {
  if (linhas.length === 0) return <Vazio>Nenhuma série de trabalho registrada.</Vazio>
  const series = linhas.reduce((a, l) => a + l.series, 0)
  const maior = Math.max(1, ...linhas.map((l) => l.volumeKg))
  return (
    <div className="flex flex-col gap-5">
      <Hero
        tom="neutro"
        rotulo="Volume total"
        valor={num(currentVolume)}
        sufixo="kg"
        legenda={`${series} ${series === 1 ? 'série' : 'séries'} de trabalho em ${linhas.length} ${linhas.length === 1 ? 'exercício' : 'exercícios'}`}
      />
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Do maior para o menor</SecaoTitulo>
        <ul className="flex flex-col gap-2">
          {linhas.map((l, i) => {
            const pct = currentVolume > 0 ? (l.volumeKg / currentVolume) * 100 : 0
            return (
              <li key={l.chave} className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-xs font-bold tabular-nums text-neutral-300">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="truncate text-sm font-bold text-white">{l.nome}</div>
                    <div className="shrink-0 text-sm font-black tabular-nums text-white">{kg(l.volumeKg)}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Barra fracao={l.volumeKg / maior} classe="bg-neutral-300" />
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-neutral-400">{Math.round(pct)}%</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">{l.series} {l.series === 1 ? 'série' : 'séries'}</div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
      <Nota>Volume = peso × repetições de cada série de trabalho. Aquecimento não conta.</Nota>
    </div>
  )
}

// ── Séries completas ────────────────────────────────────────────────────────
function Anel({ fracao, classe }: { fracao: number; classe: string }) {
  const r = 26
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, fracao))
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className={`shrink-0 -rotate-90 ${classe}`}>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-neutral-800" />
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" stroke="currentColor" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - f)} />
    </svg>
  )
}

function ConteudoSeries({ linhas, setsCompleted, setsPlanned }: { linhas: SeriesDoExercicio[]; setsCompleted: number; setsPlanned: number }) {
  if (linhas.length === 0) return <Vazio>Nenhuma série planejada neste treino.</Vazio>
  const pct = setsPlanned > 0 ? Math.round((setsCompleted / setsPlanned) * 100) : 0
  const tom = tomDasSeries(pct)
  const faltam = setsPlanned - setsCompleted
  return (
    <div className="flex flex-col gap-5">
      <Hero
        tom={tom}
        rotulo="Séries completas"
        valor={`${setsCompleted}/${setsPlanned}`}
        legenda={faltam > 0 ? `${faltam === 1 ? 'Faltou 1 série' : `Faltaram ${faltam} séries`} do planejado` : 'Todas as séries planejadas foram feitas'}
      >
        <div className="mt-3 flex items-center gap-3">
          <Anel fracao={setsPlanned > 0 ? setsCompleted / setsPlanned : 0} classe={TOM[tom].numero} />
          <div>
            <div className={`text-2xl font-black tabular-nums ${TOM[tom].numero}`}>{pct}%</div>
            <div className="text-xs text-neutral-400">do treino planejado</div>
          </div>
        </div>
      </Hero>
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Exercício a exercício</SecaoTitulo>
        <ul className="flex flex-col gap-2">
          {linhas.map((ex, i) => {
            const completo = ex.feitas >= ex.planejadas
            return (
              <li key={`${ex.nome}-${i}`} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-bold leading-snug text-white">{ex.nome}</div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${completo ? TOM.alta.chip : TOM.atencao.chip}`}>
                    {ex.feitas}/{ex.planejadas}
                  </span>
                </div>
                <div className="mt-2.5 flex gap-1" aria-hidden>
                  {ex.series.map((s) => (
                    <div key={s.numero} className={`h-1.5 flex-1 rounded-full ${s.feita ? 'bg-green-400' : 'bg-neutral-700'}`} />
                  ))}
                </div>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {ex.series.map((s) => (
                    <li key={s.numero} className="flex items-center gap-2.5 text-xs">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums ${s.feita ? 'bg-green-500/15 text-green-400' : 'bg-neutral-800 text-neutral-400'}`}>
                        {s.numero}
                      </span>
                      {s.feita ? (
                        <span className="flex-1 tabular-nums text-neutral-200">
                          {s.peso > 0 ? pesoDaSerie(s.peso) : 'sem carga'}{s.reps > 0 ? ` × ${s.reps} reps` : ''}
                        </span>
                      ) : (
                        <span className="flex-1 text-neutral-400">não feita</span>
                      )}
                      {s.marca && <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-bold text-neutral-400">{s.marca}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

// ── Janela ──────────────────────────────────────────────────────────────────
export function ReportHighlightDetailModal(props: Props) {
  const { aberto, onClose } = props
  const dlgRef = useFocusTrap(true, onClose)
  const titulo = TITULOS[aberto]

  const pctSeries = props.setsPlanned > 0 ? Math.round((props.setsCompleted / props.setsPlanned) * 100) : 0
  const classeVariacao = classificarVariacaoVolume(props.volumeDelta, props.emDeload)
  const cabecalho: { Icone: typeof Trophy; tom: Tom } = aberto === 'prs'
    ? { Icone: Trophy, tom: 'ouro' }
    : aberto === 'variacao'
      ? {
        Icone: classeVariacao === 'alta' ? TrendingUp : classeVariacao === 'queda' ? TrendingDown : Minus,
        tom: classeVariacao === 'alta' ? 'alta' : classeVariacao === 'queda' ? 'queda' : 'neutro',
      }
      : aberto === 'volume'
        ? { Icone: Dumbbell, tom: 'neutro' }
        : { Icone: ListChecks, tom: tomDasSeries(pctSeries) }

  return (
    <FullscreenPortal>
      <div className="no-print fixed inset-0 z-[1300] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4" {...backdropProps(onClose)}>
        <div
          ref={dlgRef}
          {...dialogProps(titulo)}
          className="flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 sm:h-auto sm:max-h-[88vh] sm:max-w-lg sm:rounded-3xl sm:border"
        >
          <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-neutral-700" />
          </div>
          <div className="flex items-center gap-3 border-b border-neutral-800/80 px-4 pb-3 pt-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${TOM[cabecalho.tom].chip}`}>
              <cabecalho.Icone size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] t-meta tracking-widest">Destaques da sessão</div>
              <h2 className="truncate text-base font-black text-white">{titulo}</h2>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="tap-44 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-300 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-safe pt-4">
            <div className="pb-6">
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
      </div>
    </FullscreenPortal>
  )
}
