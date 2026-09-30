'use client';

import React, { useEffect, useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { useWorkoutTimer } from './WorkoutTimerContext';
import { useWorkoutLogs } from './WorkoutContext';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { contarConclusoes } from '@/lib/workout/retomarAoConcluir';

/**
 * Faixa "TREINO PAUSADO" + retomada automática ao concluir uma série.
 *
 * Pedido do dono (30/09/2026): pausado, o único sinal era o botão de 24px ao
 * lado do cronômetro ficar dourado e o número piscar — fácil de não ver, e o
 * treino seguia congelado enquanto ele fazia as séries, perdendo o tempo real.
 *
 * Duas decisões:
 * - A faixa fica NO FLUXO (irmã do header, fora do contêiner que rola): ela
 *   empurra a lista em vez de cobrir alguém — faixa `fixed` no topo do treino
 *   ativo sempre cobriu alguma coisa (ver a nota do consentimento do professor
 *   em `ActiveWorkout`). Tocar nela retoma.
 * - Concluir uma série (inclusive um lado do unilateral) com o treino pausado
 *   retoma sozinho: quem concluiu está treinando, e o tempo precisa voltar a
 *   contar. Quem decide é `contarConclusoes`, pura.
 */
export default function TreinoPausado() {
  const { isPaused: timerPaused, togglePause } = useWorkoutTimer();
  const logs = useWorkoutLogs();
  const teamCtx = useTeamWorkout() as unknown as {
    teamSession: { id: string } | null
    sessionPaused: boolean
    resumeSession: () => void
  } | null;
  const emEquipe = !!teamCtx?.teamSession?.id;
  const pausadoEmEquipe = emEquipe && !!teamCtx?.sessionPaused;
  const pausado = timerPaused || pausadoEmEquipe;

  // A ação de retomar lida por ref: o efeito abaixo reage só às conclusões.
  const retomarRef = useRef<() => void>(() => {});
  useEffect(() => {
    retomarRef.current = () => {
      if (pausadoEmEquipe) teamCtx?.resumeSession();
      else if (timerPaused) togglePause();
    };
  });

  const conclusoes = contarConclusoes(logs);
  const anteriorRef = useRef<number | null>(null);
  useEffect(() => {
    const anterior = anteriorRef.current;
    anteriorRef.current = conclusoes;
    // Primeira leitura (montagem ou sessão restaurada) só registra a base.
    if (anterior === null) return;
    if (conclusoes > anterior && pausado) retomarRef.current();
  }, [conclusoes, pausado]);

  if (!pausado) return null;

  return (
    <button
      type="button"
      onClick={() => retomarRef.current()}
      aria-label="Treino pausado. Tocar para retomar"
      className="w-full shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-500/15 border-b border-yellow-500/30 text-yellow-300 active:bg-yellow-500/25"
    >
      <Pause size={14} className="animate-pulse" aria-hidden="true" />
      <span className="text-xs font-black uppercase tracking-widest">Treino pausado</span>
      <span className="text-xs text-yellow-200/80">· tocar para retomar</span>
      <Play size={12} aria-hidden="true" />
    </button>
  );
}
