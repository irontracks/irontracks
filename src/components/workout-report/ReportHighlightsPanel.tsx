'use client'

import React from 'react'
import NextImage from 'next/image'
import { classificarVariacaoVolume, rotuloVariacaoVolume } from '@/utils/report/volumeVariation'


interface ReportHighlightsPanelProps {
  prCount: number
  allTimePrCount: number
  detectedPrs: { exerciseName?: string; e1rm: number; isAllTimePr?: boolean }[]
  volumeDeltaAbs: number
  volumeDelta: number
  currentVolume: number
  setCompletionPct: number
  setsCompleted: number
  setsPlanned: number
}

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
}: ReportHighlightsPanelProps) {
  if (!(prCount > 0 || (volumeDeltaAbs !== 0 && currentVolume > 0) || setCompletionPct > 0)) return null

  return (
    <div className="mb-8 p-4 rounded-2xl border border-yellow-500/25 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-neutral-900/80">
      <div className="text-[10px] font-black uppercase tracking-widest text-yellow-400 mb-3">⚡ Destaques da sessão</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {prCount > 0 && (
          <div className="relative overflow-hidden border border-yellow-500/40 rounded-xl flex flex-col"
            style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.14), rgba(180,83,9,0.10))', boxShadow: '0 0 18px rgba(234,179,8,0.18), inset 0 0 12px rgba(234,179,8,0.06)' }}>
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
                  {detectedPrs[0].isAllTimePr ? '★ ' : ''}{detectedPrs[0].exerciseName}: {detectedPrs[0].e1rm.toFixed(1)} kg 1RM
                </div>
              )}
            </div>
          </div>
        )}
        {/* Variação com ZONA NEUTRA. Antes qualquer negativo virava vermelho de
            alarme, sem piso: uma sessão com 2 PRs exibia ao lado um bloco
            vermelho de "−209 kg / −0,8%". E a mesma tela chamava "−30,9%" de
            "semana normal" alguns blocos abaixo — dois julgamentos opostos da
            mesma grandeza. O limiar e o raciocínio estão em
            utils/report/volumeVariation.ts. */}
        {volumeDeltaAbs !== 0 && currentVolume > 0 && (() => {
          const classe = classificarVariacaoVolume(volumeDelta)
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
            <div className={`border rounded-xl p-3 flex flex-col gap-1 ${caixa}`}>
              <div className={`text-2xl font-black ${numero}`}>
                {volumeDeltaAbs > 0 ? '+' : ''}{Math.round(volumeDeltaAbs).toLocaleString('pt-BR')} kg
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                {rotuloVariacaoVolume(classe)}
              </div>
              {Math.abs(volumeDelta) > 0 && (
                <div className={`text-[10px] font-mono ${pct}`}>
                  {volumeDelta > 0 ? '+' : ''}{volumeDelta.toFixed(1)}%
                </div>
              )}
            </div>
          )
        })()}
        {currentVolume > 0 && (
          <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-xl p-3 flex flex-col gap-1">
            <div className="text-2xl font-black text-white">{Math.round(currentVolume).toLocaleString('pt-BR')} kg</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Volume total</div>
          </div>
        )}
        {setCompletionPct > 0 && (
          <div className={`border rounded-xl p-3 flex flex-col gap-1 ${setCompletionPct >= 90 ? 'bg-green-500/10 border-green-500/30' :
            setCompletionPct >= 70 ? 'bg-yellow-500/10 border-yellow-500/30' :
              'bg-red-500/10 border-red-500/30'
            }`}>
            <div className={`text-2xl font-black ${setCompletionPct >= 90 ? 'text-green-400' :
              setCompletionPct >= 70 ? 'text-yellow-400' : 'text-red-400'
              }`}>{setCompletionPct}%</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Séries completas</div>
            <div className="text-[10px] text-neutral-400 font-mono">{setsCompleted}/{setsPlanned}</div>
          </div>
        )}
      </div>
    </div>
  )
}
