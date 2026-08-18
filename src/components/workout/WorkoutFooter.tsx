'use client';

import React from 'react';
import { Save, Zap } from 'lucide-react';
import { useWorkoutContext } from './WorkoutContext';
import { useWorkoutTimer } from './WorkoutTimerContext';
import { useKeyboardOpen } from '@/hooks/useKeyboardInset';

export default function WorkoutFooter() {
  const {
    finishing,
    finishWorkout,
    completedSets,
    totalSets,
    remainingSets,
  } = useWorkoutContext();

  const finishBusyRef = React.useRef(false);

  const { elapsedSeconds } = useWorkoutTimer();

  const allSets = totalSets;
  const allDone = allSets > 0 && completedSets >= allSets;

  /**
   * O contador "Exercício" (tempo da série em execução) saiu junto com o
   * cronômetro. Ele só existia aqui, e era o mesmo caso das outras duas
   * redundâncias: informação de acompanhamento no lugar da ação. Quem precisa
   * de tempo DURANTE a série — prancha e cardio — tem o timer próprio da série
   * e a barra do RestTimerOverlay, que já rotula 'prancha'/'cardio'.
   */

  // Com o teclado aberto, esta barra (fixed bottom-0) fica ATRÁS dele e a barra de
  // acessórios do iOS a corta ao meio — "vazando" meia barra na tela. Enquanto o
  // usuário digita peso/reps ela não é necessária, então some (display:none, sem
  // desmontar o componente). A barra do descanso (RestTimerOverlay) já se levanta
  // acima do teclado por conta própria.
  const keyboardOpen = useKeyboardOpen()

  // ⚠️ ESTE RODAPÉ TEM UMA AÇÃO SÓ: Finalizar. Ele já teve quatro coisas —
  // X (descartar), cronômetro, pausa e Finalizar — e o dono apontou as duas
  // redundâncias em 18/08/2026:
  //
  //   • o TEMPO era o mesmo `elapsedSeconds` desenhado aqui e no topo;
  //   • X e Finalizar pareciam "dois botões que fazem a mesma coisa". Não
  //     fazem: um DESCARTA e o outro SALVA — e é exatamente por parecerem
  //     iguais que o arranjo era perigoso, com o destrutivo sendo o mudo (só
  //     ícone) e colado no de salvar.
  //
  // O cronômetro e a pausa foram para o topo (a pausa acompanha o número que
  // ela controla); descartar foi para o menu "…", com rótulo por extenso —
  // ação rara e destrutiva não mora ao lado da ação primária.
  //
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
      {/* ── Uma barra, um botão, largura inteira ────────────────────────────
          Quando o rodapé tinha quatro elementos, o `justify-end` fazia sentido:
          o Finalizar era a âncora à direita de uma fileira. Sozinho, virou um
          botão pequeno encostado na quina de uma barra de borda a borda — e
          uma superfície inteira existindo para hospedar um elemento que ocupa
          um terço dela não lê como decisão, lê como sobra.
          O CTA passa a ocupar a barra, mesma anatomia do START do descanso
          logo abaixo. Peso continua vindo da COR, não da largura: neutro
          enquanto há série pendente, dourado quando o treino fecha. */}
      <div className="max-w-6xl mx-auto">
        <div className="relative">
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
              'w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-black text-sm transition-all duration-300 active:scale-[0.99]',
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
