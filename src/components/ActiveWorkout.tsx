"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Gamepad2, Brain } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { useActiveWorkoutController } from './workout/useActiveWorkoutController';
import { WorkoutProvider, WorkoutLogsProvider } from './workout/WorkoutContext';
import type { WorkoutContextType } from './workout/WorkoutContext';
import { WorkoutTimerProvider } from './workout/WorkoutTimerContext';
import { useWorkoutLiveActivity } from '@/hooks/useWorkoutLiveActivity';
import WorkoutHeader from './workout/WorkoutHeader';
import ExerciseList from './workout/ExerciseList';
import WorkoutFooter from './workout/WorkoutFooter';
import Modals from './workout/Modals';
import { ActiveWorkoutProps } from './workout/types';
import { logError } from '@/lib/logger';
import { hasOutdoorCardio, shouldShowCardioPanel } from '@/utils/cardio/outdoorCardio';
import dynamic from 'next/dynamic';
const CardioGPSPanel = dynamic(() => import('@/components/workout/CardioGPSPanel'), { ssr: false });

export default function ActiveWorkout(props: ActiveWorkoutProps & { controlledByName?: string | null; onRevokeControl?: () => void | Promise<void> }) {
  const { value: controller, logs } = useActiveWorkoutController(props);
  const { session, workout, exercises } = controller;

  // ── iOS Workout Live Activity (Dynamic Island + Lock Screen) ──
  // No-op on web/Android. Keeps the LA in sync with the active workout
  // and ends it automatically when the component unmounts (finish or cancel).
  useWorkoutLiveActivity({
    workoutName: String((workout as Record<string, unknown> | null)?.title ?? 'Treino'),
    workoutStartMs: (() => {
      const raw = session?.startedAt;
      if (typeof raw === 'number' && raw > 0) return raw;
      const n = Number(String(raw ?? '').trim());
      if (Number.isFinite(n) && n > 0) return n;
      try { const t = new Date(String(raw ?? '')).getTime(); return Number.isFinite(t) ? t : 0; } catch { return 0; }
    })(),
    exercises: exercises as unknown as ReadonlyArray<Record<string, unknown>>,
    logs: (session?.logs ?? {}) as Record<string, unknown>,
    currentExerciseIdx: controller.currentExerciseIdx ?? 0,
  });

  // Exit animation — intercept back/finish callbacks to play slide-down before unmounting
  const [isExiting, setIsExiting] = React.useState(false);
  const exitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (exitTimerRef.current) clearTimeout(exitTimerRef.current); }, []);

  const triggerExit = React.useCallback((cb: () => void) => {
    if (exitTimerRef.current) return; // already exiting — prevent double-tap
    setIsExiting(true);
    exitTimerRef.current = setTimeout(() => {
      // ── Clear BEFORE calling cb so future attempts aren't permanently blocked.
      // Previously the ref kept the old timeout ID after firing, causing
      // `if (exitTimerRef.current) return` to block ALL subsequent calls —
      // including cancel retries after a failed Finalizar.
      exitTimerRef.current = null;
      try { cb(); } catch (e) { logError('ActiveWorkout.triggerExit', e); }
    }, 280);
  }, []);

  // Compute startedAtMs for the timer provider (must be before early return — Rules of Hooks)
  const rawStartedAt = session?.startedAt;
  const startedAtMs = React.useMemo(() => {
    const direct = typeof rawStartedAt === 'number' ? rawStartedAt : Number(String(rawStartedAt ?? '').trim());
    if (Number.isFinite(direct) && direct > 0) return direct;
    try { const t = new Date(String(rawStartedAt ?? '')).getTime(); return Number.isFinite(t) ? t : 0; } catch { return 0; }
  }, [rawStartedAt]);

  // Timestamp da última atividade persistida — o provider usa pra tratar um gap
  // longo (app morto/suspenso e restaurado) como pausa, evitando inflar o tempo.
  const lastActiveAtMs = Number(
    (session as Record<string, unknown> | null | undefined)?._idbSavedAt
    ?? (session as Record<string, unknown> | null | undefined)?._savedAt
    ?? 0,
  ) || 0;

  // ── Painel de cardio com GPS: só ocupa o topo quando é relevante ──
  //
  // Ele vivia fixo acima do exercício 01 em TODO treino — inclusive num treino
  // de peito, onde ninguém corre. Agora nasce só quando há corrida em andamento
  // (ou recuperada de um app morto no meio, que não pode ficar sem porta de
  // entrada) ou quando o treino tem cardio ao ar livre. Fora isso, chega por
  // ação explícita: botão no card de cardio e item no menu do header.
  const cardioUserId = String(props.settings?.userId ?? props.session?.userId ?? '') || null;
  const [cardioGpsOpened, setCardioGpsOpened] = React.useState(false);
  const [hasRecoveredCardio, setHasRecoveredCardio] = React.useState(false);

  React.useEffect(() => {
    if (!cardioUserId) return;
    let cancelled = false;
    void import('@/lib/offline/cardioPersistence')
      .then(({ recoverActiveCardio }) => recoverActiveCardio(cardioUserId))
      .then((state) => { if (!cancelled && state) setHasRecoveredCardio(true); })
      .catch((e) => { logError('ActiveWorkout.recoverCardio', e); });
    return () => { cancelled = true };
  }, [cardioUserId]);

  const workoutHasOutdoorCardio = React.useMemo(
    () => hasOutdoorCardio((exercises ?? []) as ReadonlyArray<unknown>),
    [exercises],
  );

  // Uma vez visível, NUNCA desmonta sozinho: o painel é o dono do tracking em
  // curso — tirá-lo do ar no meio de uma corrida perderia a sessão. Os três
  // estados só andam de false pra true, então a decisão é monotônica.
  const showCardioPanel = shouldShowCardioPanel({
    workoutHasOutdoorCardio,
    recoveredRun: hasRecoveredCardio,
    openedManually: cardioGpsOpened,
  });

  const openCardioGps = React.useCallback(() => {
    setCardioGpsOpened(true);
    // Deixa o painel montar antes de rolar até ele.
    setTimeout(() => {
      document.querySelector('[data-cardio-gps-panel]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, []);

  // Enhanced context injects _exitOnBack and cancelWorkout (direct, no animation)
  const enhancedController = React.useMemo((): WorkoutContextType => {
    const originalOnFinish = controller.onFinish as ((s: unknown, saved: boolean) => void) | undefined;
    return {
      ...controller,
      onFinish: originalOnFinish
        ? (s: unknown, saved: boolean) => triggerExit(() => { originalOnFinish(s, saved); })
        : originalOnFinish,
      // cancelWorkout bypasses triggerExit entirely — the cancel flow must
      // NEVER be blocked by a stale exitTimerRef from a previous Finalizar
      // attempt. It calls the original handler directly after a micro-delay
      // to let the confirmation dialog fully unmount from the DOM.
      cancelWorkout: originalOnFinish
        ? () => {
            // Clear any pending exit animation so it doesn't interfere
            if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
            setIsExiting(true);
            setTimeout(() => {
              try { originalOnFinish(null, false); } catch (e) { logError('ActiveWorkout.cancelWorkout', e); }
            }, 100);
          }
        : undefined,
      // Só oferece o atalho enquanto o painel NÃO está na tela — com ele visível,
      // um botão "abrir cardio GPS" seria exatamente a redundância que saímos
      // de cima do treino pra eliminar.
      openCardioGps: showCardioPanel ? undefined : openCardioGps,
      ...(props.onBack ? { _exitOnBack: () => triggerExit(props.onBack!) } : {}),
    };
  }, [controller, props.onBack, triggerExit, openCardioGps, showCardioPanel]);


  if (!session || !workout) {
    return (
      <div aria-live="polite" className="min-h-screen bg-neutral-900 text-white p-6">
        <div className="max-w-lg mx-auto rounded-xl bg-neutral-800 border border-neutral-700 p-6">
          <div className="text-sm text-neutral-300">Sessão inválida.</div>
          <div className="mt-4">
            <BackButton onClick={props?.onBack} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <WorkoutProvider value={enhancedController}>
     <WorkoutLogsProvider value={logs}>
     <WorkoutTimerProvider startedAtMs={startedAtMs} lastActiveAtMs={lastActiveAtMs}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: isExiting ? '100%' : 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed inset-0 z-[50] flex flex-col bg-neutral-950 text-white overflow-x-hidden"
      >
        <WorkoutHeader />

        {/* Scrollable content — sits below the fixed header. overflow-x-hidden
            here as belt + suspenders: even if some descendant (an exercise
            card, the footer, a long copy line) overshoots the viewport width,
            it gets clipped instead of letting the modal pan side-to-side. */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* #autoload: chavinha da carga automática — só aparece p/ perfis do beta
              (settings.autoLoadBeta, liberado via DB). Persiste em settings.autoLoad. */}
          {Boolean(props.settings?.autoLoadBeta) && (
            <button
              type="button"
              onClick={() => props.onToggleAutoLoad?.(!Boolean(props.settings?.autoLoad))}
              aria-pressed={Boolean(props.settings?.autoLoad)}
              aria-label="Carga automática"
              className={[
                'mx-4 mt-3 w-[calc(100%-2rem)] rounded-2xl border px-3.5 py-3 flex items-center justify-between gap-3 transition-colors',
                props.settings?.autoLoad
                  ? 'border-violet-400/20 bg-violet-500/[0.07]'
                  : 'border-white/[0.06] bg-white/[0.03]',
              ].join(' ')}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors',
                  props.settings?.autoLoad
                    ? 'border-violet-400/25 bg-violet-500/15 text-violet-200'
                    : 'border-white/[0.06] bg-white/[0.04] text-neutral-400',
                ].join(' ')}>
                  <Brain size={15} />
                </span>
                <span className="text-left min-w-0">
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-white/90">Carga automática</span>
                  <span className="block text-[11px] text-neutral-400 truncate mt-0.5">
                    {props.settings?.autoLoad ? 'O motor sugere seus pesos' : 'Pesos manuais'}
                  </span>
                </span>
              </span>
              <span className={[
                'relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full border transition-colors',
                props.settings?.autoLoad
                  ? 'bg-violet-500 border-violet-400/40 shadow-[0_0_12px_rgba(139,92,246,0.35)]'
                  : 'bg-neutral-800 border-white/[0.08]',
              ].join(' ')}>
                <span className={[
                  'inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow-sm transition-transform duration-200',
                  props.settings?.autoLoad ? 'translate-x-[23px]' : 'translate-x-[3px]',
                ].join(' ')} />
              </span>
            </button>
          )}

          {/* Teacher control badge — subtle indicator when a teacher is controlling */}
          {props.controlledByName && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between gap-2 text-sm">
              <span className="text-amber-300 font-bold text-xs flex items-center gap-2 min-w-0">
                <Gamepad2 size={13} className="text-amber-400 shrink-0" />
                <span className="truncate">Prof. <strong className="text-amber-200">{props.controlledByName}</strong> no controle</span>
              </span>
              {/* Consentimento revogável: o aluno pode retirar o controle a qualquer momento
                  (o backend aceita reject em qualquer status). Antes só dava pra sair encerrando
                  o treino. */}
              {props.onRevokeControl && (
                <button
                  type="button"
                  onClick={() => { void props.onRevokeControl?.() }}
                  className="text-[11px] font-black bg-amber-500 text-black px-3 py-1 rounded-lg hover:bg-amber-400 transition-colors shrink-0 active:scale-95"
                >
                  Retirar controle
                </button>
              )}
            </div>
          )}

          {/* GPS Cardio Tracking Panel — condicional, ver showCardioPanel acima */}
          {showCardioPanel && (
            <CardioGPSPanel
              workoutId={props.session?.workout?.id}
              userId={cardioUserId}
            />
          )}
          <ExerciseList />
        </div>

        <WorkoutFooter />
        <Modals />
      </motion.div>
     </WorkoutTimerProvider>
     </WorkoutLogsProvider>
    </WorkoutProvider>
  );
}
