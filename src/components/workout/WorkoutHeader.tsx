'use client';

import React from 'react';
import { Clock, GripVertical, MoreHorizontal, Pause, Play, Plus, Satellite, UserPlus, X } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import InviteManager from '@/components/InviteManager';
import { useWorkoutContext } from './WorkoutContext';
import { useWorkoutTimer } from './WorkoutTimerContext';
import HeartRateMonitor from './HeartRateMonitor';
import { stripDayPrefix } from '@/lib/workout/workoutTitle'
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { logError, logWarn } from '@/lib/logger';

export default function WorkoutHeader() {
  const {
    workout,
    exercises,
    inviteOpen,
    setInviteOpen,
    openFullEditor,
    openOrganizeModal,
    sendInvite,
    alert,
    completedSets,
    totalSets,
    progressPct,
    _exitOnBack: exitOnBack,
    openCardioGps,
    confirm,
    cancelWorkout,
  } = useWorkoutContext();
  const { elapsedSeconds, formatElapsed, isPaused: timerPaused, togglePause } = useWorkoutTimer();

  // Pausa em equipe transmite ao parceiro; sozinho congela o cronômetro local.
  // Degrada sem provider (o hook devolve o contexto vazio).
  const teamCtx = useTeamWorkout() as unknown as {
    teamSession: { id: string } | null
    sessionPaused: boolean
    pauseSession: () => void
    resumeSession: () => void
  };
  const inTeamSession = !!teamCtx?.teamSession?.id;
  const teamPaused = inTeamSession && !!teamCtx?.sessionPaused;
  const isPaused = teamPaused || timerPaused;

  // Descartar treino: saiu do rodapé em 18/08/2026 — lá era um X colado no
  // "Finalizar", dois botões de sair lado a lado. Foi para o menu "…", e aí o
  // dono não achou mais ("estamos sem o botão de encerrar sem salvar", 19/08).
  // Voltou a ser um X, agora AQUI no header: longe do "Finalizar" (não há como
  // confundir a saída com o encerramento que grava) e visível sem abrir menu.
  // Fica em UM lugar só — dois caminhos para a mesma ação destrutiva é convite
  // ao toque errado.
  const cancelBusyRef = React.useRef(false);
  const descartarTreino = React.useCallback(async () => {
    if (cancelBusyRef.current) return;
    cancelBusyRef.current = true;
    try {
      // A polaridade importa: o `confirm` resolve `false` ao fechar por fora,
      // então DESCARTAR é o confirmText e continuar é o caminho do `false`.
      const ok = await confirm(
        'Você perde as séries registradas nesta sessão. Isso não pode ser desfeito.',
        'Descartar este treino?',
        { confirmText: 'Descartar', cancelText: 'Continuar treinando', destructive: true },
      );
      if (!ok) { cancelBusyRef.current = false; return; }
      if (typeof cancelWorkout === 'function') cancelWorkout();
      else logWarn('WorkoutHeader', 'cancelWorkout is not available');
    } catch (e) {
      logError('WorkoutHeader.descartar', e);
    } finally {
      setTimeout(() => { cancelBusyRef.current = false; }, 1500);
    }
  }, [confirm, cancelWorkout]);

  const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

  const [overflowOpen, setOverflowOpen] = React.useState(false);
  const overflowRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  return (
    <>
      <div
        className="bg-neutral-950/80 backdrop-blur-xl border-b border-white/[0.06] px-4 md:px-6 pb-2 flex-shrink-0 relative"
        style={{ paddingTop: 'max(calc(env(safe-area-inset-top) - 48px), 6px)' }}
      >
        {/* Halo dourado no topo — profundidade sem peso visual */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.25), transparent)' }}
        />
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BackButton onClick={exitOnBack} className="!py-0.5" />

            {/* Estes botões JÁ SUMIRAM uma vez, e não por remoção: até 22/08/2026
                o bloco ficava `opacity-0 pointer-events-none` "durante a execução
                da série, para reduzir distração". Só que `ui.activeExecution` nasce
                ao iniciar a série pelo timer de descanso e só morre quando AQUELA
                série é concluída — quem inicia e não conclui (trocou de exercício,
                foi editar, largou o aparelho) perde Descartar, "…" e Editar treino
                pelo resto da sessão. Esconder a única saída do treino não paga a
                distração que evita. Guard: headerBotoesSempreAlcancaveis.test.tsx */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openFullEditor?.()}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-yellow-500/10 border border-yellow-500/25 text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500/40 transition-colors active:scale-95 whitespace-nowrap"
                title="Editar treino (exercícios, cardio, ordem)"
              >
                <Plus size={16} />
                <span className="text-sm font-black hidden sm:inline">Editar treino</span>
              </button>

              {/* Overflow menu */}
              <div className="relative" ref={overflowRef}>
                <button aria-label="Mais opções"
                  type="button"
                  onClick={() => setOverflowOpen(v => !v)}
                  className="inline-flex items-center justify-center tap-44 w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-yellow-400 hover:border-yellow-500/30 hover:bg-neutral-800 transition-colors active:scale-95"
                  title="Mais opções"
                >
                  <MoreHorizontal size={16} />
                </button>

                {overflowOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-48 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl z-10 overflow-hidden animate-dropdown-in">
                    <button
                      type="button"
                      onClick={() => { openOrganizeModal(); setOverflowOpen(false); }}
                      disabled={exercises.length < 2}
                      className={[
                        'w-full flex items-center gap-3 px-4 py-3 text-sm font-black text-left transition-colors',
                        exercises.length < 2
                          ? 'text-neutral-700 cursor-not-allowed'
                          : 'text-yellow-400 hover:bg-neutral-800',
                      ].join(' ')}
                    >
                      <GripVertical size={15} />
                      Organizar
                    </button>
                    {/* Saída de emergência do cardio GPS — presente só quando o
                        painel não está no topo (ver openCardioGps no contexto). */}
                    {openCardioGps && (
                      <button
                        type="button"
                        onClick={() => { openCardioGps(); setOverflowOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-black text-left text-emerald-400 hover:bg-neutral-800 transition-colors border-t border-neutral-800"
                      >
                        <Satellite size={15} />
                        Cardio com GPS
                      </button>
                    )}
                    <div className="h-px bg-neutral-800" />
                    <button
                      type="button"
                      onClick={() => { setInviteOpen(true); setOverflowOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-black text-left text-yellow-400 hover:bg-neutral-800 transition-colors"
                    >
                      <UserPlus size={15} />
                      Convidar
                    </button>
                  </div>
                )}
              </div>

              {/* Sair sem gravar no histórico. Mudo de propósito: a palavra
                  "Descartar" ao lado de "Editar treino" competiria com a ação
                  principal do header — quem confirma é o diálogo, que diz o que
                  se perde. */}
              <button
                type="button"
                aria-label="Descartar treino"
                title="Descartar treino (sai sem salvar no histórico)"
                onClick={() => { void descartarTreino(); }}
                className="inline-flex items-center justify-center tap-44 w-9 h-9 rounded-xl bg-neutral-900 border border-red-500/20 text-red-500 hover:bg-red-500/10 hover:border-red-500/40 transition-colors active:scale-95"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-end gap-2">
              {/* Sem o prefixo de dia: você já está treinando, e eram esses seis
                  caracteres que empurravam "Costas + Ombro" para fora. */}
              <div className="font-black text-white truncate tracking-tight">{stripDayPrefix(workout?.title) || 'Treino'}</div>
              <HeartRateMonitor />
            </div>
            <div className="text-xs text-neutral-400 flex items-center justify-end gap-2 mt-0.5">
              {/* Progress Ring SVG */}
              {totalSets > 0 && (() => {
                const size = 32;
                const stroke = 3.5;
                const radius = (size - stroke) / 2;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (progressPct / 100) * circumference;
                const ringColor = progressPct >= 90 ? '#10b981' : progressPct >= 50 ? '#f59e0b' : '#d97706';
                return (
                  <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                    <svg width={size} height={size} className="rotate-[-90deg]">
                      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
                      <circle
                        cx={size / 2} cy={size / 2} r={radius} fill="none"
                        stroke={ringColor}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        style={{
                          transition: 'stroke-dashoffset 0.5s ease-out, stroke 0.3s',
                          filter: progressPct >= 80 ? `drop-shadow(0 0 4px ${ringColor}80)` : 'none',
                        }}
                      />
                    </svg>
                  </div>
                );
              })()}
              <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] border border-white/[0.07] px-2.5 py-1">
                {totalSets > 0 && (
                  <>
                    <span className="font-mono tabular-nums text-neutral-400">
                      {completedSets}<span className="text-neutral-600">/{totalSets}</span>
                    </span>
                    <span className="h-3 w-px bg-white/10" />
                  </>
                )}
                <Clock size={13} className="text-yellow-500/80" />
                <span className={`font-mono tabular-nums ${isPaused ? 'text-yellow-300 animate-pulse' : 'text-yellow-400'}`}>
                  {formatElapsed(elapsedSeconds)}
                </span>
                {/* A pausa acompanha o número que ela controla — no rodapé ela
                    ficava órfã depois que o cronômetro subiu para cá. */}
                <button
                  type="button"
                  onClick={() => {
                    if (inTeamSession) { teamPaused ? teamCtx.resumeSession() : teamCtx.pauseSession() }
                    else { togglePause() }
                  }}
                  aria-label={isPaused ? 'Retomar treino' : 'Pausar treino'}
                  title={isPaused ? 'Retomar treino' : 'Pausar treino'}
                  className={[
                    'tap-44 -my-1 ml-0.5 w-6 h-6 flex items-center justify-center rounded-md shrink-0 transition-all active:scale-90',
                    isPaused ? 'bg-yellow-500 text-black' : 'text-neutral-400 hover:text-yellow-400',
                  ].join(' ')}
                >
                  {isPaused ? <Play size={11} /> : <Pause size={11} />}
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar — premium animated gradient */}
      {totalSets > 0 && (
        <div className="h-[3px] bg-neutral-800 w-full relative overflow-hidden">
          <div
            className="h-full transition-all duration-500 ease-out relative"
            style={{
              width: `${progressPct}%`,
              background: progressPct >= 90
                ? 'linear-gradient(90deg, #d97706, #f59e0b, #10b981, #34d399)'
                : progressPct >= 50
                  ? 'linear-gradient(90deg, #92400e, #d97706, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #78350f, #b45309, #d97706, #f59e0b)',
              boxShadow: progressPct >= 80 ? '0 0 12px rgba(251,191,36,0.5)' : 'none',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" style={{ animation: 'shimmer 2s ease-in-out infinite' }} />
          </div>
          {progressPct >= 100 && (
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.4), transparent)',
              animation: 'shimmer 1.5s ease-in-out infinite',
            }} />
          )}
        </div>
      )}

      <InviteManager
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={async (targetUser: unknown) => {
          try {
            const payloadWorkout = workout && typeof workout === 'object'
              ? { ...workout, exercises: Array.isArray(workout?.exercises) ? workout.exercises : [] }
              : { title: 'Treino', exercises: [] };
            await sendInvite(targetUser, payloadWorkout);
          } catch (e: unknown) {
            const msg = isRecord(e) && typeof e.message === 'string' ? e.message : String(e || '');
            await alert('Falha ao enviar convite: ' + msg);
          }
        }}
      />
    </>
  );
}
