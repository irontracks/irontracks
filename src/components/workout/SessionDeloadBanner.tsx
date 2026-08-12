'use client';

import React from 'react';
import { ArrowDown } from 'lucide-react';
import { useWorkoutContext } from './WorkoutContext';
import type { UnknownRecord } from './types';
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/**
 * Descarga (deload) no escopo do TREINO.
 *
 * O diagnóstico continua por exercício — é onde o histórico vive, e estagnação
 * costuma ser local. Mas a decisão é de sessão: a fadiga que justifica descarga é
 * sistêmica, e aliviar um exercício só não descansa nada. Some-se a isso que
 * decidir oito vezes seguidas é a explicação mais provável de a ferramenta nunca
 * ter sido usada (0 de 547 sessões concluídas até jul/2026): aqui é UMA decisão,
 * com opt-out por exercício para quem não quer aliviar tudo.
 */
export default function SessionDeloadBanner() {
  const {
    exercises,
    autoLoadEnabled,
    sessionDeloadAlert,
    sessionDeloadModal,
    setSessionDeloadModal,
    applyDeloadToSession,
    workoutDeloadEnabled,
    toggleWorkoutDeload,
  } = useWorkoutContext() as unknown as {
    exercises: UnknownRecord[];
    autoLoadEnabled: boolean;
    sessionDeloadAlert: { exIdxs: number[]; status: 'stagnation' | 'overtraining'; suggestedPct: number; itemsCount: number } | null;
    sessionDeloadModal: { exIdxs: number[]; selected: number[]; status: string; suggestedPct: number } | null;
    setSessionDeloadModal: (v: { exIdxs: number[]; selected: number[]; status: 'stagnation' | 'overtraining'; suggestedPct: number } | null) => void;
    applyDeloadToSession: (exIdxs: number[], overridePct?: number) => Promise<void>;
    workoutDeloadEnabled: boolean;
    toggleWorkoutDeload: () => void;
  };

  const [aplicando, setAplicando] = React.useState(false);
  /**
   * Porcentagem escolhida nos atalhos. `null` = seguir o diagnóstico do motor.
   *
   * Não persiste entre sessões de propósito: cada descarga é uma decisão do
   * dia, e o motor volta a sugerir pelo histórico na próxima. Gravar como
   * preferência fixa faria o diagnóstico (12/15/22%) virar decoração.
   */
  const [pctEscolhida, setPctEscolhida] = React.useState<number | null>(null);
  // Dispensar é só para esta montagem do treino — não persiste. Se o treino for
  // reaberto e o quadro continuar, o aviso volta (o dado não mudou).
  const [dispensado, setDispensado] = React.useState(false);
  // Antes de qualquer `return null` deste componente: hook atrás de condicional
  // faz o React contar hooks a menos no re-render (o teste do banner pegou).
  const deloadModalRef = useFocusTrap(!!sessionDeloadModal, () => setSessionDeloadModal(null));

  const nomeDe = React.useCallback(
    (i: number) => String((exercises?.[i] as UnknownRecord)?.name ?? '').trim() || `Exercício ${i + 1}`,
    [exercises],
  );

  // Com a carga automática LIGADA, o deload já é contínuo: `suggestWeight` alivia
  // série a série (`deloadEnabled`), e o botão do card virou o liga/desliga por
  // exercício. Nesse mundo o modal manual está aposentado (PR #568) — oferecer uma
  // aplicação em bloco por cima do motor seria dois donos para a mesma carga.
  // O banner é, portanto, para quem NÃO usa o motor: lá o modal manual segue vivo
  // e a decisão continua sendo do usuário.
  // Com a carga automática ligada, a descarga é contínua: o motor alivia série a
  // série quando o dia pede. O que o usuário decide é se ELE PODE — e essa decisão
  // é do TREINO. Até ago/2026 esse liga/desliga vivia em cada card: oito botões
  // para uma decisão só, chaveados por nome de exercício (desligar o Supino aqui
  // desligava em todos os treinos). Agora é um controle, no topo, e o card ficou
  // limpo. Pedido do dono: "deload é por treino, não por exercício".
  if (autoLoadEnabled) {
    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
            Descarga do treino
          </div>
          <div className="mt-0.5 text-[12px] leading-snug text-neutral-400">
            {workoutDeloadEnabled
              ? 'Em dia ruim, o app pode aliviar a carga deste treino.'
              : 'A carga deste treino nunca é reduzida — só mantém ou sobe.'}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleWorkoutDeload}
          aria-pressed={workoutDeloadEnabled}
          aria-label={`Descarga do treino: ${workoutDeloadEnabled ? 'ligada' : 'desligada'}`}
          className={[
            'shrink-0 inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 transition-colors active:scale-95',
            workoutDeloadEnabled
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
              : 'border-neutral-800 bg-neutral-900 text-neutral-400',
          ].join(' ')}
        >
          <ArrowDown size={15} className={workoutDeloadEnabled ? '' : 'opacity-50'} />
          <span className="text-[11px] font-bold uppercase tracking-wide">
            {workoutDeloadEnabled ? 'Ligada' : 'Desligada'}
          </span>
        </button>
      </div>
    );
  }
  if (!sessionDeloadAlert || dispensado) return null;

  const pctSugerido = Math.round(sessionDeloadAlert.suggestedPct * 100);
  const pct = pctEscolhida ?? pctSugerido;
  const qtd = sessionDeloadAlert.exIdxs.length;

  // Atalhos toque-único: quem está na academia não mira slider de mão suada.
  // O sugerido entra na lista mesmo fora dos fixos, para nunca sumir a opção
  // que o motor recomenda. 5% e 40% são os limites que o app já valida.
  const opcoes = Array.from(new Set([10, 15, 22, 30, pctSugerido])).sort((a, b) => a - b);

  const abrir = () => {
    setSessionDeloadModal({
      exIdxs: sessionDeloadAlert.exIdxs,
      selected: [...sessionDeloadAlert.exIdxs],
      status: sessionDeloadAlert.status,
      suggestedPct: pct / 100,
    });
  };

  const alternar = (i: number) => {
    if (!sessionDeloadModal) return;
    const on = sessionDeloadModal.selected.includes(i);
    setSessionDeloadModal({
      ...sessionDeloadModal,
      status: sessionDeloadModal.status as 'stagnation' | 'overtraining',
      selected: on ? sessionDeloadModal.selected.filter((x) => x !== i) : [...sessionDeloadModal.selected, i].sort((a, b) => a - b),
    });
  };

  const confirmar = async () => {
    if (!sessionDeloadModal || aplicando) return;
    setAplicando(true);
    try {
      // A porcentagem PRECISA ir junto: a redução é recalculada por exercício
      // lá dentro, então sem este argumento o app aplicaria o diagnóstico e
      // ignoraria a escolha — o botão dizendo 10% e o peso caindo 22%.
      await applyDeloadToSession(sessionDeloadModal.selected, sessionDeloadModal.suggestedPct);
      setDispensado(true);
    } finally {
      setAplicando(false);
    }
  };

  return (
    <>
      <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-amber-400">
              Sugestão de descarga
            </div>
            <div className="mt-1 text-[13px] leading-snug text-amber-100">
              {sessionDeloadAlert.status === 'overtraining'
                ? `A carga caiu em ${qtd} exercícios deste treino nas últimas sessões.`
                : `${qtd} exercícios deste treino estão sem progresso nas últimas sessões.`}{' '}
              Aliviar hoje ajuda a voltar mais forte.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDispensado(true)}
            aria-label="Dispensar sugestão de descarga"
            className="shrink-0 rounded-lg px-2 py-1 text-neutral-400 active:scale-95"
          >
            ✕
          </button>
        </div>
        <button
          type="button"
          onClick={abrir}
          className="mt-2 w-full rounded-xl bg-amber-500 px-3 py-2 text-[13px] font-bold text-black active:scale-[0.99] transition-transform"
        >
          Reduzir {pct}% no treino de hoje
        </button>

        {/* O motor sugere, o atleta decide. Antes o número era pegar ou largar. */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="t-meta text-[10px] shrink-0 text-amber-200/50">Ajustar</span>
          {opcoes.map((v) => {
            const ativo = v === pct;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setPctEscolhida(v)}
                aria-pressed={ativo}
                className={[
                  'min-h-[32px] flex-1 rounded-lg border px-1 text-[12px] font-bold transition-colors active:scale-95',
                  ativo
                    ? 'border-amber-400 bg-amber-500/25 text-amber-100'
                    : 'border-amber-500/25 text-amber-200/70',
                ].join(' ')}
              >
                {v}%
                {v === pctSugerido ? <span className="ml-0.5 text-[9px] opacity-60">•</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {sessionDeloadModal ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center" {...backdropProps(() => setSessionDeloadModal(null), 'Fechar descarga')}>
          <div ref={deloadModalRef} {...dialogProps('Descarga do treino')} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-neutral-800 bg-neutral-950 p-5 sm:rounded-3xl">
            <div className="text-lg font-bold text-white">Descarga do treino</div>
            <div className="mt-1 text-[13px] leading-snug text-neutral-400">
              Reduz {Math.round(sessionDeloadModal.suggestedPct * 100)}% da carga nos exercícios marcados.
              Séries já concluídas não são alteradas.
            </div>

            <div className="mt-4 space-y-2">
              {sessionDeloadModal.exIdxs.map((i) => {
                const marcado = sessionDeloadModal.selected.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => alternar(i)}
                    className={[
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                      marcado ? 'border-amber-500/50 bg-amber-500/10' : 'border-neutral-800 bg-neutral-900/60',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold',
                        marcado ? 'border-amber-500 bg-amber-500 text-black' : 'border-neutral-700 text-transparent',
                      ].join(' ')}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span className={marcado ? 'text-[14px] text-white' : 'text-[14px] text-neutral-400'}>
                      {nomeDe(i)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setSessionDeloadModal(null)}
                className="flex-1 rounded-xl border border-neutral-800 px-3 py-2.5 text-[14px] font-semibold text-neutral-300 active:scale-[0.99]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={aplicando || sessionDeloadModal.selected.length === 0}
                className="flex-1 rounded-xl bg-amber-500 px-3 py-2.5 text-[14px] font-bold text-black disabled:opacity-40 active:scale-[0.99]"
              >
                {aplicando ? 'Aplicando…' : `Aplicar em ${sessionDeloadModal.selected.length}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
