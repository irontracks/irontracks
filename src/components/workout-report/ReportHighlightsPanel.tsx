'use client'

import React, { useState } from 'react'
import NextImage from 'next/image'
import { ChevronRight } from 'lucide-react'
import { ReportHighlightDetailModal, type DestaqueAberto, type PrDetalhado } from '@/components/workout-report/ReportHighlightDetailModal'
import type { ComparacaoDoExercicio, SeriesDoExercicio, VolumeDoExercicio } from '@/utils/report/highlightDetails'
import { classificarVariacaoVolume, rotuloVariacaoVolume } from '@/utils/report/volumeVariation'


interface ReportHighlightsPanelProps {
  prCount: number
  allTimePrCount: number
  detectedPrs: PrDetalhado[]
  volumeDeltaAbs: number
  volumeDelta: number
  currentVolume: number
  setCompletionPct: number
  setsCompleted: number
  setsPlanned: number
  /** A sessão aplicou descarga? Muda o julgamento da queda de volume. */
  emDeload?: boolean
  /** Detalhe de cada card, aberto ao tocar nele (utils/report/highlightDetails). */
  seriesDetalhe?: SeriesDoExercicio[]
  volumeDetalhe?: VolumeDoExercicio[]
  comparacaoVolume?: ComparacaoDoExercicio[]
}

/**
 * Sinal de que o card abre alguma coisa. Sem ele, o toque é capacidade
 * escondida — e capacidade escondida é capacidade ausente.
 */
function AbreDetalhe() {
  return <ChevronRight size={14} aria-hidden className="absolute top-2.5 right-2.5 z-10 text-neutral-400" />
}

const CARD_BOTAO = 'relative w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400'

export function ReportHighlightsPanel({
  prCount,
  allTimePrCount,
  detectedPrs,
  volumeDeltaAbs,
  volumeDelta,
  currentVolume,
  setCompletionPct,
  setsCompleted,
  setsPlanned,
  emDeload = false,
  seriesDetalhe = [],
  volumeDetalhe = [],
  comparacaoVolume = [],
}: ReportHighlightsPanelProps) {
  const [aberto, setAberto] = useState<DestaqueAberto | null>(null)
  if (!(prCount > 0 || (volumeDeltaAbs !== 0 && currentVolume > 0) || setCompletionPct > 0)) return null

  return (
    <div className="mb-8 p-4 rounded-2xl border border-yellow-500/25 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-neutral-900/80">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-yellow-400">⚡ Destaques da sessão</div>
        {/* O selo responde "por que os números caíram?" antes de o usuário
            perguntar. Sem ele, a sessão de descarga fica indistinguível de uma
            sessão ruim quando lida semanas depois, no histórico — e é aí que a
            leitura acontece. Neutro de propósito: descarga não é conquista nem
            alarme, e gastar dourado aqui esvaziaria a ação primária. */}
        {emDeload && (
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-300 bg-neutral-800/80 border border-neutral-700 rounded-lg px-2 py-1">
            ↓ Descarga
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {prCount > 0 && (
          <button type="button" onClick={() => setAberto('prs')} aria-label={`Ver detalhes: ${prCount} ${prCount === 1 ? 'PR alcançado' : 'PRs alcançados'}`}
            className={`${CARD_BOTAO} overflow-hidden border border-yellow-500/40 flex flex-col`}
            style={{ boxShadow: '0 0 18px rgba(234,179,8,0.18), inset 0 0 12px rgba(234,179,8,0.06)' }}>
            {/* O fundo dourado é uma CAMADA, não o fundo do botão: gradiente
                inline em <button> é o padrão de CTA improvisado que o guard
                ctaDouradoFormas proíbe — e isto não é CTA, é o card do PR, que
                virou tocável para abrir o detalhe. */}
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/15 to-amber-700/10" />
            {/* A arte comemorativa fica, mas atrás de um SCRIM. Sem ele, o
                contraste do texto dependia de onde a explosão dourada calhava
                de estar clara ou escura — ou seja, era imprevisível, e no
                aparelho o nome do exercício sumia sobre o brilho. Agora o
                gradiente garante um piso escuro constante sob o texto, que é
                como se resolve texto-sobre-imagem em qualquer lugar. */}
            <div className="absolute inset-0 opacity-25">
              <NextImage src="/report-pr.png" alt="" fill sizes="(max-width: 768px) 50vw, 200px" className="object-cover object-center" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/90 via-neutral-950/60 to-neutral-950/30" />
            <div className="relative z-10 p-3 flex flex-col gap-1">
              {/* O PR é a única conquista do app que o usuário não controla — ele
                  acontece. `badge-slam` estava no design system desde sempre com
                  ZERO usuários; é o gesto de selo batendo, e é aqui que ele
                  pertence. O atraso deixa o card assentar primeiro: bater junto
                  com a entrada vira uma coisa só e não lê como carimbo. */}
              <div className="text-2xl font-black text-yellow-400 animate-badge-slam inline-block origin-center"
                style={{ animationDelay: '260ms' }}>{prCount}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-yellow-300">
                {prCount === 1 ? 'PR alcançado' : 'PRs alcançados'}
              </div>
              {allTimePrCount > 0 && (
                <div className="text-[10px] text-amber-300 font-black">★ {allTimePrCount} recorde{allTimePrCount > 1 ? 's' : ''} histórico{allTimePrCount > 1 ? 's' : ''}!</div>
              )}
              {detectedPrs[0] && (
                <div className="text-[10px] text-yellow-100 line-clamp-2 leading-tight">
                  {detectedPrs[0].isAllTimePr ? '★ ' : ''}{detectedPrs[0].exerciseName}: {detectedPrs[0].e1rm.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg 1RM
                </div>
              )}
            </div>
            <AbreDetalhe />
          </button>
        )}
        {/* Variação com ZONA NEUTRA. Antes qualquer negativo virava vermelho de
            alarme, sem piso: uma sessão com 2 PRs exibia ao lado um bloco
            vermelho de "−209 kg / −0,8%". E a mesma tela chamava "−30,9%" de
            "semana normal" alguns blocos abaixo — dois julgamentos opostos da
            mesma grandeza. O limiar e o raciocínio estão em
            utils/report/volumeVariation.ts. */}
        {volumeDeltaAbs !== 0 && currentVolume > 0 && (() => {
          const classe = classificarVariacaoVolume(volumeDelta, emDeload)
          // `descarga` cai no NEUTRO junto com `estavel`: a queda foi pedida,
          // então não é alarme — e também não é vitória, o que descarta o verde.
          const caixa =
            classe === 'alta' ? 'bg-green-500/10 border-green-500/30'
              : classe === 'queda' ? 'bg-red-500/10 border-red-500/30'
                : 'bg-neutral-800/60 border-neutral-700/60'
          const numero =
            classe === 'alta' ? 'text-green-400'
              : classe === 'queda' ? 'text-red-400'
                : 'text-white'
          const pct =
            classe === 'alta' ? 'text-green-300'
              : classe === 'queda' ? 'text-red-300'
                : 'text-neutral-400'
          return (
            <button type="button" onClick={() => setAberto('variacao')} aria-label={`Ver detalhes: ${rotuloVariacaoVolume(classe)}`}
              className={`${CARD_BOTAO} border p-3 flex flex-col gap-1 ${caixa}`}>
              <AbreDetalhe />
              <div className={`text-2xl font-black ${numero}`}>
                {volumeDeltaAbs > 0 ? '+' : ''}{Math.round(volumeDeltaAbs).toLocaleString('pt-BR')} kg
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                {rotuloVariacaoVolume(classe)}
              </div>
              {Math.abs(volumeDelta) > 0 && (
                <div className={`text-[10px] font-mono ${pct}`}>
                  {volumeDelta > 0 ? '+' : ''}{volumeDelta.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                </div>
              )}
            </button>
          )
        })()}
        {currentVolume > 0 && (
          <button type="button" onClick={() => setAberto('volume')} aria-label="Ver detalhes: volume total"
            className={`${CARD_BOTAO} bg-neutral-800/60 border border-neutral-700/60 p-3 flex flex-col gap-1`}>
            <AbreDetalhe />
            <div className="text-2xl font-black text-white">{Math.round(currentVolume).toLocaleString('pt-BR')} kg</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Volume total</div>
          </button>
        )}
        {setCompletionPct > 0 && (
          <button type="button" onClick={() => setAberto('series')} aria-label="Ver detalhes: séries completas"
            className={`${CARD_BOTAO} border p-3 flex flex-col gap-1 ${setCompletionPct >= 90 ? 'bg-green-500/10 border-green-500/30' :
            setCompletionPct >= 70 ? 'bg-yellow-500/10 border-yellow-500/30' :
              'bg-red-500/10 border-red-500/30'
            }`}>
            <AbreDetalhe />
            <div className={`text-2xl font-black ${setCompletionPct >= 90 ? 'text-green-400' :
              setCompletionPct >= 70 ? 'text-yellow-400' : 'text-red-400'
              }`}>{setCompletionPct}%</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Séries completas</div>
            <div className="text-[10px] text-neutral-400 font-mono">{setsCompleted}/{setsPlanned}</div>
          </button>
        )}
      </div>
      {aberto && (
        <ReportHighlightDetailModal
          aberto={aberto}
          onClose={() => setAberto(null)}
          detectedPrs={detectedPrs}
          volumeDetalhe={volumeDetalhe}
          comparacaoVolume={comparacaoVolume}
          seriesDetalhe={seriesDetalhe}
          currentVolume={currentVolume}
          volumeDeltaAbs={volumeDeltaAbs}
          volumeDelta={volumeDelta}
          setsCompleted={setsCompleted}
          setsPlanned={setsPlanned}
          emDeload={emDeload}
        />
      )}
    </div>
  )
}
