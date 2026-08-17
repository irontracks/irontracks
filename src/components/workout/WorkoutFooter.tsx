'use client';

import React from 'react';
import { Save, X, Pause, Play, Zap } from 'lucide-react';
import { useWorkoutContext } from './WorkoutContext';
import { useWorkoutTimer } from './WorkoutTimerContext';
import { logError, logWarn } from '@/lib/logger';
import { useKeyboardOpen } from '@/hooks/useKeyboardInset';

export default function WorkoutFooter() {
  const {
    session,
    finishing,
    finishWorkout,
    confirm,
    cancelWorkout,
    completedSets,
    totalSets,
    remainingSets,
  } = useWorkoutContext();

  // Separate guards for Cancel and Finalizar — shared ref would make one block the other
  const cancelBusyRef = React.useRef(false);
  const finishBusyRef = React.useRef(false);

  const { ticker, elapsedSeconds, formatElapsed } = useWorkoutTimer();

  // Solo pause/resume — freezes display timer locally
  const { isPaused: timerPaused, togglePause } = useWorkoutTimer()
  const isPaused = timerPaused

  const allSets = totalSets;
  const allDone = allSets > 0 && completedSets >= allSets;

  const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
  const ui = isRecord(session?.ui) ? (session?.ui as Record<string, unknown>) : null
  const activeExec = ui && isRecord(ui.activeExecution) ? (ui.activeExecution as Record<string, unknown>) : null
  const startedAtMs = activeExec ? Number(activeExec.startedAtMs) : 0
  const isExecuting = Number.isFinite(startedAtMs) && startedAtMs > 0

  /**
   * ⚠️ O DESCANSO NÃO É DESENHADO AQUI — e isso é decisão, não esquecimento.
   *
   * Esta barra já mostrou "RECUPERAÇÃO 0:14" com anel colorido enquanto a
   * barra do RestTimerOverlay, logo abaixo, mostrava "0:13 DESC" com outro
   * anel: o MESMO descanso, dois relógios, e discordando em 1 segundo porque
   * cada um arredondava por conta própria (`Math.ceil` aqui, outro lá).
   *
   * A duplicação sempre existiu, escondida — as duas barras se cobriam. Quando
   * elas passaram a conviver (17/08/2026), ficou à vista e o dono apontou.
   *
   * O corte segue a regra da casa (docs/DESIGN_HIERARCHY.md): um fato aparece
   * UMA vez, e no lugar mais próximo da ação. O tempo restante mora na barra
   * de baixo, colado no START, que é quem encerra o descanso. Aqui fica o
   * tempo de TREINO — que, de quebra, sumia justamente durante o descanso.
   */
  const displaySeconds = isExecuting ? Math.max(0, Math.floor((ticker - startedAtMs) / 1000)) : elapsedSeconds
  const displayLabel = isExecuting ? 'Exercício' : 'Treino'
  const displayTime = formatElapsed(displaySeconds)

  // Com o teclado aberto, esta barra (fixed bottom-0) fica ATRÁS dele e a barra de
  // acessórios do iOS a corta ao meio — "vazando" meia barra na tela. Enquanto o
  // usuário digita peso/reps ela não é necessária, então some (display:none, sem
  // desmontar o componente). A barra do descanso (RestTimerOverlay) já se levanta
  // acima do teclado por conta própria.
  const keyboardOpen = useKeyboardOpen()

  // Com o DESCANSO rolando, a barra do RestTimerOverlay (fixed bottom-0,
  // z-[2100], renderizada na raiz) ficava POR CIMA deste rodapé — e o
  // "Finalizar" virava inalcançável: para terminar o treino o usuário tinha
  // que esperar (ou pular) o descanso. Mesma classe do bug dos modais
  // (14/08/2026): position+z-index do <ActiveWorkout> cria contexto de
  // empilhamento, então subir o z-50 daqui não resolve nada.
  //
  // A saída aqui NÃO é sobrepor (as duas barras ocupam o mesmo espaço do
  // rodapé e brigariam): este rodapé SOBE a altura da barra do descanso e as
  // duas ficam visíveis e clicáveis, empilhadas. `--it-rest-bar-h` é
  // publicada pelo RestTimerOverlay enquanto o descanso existe.
  return (
    <div
      style={{ bottom: 'var(--it-rest-bar-h, 0px)' }}
      className={`fixed left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 px-4 md:px-6 py-3 pb-safe transition-[bottom] duration-150 ${keyboardOpen ? 'hidden' : ''}`}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
        {/* Cancel button — uses cancelWorkout (bypasses triggerExit) */}
        <button aria-label="Descartar treino"
          type="button"
          onClick={async () => {
            if (cancelBusyRef.current) return;
            cancelBusyRef.current = true;
            try {
              // O diálogo era: título "Cancelar", pergunta "Cancelar treino em
              // andamento?", botões [Cancelar] [Confirmar]. A MESMA palavra
              // significava abandonar o treino no título e desistir de abandonar
              // no botão — e o gold (ação positiva) ficava justamente na opção
              // que apaga a sessão. Agora o rótulo diz o que cada botão FAZ.
              const ok = await confirm(
                'Você perde as séries registradas nesta sessão. Isso não pode ser desfeito.',
                'Descartar este treino?',
                { confirmText: 'Descartar', cancelText: 'Continuar treinando', destructive: true },
              );
              if (!ok) { cancelBusyRef.current = false; return; }
              // cancelWorkout bypasses the exit animation guard (exitTimerRef)
              // which can be permanently blocked after a failed Finalizar attempt.
              if (typeof cancelWorkout === 'function') {
                cancelWorkout();
              } else {
                logWarn('WorkoutFooter', 'cancelWorkout is not available');
              }
            } catch (e) {
              logError('WorkoutFooter.cancel', e);
            } finally {
              // Always reset after a delay so the user can retry if navigation fails
              setTimeout(() => { cancelBusyRef.current = false; }, 1500);
            }
          }}
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-700/50 text-neutral-400 hover:text-red-400 hover:border-red-500/30 active:scale-95 transition-all shrink-0"
          title="Cancelar treino"
        >
          <X size={18} />
        </button>

        {/* ── Timer display — center ── */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Time + label */}
          <div className="flex flex-col items-center min-w-0">
            <span className="text-[9px] uppercase tracking-widest text-yellow-500 font-black leading-tight">
              {isPaused ? 'Pausado' : displayLabel}
            </span>
            <span className={`text-lg font-black font-mono leading-tight ${isPaused ? 'text-yellow-400 animate-pulse' : 'text-white'}`}>
              {displayTime}
            </span>
          </div>

          {/* Pause/resume — freezes local timer */}
          <button
            type="button"
            onClick={() => { togglePause() }}
            className={[
              'tap-44 w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-all active:scale-90',
              isPaused
                ? 'bg-yellow-500 text-black'
                : 'bg-neutral-800 border border-neutral-700 text-neutral-300',
            ].join(' ')}
            title={isPaused ? 'Retomar treino' : 'Pausar treino'}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
          </button>
        </div>

        {/* Finalizar — with glow celebration ring when allDone */}
        <div className="relative shrink-0">
          {allDone && !finishing && (
            <div className="absolute inset-0 rounded-xl pointer-events-none animate-pulse-glow" />
          )}
          <button
            type="button"
            disabled={finishing}
            onClick={() => {
              if (finishBusyRef.current) return;
              finishBusyRef.current = true;
              setTimeout(() => { finishBusyRef.current = false; }, 1000);
              // Passa o tempo do cronômetro exibido (já desconta a pausa) pra o
              // histórico gravar o MESMO número que o usuário viu.
              finishWorkout(elapsedSeconds);
            }}
            className={[
              'inline-flex items-center gap-2 px-5 py-3 rounded-xl font-black text-sm transition-all duration-300',
              // O sólido é RESERVADO para o treino completo. Antes disso,
              // "Finalizar" gritava mais que "Concluir" — o botão de sair com
              // mais peso que o de trabalhar. Agora o rodapé fica discreto
              // enquanto há série pendente e acende quando o treino fecha,
              // virando também um sinal de progresso.
              finishing
                ? 'bg-yellow-500/60 text-black cursor-wait'
                : allDone
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-400 text-black shadow-lg shadow-yellow-500/40'
                  : 'bg-neutral-900 border border-neutral-700 text-neutral-300 hover:border-yellow-500/40 hover:text-white',
            ].join(' ')}
          >
            <Save size={16} />
            {allDone && !finishing && <Zap size={14} className="text-yellow-300" />}
            <span>{finishing ? 'Salvando...' : allDone ? 'FINALIZAR' : remainingSets <= 3 && remainingSets > 0 ? `Finalizar (${remainingSets})` : 'Finalizar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
