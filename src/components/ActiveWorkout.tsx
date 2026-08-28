"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Pause, Pencil, Gamepad2, Brain } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { useActiveWorkoutController } from './workout/useActiveWorkoutController';
import { WorkoutProvider, WorkoutLogsProvider } from './workout/WorkoutContext';
import type { WorkoutContextType } from './workout/WorkoutContext';
import { useDialog } from '@/contexts/DialogContext';
import { staleSessionAgeLabel } from '@/lib/workout/staleSession';
import { WorkoutTimerProvider } from './workout/WorkoutTimerContext';
import { useWorkoutLiveActivity } from '@/hooks/useWorkoutLiveActivity';
import WorkoutHeader from './workout/WorkoutHeader';
import ExerciseList from './workout/ExerciseList';
import WorkoutExerciseRail from './workout/WorkoutExerciseRail';
import WorkoutFooter from './workout/WorkoutFooter';
import Modals from './workout/Modals';
import { ActiveWorkoutProps } from './workout/types';
import { logError } from '@/lib/logger';
import { hasOutdoorCardio, shouldShowCardioPanel } from '@/utils/cardio/outdoorCardio';
import dynamic from 'next/dynamic';
import { MACHINE_ACCENT } from '@/lib/design/machineAccent'
const CardioGPSPanel = dynamic(() => import('@/components/workout/CardioGPSPanel'), { ssr: false });
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';

const TeamChatDrawer = dynamic(
  () => import('@/components/TeamChatDrawer').then(m => ({ default: m.TeamChatDrawer })),
  { ssr: false }
);

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

  // Ao finalizar OU cancelar o treino, sai da sessão de dupla (se houver): o RPC
  // encerra a sessão (host) ou remove o participante, e o parceiro recebe o
  // broadcast de "leave". Sem isto a team_session ficava 'active' pra sempre e o
  // parceiro achava que o outro ainda treinava. Mantido em ref pra ser chamado
  // do enhancedController (declarado antes do teamCtx).
  const endTeamSessionRef = React.useRef<() => void>(() => {});
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

  // Preenchido logo abaixo, quando o `enhancedController` é montado. Um ref
  // porque o efeito do aviso roda ANTES dele existir no corpo do componente.
  const cancelWorkoutRef = React.useRef<(() => void) | undefined>(undefined);

  // ── Sessão retomada VELHA: avisa antes de deixar o usuário seguir ──
  //
  // O `localStorage` não expirava nada (o IndexedDB expirava em 24 h — as duas
  // metades da mesma sessão discordavam), então um treino aberto na segunda e
  // esquecido reabria o app dentro dele na quarta, em silêncio. Quem finalizasse
  // dali gravaria a sessão de segunda com a data de hoje, e a DURAÇÃO alimenta a
  // estimativa de calorias — o número falso não pararia no card do treino.
  //
  // A marca vem do portão de restauração (`restoreSessionGate`), não daqui:
  // quem lê o armazenamento não abre diálogo, e quem abre diálogo não conhece o
  // armazenamento.
  //
  // A POLARIDADE da pergunta é deliberada: descartar é o botão destrutivo, e
  // continuar é o que acontece ao fechar por fora (o `confirm` resolve `false`
  // no backdrop). Invertido, um toque fora do modal apagaria as séries de um
  // treino em andamento — dano irreversível como padrão de fechamento. É a
  // mesma lição do rodapé, onde o dourado estava na opção que apaga a sessão.
  const staleRestoreAgeMs = Number(
    (session as Record<string, unknown> | null | undefined)?._staleRestoreAgeMs ?? 0,
  ) || 0;
  const { confirm: confirmDialog } = useDialog();
  const stalePromptShownRef = React.useRef(false);
  React.useEffect(() => {
    if (staleRestoreAgeMs <= 0) return;
    if (stalePromptShownRef.current) return;
    stalePromptShownRef.current = true;
    let cancelled = false;
    void (async () => {
      const descartar = await confirmDialog(
        `Você abriu este treino ${staleSessionAgeLabel(staleRestoreAgeMs)} e nada foi registrado desde então. O tempo parado não entra na conta. Quer continuar de onde parou?`,
        'Treino ficou aberto',
        // "Continuar de onde parei" ocupava 196 dos 198px do botão — o texto
        // encostava nas duas bordas. O enunciado logo acima já pergunta "Quer
        // continuar de onde parou?", então o rótulo não precisa repetir a frase
        // inteira: ele responde a pergunta.
        { confirmText: 'Descartar treino', cancelText: 'Continuar', destructive: true },
      );
      if (cancelled || !descartar) return;
      cancelWorkoutRef.current?.();
    })();
    return () => { cancelled = true };
  }, [staleRestoreAgeMs, confirmDialog]);

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
        ? (s: unknown, saved: boolean) => triggerExit(() => { try { endTeamSessionRef.current?.(); } catch { } originalOnFinish(s, saved); })
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
            try { endTeamSessionRef.current?.(); } catch { }
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

  cancelWorkoutRef.current = enhancedController.cancelWorkout;

  // Team context for chat, pause banner and workout edit sync
  const teamCtx = useTeamWorkout() as unknown as {
    teamSession: { id: string; participants?: unknown[] } | null
    leaveSession: () => Promise<void>
    sessionPaused: boolean
    pauseSession: () => void
    resumeSession: () => void
    chatMessages: unknown[]
    sendChatMessage: (text: string) => void
    pendingWorkoutEdit: { id: string; fromName: string; workout: Record<string, unknown> } | null
    dismissWorkoutEdit: () => void
  }

  // Mantém o ref de encerramento apontando pro leaveSession atual (só age se
  // houver sessão de dupla). Chamado no finish/cancel via enhancedController.
  React.useEffect(() => {
    endTeamSessionRef.current = () => {
      try {
        if (teamCtx.teamSession?.id && typeof teamCtx.leaveSession === 'function') void teamCtx.leaveSession();
      } catch { /* silent */ }
    };
  }, [teamCtx]);

  // Carimba os participantes da dupla em session.ui.teamMeta — o payload de
  // finalização lê daqui pra gravar o treino como "em dupla" (senão vira "solo"
  // no histórico e o relatório não mostra parceiros). Roda uma vez por mudança
  // na contagem de participantes; preserva o restante do ui (preCheckin etc.).
  const teamParticipants = teamCtx.teamSession?.participants
  React.useEffect(() => {
    const parts = Array.isArray(teamParticipants) ? teamParticipants : []
    if (!teamCtx.teamSession?.id || parts.length === 0) return
    if (typeof props.onUpdateSession !== 'function') return
    const currentUi = (session as { ui?: Record<string, unknown> } | null)?.ui
    const uiObj = currentUi && typeof currentUi === 'object' ? currentUi : {}
    const existing = uiObj.teamMeta as { participants?: unknown[] } | undefined
    const existingCount = existing && Array.isArray(existing.participants) ? existing.participants.length : -1
    if (existingCount === parts.length) return
    props.onUpdateSession({ ui: { ...uiObj, teamMeta: { participants: parts } } })
  }, [teamParticipants, teamCtx.teamSession?.id, session, props])

  // Accept incoming workout edit from a teammate.
  // Instead of replacing the entire workout (which erases B's exercises),
  // we do a smart merge: keep all of B's current exercises and append
  // any NEW exercises from A that don't already exist in B's list.
  const handleAcceptWorkoutEdit = React.useCallback(() => {
    const edit = teamCtx.pendingWorkoutEdit
    if (!edit?.workout || !props.onUpdateSession) return
    try {
      const incomingExercises: Array<Record<string, unknown>> = Array.isArray(
        (edit.workout as Record<string, unknown>).exercises
      )
        ? (edit.workout as Record<string, unknown>).exercises as Array<Record<string, unknown>>
        : []

      // Current exercises of this user (B)
      const currentWorkout = props.session?.workout as Record<string, unknown> | null | undefined
      const currentExercises: Array<Record<string, unknown>> = Array.isArray(
        (currentWorkout as Record<string, unknown> | null)?.exercises
      )
        ? (currentWorkout as Record<string, unknown>).exercises as Array<Record<string, unknown>>
        : []

      const normalise = (s: unknown) => String(s ?? '').toLowerCase().trim()
      const existingNames = new Set(currentExercises.map(ex => normalise(ex.name)))

      // Only add exercises that B doesn't already have
      const newExercises = incomingExercises.filter(
        ex => !existingNames.has(normalise(ex.name))
      )

      if (newExercises.length === 0) {
        // No new exercises — nothing to merge; just dismiss
        teamCtx.dismissWorkoutEdit()
        return
      }

      // Merge: B's exercises first, then new ones from A
      const mergedWorkout = {
        ...(currentWorkout ?? {}),
        exercises: [...currentExercises, ...newExercises],
      }

      props.onUpdateSession({ workout: mergedWorkout })
    } catch { }
    teamCtx.dismissWorkoutEdit()
  }, [teamCtx, props])


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

  const panelExercises = Array.isArray(exercises) ? exercises as Array<{ name?: string }> : [];
  void panelExercises;
  const inTeamSession = !!teamCtx.teamSession?.id;
  const pendingEdit = teamCtx.pendingWorkoutEdit;

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

        {/* Tira de navegação: irmã do header, FORA do contêiner que rola, para
            continuar alcançável no meio da lista — que é justamente quando ela
            serve. Ela se esconde sozinha em treino curto. */}
        <WorkoutExerciseRail />

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
                  ? MACHINE_ACCENT.surface
                  : 'border-white/[0.06] bg-white/[0.03]',
              ].join(' ')}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors',
                  props.settings?.autoLoad
                    ? MACHINE_ACCENT.surfaceActive
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
                  ? MACHINE_ACCENT.toggleOn
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

          {/* GPS Cardio Tracking Panel — a ÚNICA instância, e ela é condicional.
              Havia uma segunda cópia incondicional 45 linhas abaixo: o painel
              aparecia mesmo com `showCardioPanel` falso (e em DOBRO quando
              verdadeiro), porque o componente não tem guarda interna. Isso
              anulava o `shouldShowCardioPanel`, que a linha 205 usa para
              decidir se o menu oferece Cardio GPS. */}
          {showCardioPanel && (
            <CardioGPSPanel
              workoutId={props.session?.workout?.id}
              userId={cardioUserId}
            />
          )}
          {/* Pause banner — shown when a partner paused the session */}
          {inTeamSession && teamCtx.sessionPaused && (
            <div className="bg-yellow-500/15 border-b border-yellow-500/30 px-4 py-2 flex items-center justify-between text-sm">
              <span className="text-yellow-300 font-bold flex items-center gap-1.5"><Pause size={13} className="shrink-0" /> Parceiro pausou o treino</span>
              <button
                onClick={() => teamCtx.resumeSession()}
                className="text-[11px] t-action bg-yellow-500 text-black px-3 py-1 rounded-lg hover:bg-yellow-400 transition-colors"
              >
                Retomar
              </button>
            </div>
          )}

          {/* Workout edit sync banner — shown when a teammate edited the workout (hidden while paused) */}
          {inTeamSession && pendingEdit && !teamCtx.sessionPaused && (
            <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Pencil size={14} className="text-amber-300 shrink-0" />
                <span className="text-amber-200 font-semibold truncate">
                  <strong className="text-amber-100">{pendingEdit.fromName}</strong> editou o treino
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={handleAcceptWorkoutEdit}
                  className="text-[11px] t-action bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-400 transition-colors"
                >
                  Aceitar
                </button>
                <button
                  onClick={() => teamCtx.dismissWorkoutEdit()}
                  className="text-[11px] t-action bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg hover:bg-neutral-600 transition-colors"
                >
                  Ignorar
                </button>
              </div>
            </div>
          )}

          <ExerciseList />
        </div>

        <WorkoutFooter />
        {/* PORTAL para o document.body, de propósito (bug real de 14/08/2026):
            o <ActiveWorkout> é fixed inset-0 z-[50] — position+z criam um
            CONTEXTO DE EMPILHAMENTO, então todo overlay daqui de dentro era
            refém do 50 do pai e PERDIA para a barra do descanso
            (RestTimerOverlay, z-[2100], renderizada na raiz): a barra cobria o
            "Salvar" dos modais e o usuário tinha que encerrar o descanso para
            conseguir salvar. O portal tira a família inteira de modais do
            contexto; os z de cada um (2250–2350) vencem a barra NA RAIZ. Os
            alerts do GlobalDialog (z-10000, raiz) continuam acima de tudo. */}
        {typeof document !== 'undefined' && createPortal(<Modals />, document.body)}

        {inTeamSession && (
          <TeamChatDrawer
            myUserId={String(props.settings?.userId ?? props.session?.userId ?? '')}
            myDisplayName={String(props.settings?.displayName ?? '')}
            myPhotoURL={null}
          />
        )}
      </motion.div>
     </WorkoutTimerProvider>
     </WorkoutLogsProvider>
    </WorkoutProvider>
  );
}
