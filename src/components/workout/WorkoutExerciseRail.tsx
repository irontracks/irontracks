'use client';

import React from 'react';
import { useWorkoutContext, useWorkoutLogs } from './WorkoutContext';
import { buildRailItems, rotuloDoItem, MINIMO_PARA_MOSTRAR_TIRA } from '@/lib/workout/exerciseRail';

/**
 * Tira de navegação do treino ativo.
 *
 * Num treino de 10 exercícios só havia rolagem — nenhum índice, nenhum salto —
 * e o "pular — fazer depois" tornou isso visível: guardar o exercício 3 obrigava
 * a rolar a lista inteira para voltar a ele.
 *
 * Fica FORA do contêiner que rola (é irmã do header, dentro do flex-col do
 * ActiveWorkout), então continua alcançável no meio da lista. Uma tira que
 * some ao rolar não serviria para nada aqui: o momento em que ela é necessária
 * é exatamente o momento em que se está longe do topo.
 *
 * ⚠️ Ela não guarda estado nenhum. Cor e progresso saem dos MESMOS dados dos
 * cards (`lib/workout/exerciseRail.ts` sobre logs + adiados), e o toque chama o
 * `focusExercise` que o "fazer depois" já usava. Duplicar qualquer uma das duas
 * coisas faria a tira e a lista discordarem — e a tira é quem o usuário olha
 * quando não está vendo o card.
 */
export default function WorkoutExerciseRail() {
    const { exercises, deferredExercises, currentExerciseIdx, focusExercise } = useWorkoutContext();
    const logs = useWorkoutLogs() as Record<string, unknown>;
    const trilhoRef = React.useRef<HTMLDivElement | null>(null);

    const itens = React.useMemo(
        () => buildRailItems(
            {
                exercises: exercises as unknown[],
                logs,
                deferred: (deferredExercises ?? new Set<number>()) as ReadonlySet<number>,
            },
            typeof currentExerciseIdx === 'number' ? currentExerciseIdx : -1,
        ),
        [exercises, logs, deferredExercises, currentExerciseIdx],
    );

    // Mantém o chip do exercício atual à vista. Sem isto, num treino de dez a
    // tira ficaria parada no começo enquanto o usuário está no oitavo — e o
    // único elemento que diz "você está aqui" estaria fora da tela.
    React.useEffect(() => {
        const trilho = trilhoRef.current;
        if (!trilho) return;
        const alvo = trilho.querySelector<HTMLElement>('[data-rail-atual="true"]');
        if (!alvo) return;
        try {
            alvo.scrollIntoView({ behavior: 'instant' as ScrollBehavior, inline: 'center', block: 'nearest' });
        } catch { /* rolar é conforto, nunca pode derrubar o treino */ }
    }, [currentExerciseIdx, itens.length]);

    if (itens.length < MINIMO_PARA_MOSTRAR_TIRA) return null;

    return (
        <nav
            aria-label="Exercícios do treino"
            className="flex-shrink-0 border-b border-white/[0.06] bg-neutral-950/80 px-4 py-1.5 md:px-6"
        >
            <div
                ref={trilhoRef}
                className="mx-auto flex max-w-6xl gap-2 overflow-x-auto"
                // A barra de rolagem nativa apareceria por cima dos chips numa
                // faixa de 44px — não há altura para ela e para o número.
                style={{ scrollbarWidth: 'none' }}
            >
                {itens.map((item) => (
                    <button
                        key={item.idx}
                        type="button"
                        data-rail-atual={item.atual ? 'true' : undefined}
                        aria-label={rotuloDoItem(item)}
                        aria-current={item.atual ? 'true' : undefined}
                        onClick={() => focusExercise?.(item.idx)}
                        className={[
                            // 44px reais em vez de `.tap-44`: numa fileira, a área
                            // estendida do ::after invadiria o card de baixo e
                            // roubaria o toque da primeira série.
                            'h-11 min-w-11 flex-shrink-0 rounded-xl border px-2 font-black tabular-nums text-[13px] transition active:scale-95',
                            item.estado === 'feito'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : item.estado === 'guardado'
                                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                    : 'border-white/[0.08] bg-white/[0.03] text-neutral-300',
                            // O anel diz ONDE VOCÊ ESTÁ; a cor diz o estado. São
                            // duas perguntas diferentes e cada uma tem seu canal.
                            item.atual ? 'ring-2 ring-yellow-500/70' : '',
                        ].join(' ')}
                    >
                        {item.numero}
                    </button>
                ))}
            </div>
        </nav>
    );
}
