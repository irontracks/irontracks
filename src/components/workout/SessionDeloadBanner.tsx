'use client';

import React from 'react';
import { useWorkoutContext } from './WorkoutContext';
import type { UnknownRecord } from './types';
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { resolveWorkoutKey } from '@/lib/workout/workoutKey'
import { deloadFoiDispensadoHoje, dispensarDeloadHoje } from '@/lib/workout/deloadDismissal'

/**
 * Descarga (deload) no escopo do TREINO.
 *
 * O diagnóstico continua por exercício — é onde o histórico vive, e estagnação
 * costuma ser local. Mas a decisão é de sessão: a fadiga que justifica descarga é
 * sistêmica, e aliviar um exercício só não descansa nada. Some-se a isso que
 * decidir oito vezes seguidas é a explicação mais provável de a ferramenta nunca
 * ter sido usada (0 de 547 sessões concluídas até jul/2026): aqui é UMA decisão,
 * com opt-out por exercício para quem não quer aliviar tudo.
 *
 * ⚠️ O toggle "Descarga do treino: Ligada/Desligada" (se o MOTOR pode reduzir a
 * carga sozinho) e o gatilho "Aplicar descarga agora" (sem esperar sugestão)
 * saíram deste componente em 19/09/2026 — foram para o menu "…" do
 * `WorkoutHeader`, mesmo raciocínio que já tinha levado o "Semana de Deload"
 * pra lá em 10/09: eram uma linha PERMANENTE no topo de todo treino
 * (`autoLoadEnabled` sozinho já bastava para mostrá-la) para uma ação rara.
 * Relato do dono: *"essa parte do deload aparecendo toda hora está me
 * incomodando"*. O que fica AQUI é só o que precisa ser VISTO sem ação nenhuma
 * do usuário — a sugestão automática e o ciclo em andamento.
 */
export default function SessionDeloadBanner() {
  const {
    workout,
    session,
    exercises,
    sessionDeloadAlert,
    sessionDeloadModal,
    setSessionDeloadModal,
    applyDeloadToSession,
    deloadCycleStatus,
    deloadCycleDaysRemaining,
    endDeloadCycle,
  } = useWorkoutContext() as unknown as {
    workout: unknown;
    session: unknown;
    exercises: UnknownRecord[];
    sessionDeloadAlert: { exIdxs: number[]; status: 'stagnation' | 'overtraining'; suggestedPct: number; itemsCount: number } | null;
    sessionDeloadModal: { exIdxs: number[]; selected: number[]; status: string; suggestedPct: number } | null;
    setSessionDeloadModal: (v: { exIdxs: number[]; selected: number[]; status: 'stagnation' | 'overtraining' | 'manual'; suggestedPct: number } | null) => void;
    applyDeloadToSession: (exIdxs: number[], overridePct?: number) => Promise<void>;
    deloadCycleStatus: 'inactive' | 'active' | 'ends_today';
    deloadCycleDaysRemaining: number;
    endDeloadCycle: () => void;
  };

  const workoutKey = React.useMemo(() => resolveWorkoutKey(workout, session), [workout, session]);

  const [aplicando, setAplicando] = React.useState(false);
  /**
   * Porcentagem escolhida nos atalhos. `null` = seguir o diagnóstico do motor.
   *
   * Não persiste entre sessões de propósito: cada descarga é uma decisão do
   * dia, e o motor volta a sugerir pelo histórico na próxima. Gravar como
   * preferência fixa faria o diagnóstico (12/15/22%) virar decoração.
   */
  const [pctEscolhida, setPctEscolhida] = React.useState<number | null>(null);
  /**
   * ⚠️ Dispensar PRECISA sobreviver a remontar o componente — ver
   * `deloadDismissal.ts`. `useState(false)` era o bug: qualquer coisa que
   * desmontasse e remontasse o `ActiveWorkout` (sair da tela e voltar, editar
   * o treino) trazia o card de volta, mesmo já dispensado na mesma sessão.
   * Inicializador LAZY (função, não valor) — ler `localStorage` a cada render
   * seria trabalho refeito à toa.
   */
  const [dispensado, setDispensadoState] = React.useState(() => deloadFoiDispensadoHoje(workoutKey));
  const dispensar = React.useCallback(() => {
    dispensarDeloadHoje(workoutKey);
    setDispensadoState(true);
  }, [workoutKey]);

  // Antes de qualquer `return null` deste componente: hook atrás de condicional
  // faz o React contar hooks a menos no re-render (o teste do banner pegou).
  const deloadModalRef = useFocusTrap(!!sessionDeloadModal, () => setSessionDeloadModal(null));

  const nomeDe = React.useCallback(
    (i: number) => String((exercises?.[i] as UnknownRecord)?.name ?? '').trim() || `Exercício ${i + 1}`,
    [exercises],
  );

  /**
   * CICLO de descarga — a SEMANA, não a sessão.
   *
   * Nasceu de um relato do dono em 08/09/2026: ele aplicou descarga numa segunda
   * dizendo que ia "até sexta", e não havia onde guardar esse "até sexta". Cada
   * sessão era um evento isolado — o app não sabia que estava no meio de uma
   * descarga, não voltava sozinho à carga cheia e não tinha como avisar que
   * acabava hoje.
   *
   * Uma linha só, e só quando há o que dizer: o topo do treino é espaço nobre
   * (auditoria de 06/09/2026 — dois cards de configuração empurravam o primeiro
   * "Concluir" para 66% da tela).
   */
  // Testa pelo lado POSITIVO: `!== 'inactive'` dava "em ciclo" quando o status
  // chega `undefined` (contexto sem a chave), e o app anunciaria uma semana de
  // descarga que não existe.
  const emCiclo = deloadCycleStatus === 'active' || deloadCycleStatus === 'ends_today';
  const cabecalho = !emCiclo ? null : (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1">
      <div className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-amber-300/90">
        {deloadCycleStatus === 'ends_today'
          ? 'Semana de Deload · último dia'
          : `Semana de Deload · faltam ${deloadCycleDaysRemaining} dias`}
      </div>
      <button
        type="button"
        onClick={endDeloadCycle}
        aria-label="Encerrar a semana de deload agora"
        className="shrink-0 tap-44 inline-flex h-8 items-center rounded-lg border border-amber-500/50 bg-amber-500/15 px-2.5 text-[11px] font-bold uppercase tracking-wide text-amber-300 transition-colors active:scale-95"
      >
        Encerrar
      </button>
    </div>
  );

  const pctSugerido = sessionDeloadAlert ? Math.round(sessionDeloadAlert.suggestedPct * 100) : null;
  const pct = pctEscolhida ?? pctSugerido ?? 15;
  const qtd = sessionDeloadAlert?.exIdxs.length ?? 0;

  // Atalhos toque-único: quem está na academia não mira slider de mão suada.
  // O sugerido entra na lista mesmo fora dos fixos, para nunca sumir a opção
  // que o motor recomenda. 5% e 40% são os limites que o app já valida.
  const opcoes = Array.from(new Set([10, 15, 22, 30, ...(pctSugerido ? [pctSugerido] : [])])).sort((a, b) => a - b);

  /**
   * O modal lista o TREINO INTEIRO, com os sinalizados já marcados.
   *
   * Antes listava só `sessionDeloadAlert.exIdxs` — os exercícios que o motor
   * acusou de estagnação. Mas descarga é decisão sistêmica: quem tira uma semana
   * leve quer o treino todo, inclusive (e principalmente) o que está progredindo,
   * que é o que mais acumula fadiga. Sem "incluir todos" não havia como alcançá-los
   * — foi assim que a Remada curvada e a Elevação lateral do dono ficaram de fora
   * da descarga de 07/09/2026, e ele teve de corrigir o peso na mão.
   */
  const todosIdxs = (Array.isArray(exercises) ? exercises : []).map((_, i) => i);

  const abrir = () => {
    if (!sessionDeloadAlert) return;
    setSessionDeloadModal({
      exIdxs: todosIdxs.length ? todosIdxs : sessionDeloadAlert.exIdxs,
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
      status: sessionDeloadModal.status as 'stagnation' | 'overtraining' | 'manual',
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
      dispensar();
    } finally {
      setAplicando(false);
    }
  };

  /**
   * O MODAL de seleção é independente do alerta automático — ele também abre
   * pelo menu "…" (`WorkoutHeader`, "Aplicar descarga agora"), sem que o
   * motor tenha sinalizado nada. `sinalizado` fica null-safe: sem alerta,
   * nenhum exercício é "sinalizado pelo motor", e a tag some — não quebra.
   */
  const modal = sessionDeloadModal ? (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center" {...backdropProps(() => setSessionDeloadModal(null), 'Fechar descarga')}>
      <div ref={deloadModalRef} {...dialogProps('Descarga do treino')} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-neutral-800 bg-neutral-950 p-5 sm:rounded-3xl">
        <div className="text-lg font-bold text-white">Descarga do treino</div>
        <div className="mt-1 text-[13px] leading-snug text-neutral-400">
          Reduz até {Math.round(sessionDeloadModal.suggestedPct * 100)}% da carga nos exercícios marcados.
          Séries já concluídas não são alteradas, e o app avisa se a máquina não
          tiver um peso tão leve.
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
            {sessionDeloadModal.selected.length} de {sessionDeloadModal.exIdxs.length}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!sessionDeloadModal) return;
              const todos = sessionDeloadModal.selected.length === sessionDeloadModal.exIdxs.length;
              setSessionDeloadModal({
                ...sessionDeloadModal,
                status: sessionDeloadModal.status as 'stagnation' | 'overtraining' | 'manual',
                selected: todos ? [] : [...sessionDeloadModal.exIdxs],
              });
            }}
            className="tap-44 rounded-lg border border-neutral-800 px-2.5 py-1 text-[12px] font-semibold text-neutral-300 active:scale-95"
          >
            {sessionDeloadModal.selected.length === sessionDeloadModal.exIdxs.length ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
        </div>

        <div className="mt-2 space-y-2">
          {sessionDeloadModal.exIdxs.map((i) => {
            const marcado = sessionDeloadModal.selected.includes(i);
            const sinalizado = sessionDeloadAlert?.exIdxs.includes(i) ?? false;
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
                <span className={['min-w-0 flex-1 truncate text-[14px]', marcado ? 'text-white' : 'text-neutral-400'].join(' ')}>
                  {nomeDe(i)}
                </span>
                {/* Distingue quem o motor acusou de quem entrou por decisão
                    sua. Sem isso o diagnóstico some dentro da lista completa. */}
                {sinalizado ? (
                  <span className="shrink-0 rounded-md border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                    Sem progresso
                  </span>
                ) : null}
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
  ) : null;

  if (!sessionDeloadAlert || dispensado) {
    return (
      <>
        {cabecalho}
        {modal}
      </>
    );
  }

  return (
    <>
      {cabecalho}
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
            onClick={dispensar}
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
                  'tap-44 min-h-[32px] flex-1 rounded-lg border px-1 text-[12px] font-bold transition-colors active:scale-95',
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

      {modal}
    </>
  );
}
