'use client';

import React from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, MessageSquare, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import { FailureToggle } from './FailureToggle';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import {
  isObject,
  normalizeExerciseKey,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';
import { useAutoloadWeight, AUTO_INPUT_CLASS } from '../hooks/useAutoloadWeight';
import { AutoloadNote } from './AutoloadNote';
import { PlateHintLine } from './PlateHintLine';
import { inventoryFromSettings } from '@/utils/plates/plateInventory';
import { roundSuggestedWeight } from '@/utils/autoload/plateMath';
import { inferEquipmentFromName } from '@/utils/autoload/equipmentFromName';

/** Queda de carga por etapa do drop (~20%: o que o método manda e o histórico mostra). */
const DROP_STAGE_DECAY = 0.2;

const DropSetSetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const {
    getLog,
    updateLog,
    getPlannedSet,
    setDropSetModal,
    dropSetDraftsRef,
    openNotesKeys,
    toggleNotes,
    reportHistory,
    settings,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint, suggestedWeight } = useAutoloadWeight(ex, exIdx, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);
  const cfgRaw = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
  const stagesPlannedRaw: unknown[] = Array.isArray(cfgRaw) ? cfgRaw : [];
  const ds = isObject(log.drop_set) ? (log.drop_set as UnknownRecord) : ({} as UnknownRecord);
  const stagesSavedRaw: unknown[] = Array.isArray(ds.stages) ? (ds.stages as unknown[]) : [];
  const rawStagesCount = Math.max(stagesPlannedRaw.length, stagesSavedRaw.length);

  // Se o MÉTODO do exercício é drop-set mas ainda não há config/estágios (o usuário
  // escolheu "Drop-set" no dropdown, que NÃO cria advanced_config), defaulta a 2
  // etapas — drop-set mínimo. Sem isto, renderizava null (série em branco). O
  // usuário edita/adiciona etapas pelo botão "Abrir".
  //
  // O override POR SÉRIE (`per_set_method`, o seletor no rodapé da série normal)
  // conta igual ao método do exercício: sem ele, transformar uma série em Drop-Set
  // pelo seletor caía aqui com stagesCount 0 e a linha renderizava `null` — a série
  // SUMIA da tela, e do lado de quem estava treinando isso lê como "o app apagou
  // minha série" (relato do dono, 19/08/2026). O dado nunca era perdido: só não
  // havia o que desenhar.
  const DROP_METHOD_RE = /^drop-?set$/i;
  const isDropMethod = DROP_METHOD_RE.test(String((ex as UnknownRecord)?.method ?? '').trim())
    || DROP_METHOD_RE.test(String(log.per_set_method ?? '').trim());
  const stagesCount = rawStagesCount || (isDropMethod ? 2 : 0);

  if (!stagesCount) {
    // Roteado por engano (nem config, nem estágios, nem método drop) → null seguro.
    return null;
  }

  const auto = isObject(plannedSet?.it_auto) ? (plannedSet.it_auto as UnknownRecord) : null;
  const modeLabel = String(auto?.label || '').trim() || 'Drop';

  // #autoload no drop: o motor sugere o peso de TRABALHO, que aqui é a 1ª etapa.
  // As seguintes caem ~20% (o que o próprio enunciado do método manda e o que o
  // histórico real mostra), arredondadas pelo passo montável do equipamento.
  // Só preenche etapa VAZIA — nunca sobrescreve o que o usuário ou o template puseram.
  const autoStageWeight = (idx: number): string => {
    if (suggestedWeight == null || suggestedWeight <= 0) return '';
    const raw = suggestedWeight * Math.pow(1 - DROP_STAGE_DECAY, idx);
    const rounded = roundSuggestedWeight(raw, inferEquipmentFromName(ex?.name));
    return rounded > 0 ? String(rounded) : '';
  };

  const stages: Array<{ weight: string; reps: number | null }> = Array.from({ length: stagesCount }).map((_, idx) => {
    const saved = isObject(stagesSavedRaw[idx]) ? (stagesSavedRaw[idx] as UnknownRecord) : null;
    const planned = isObject(stagesPlannedRaw[idx]) ? (stagesPlannedRaw[idx] as UnknownRecord) : null;
    const weight = String(saved?.weight ?? planned?.weight ?? autoStageWeight(idx) ?? '').trim();
    const reps = parseTrainingNumber(saved?.reps ?? planned?.reps) ?? null;
    return { weight, reps };
  });

  const total = stages.reduce<number>((acc, s) => acc + (typeof s.reps === 'number' ? s.reps : 0), 0);
  const done = !!log.done;
  const canDone = stages.every((s) => !!String(s.weight || '').trim() && (typeof s.reps === 'number' ? s.reps : 0) > 0);

  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const histEntry = reportHistory?.exercises?.[normalizeExerciseKey(ex.name)];
  const lastHistItem = histEntry?.items?.length ? [...histEntry.items].sort((a, b) => b.ts - a.ts)[0] : null;
  const prevNote = lastHistItem?.setNotes?.[setIdx] ?? null;
  const hasAnyNote = hasNotes || !!prevNote;

  const handleToggleDone = () => {
    const nextDone = !done;
    const lastWeight = String(stages?.[stages.length - 1]?.weight || '').trim();
    const stageOut = stages.map((s) => ({
      weight: String(s?.weight ?? '').trim(),
      reps: parseTrainingNumber(s?.reps) ?? null,
    }));
    updateLog(key, {
      done: nextDone,
      weight: lastWeight,
      reps: String(total || ''),
      drop_set: { stages: stageOut },
    });
  };

  const summaryText = stages.map((s) => `${s.weight || '?'}kg×${s.reps ?? '?'}`).join(' → ');

  // Resumo dos pesos por etapa para MOSTRAR na linha. Antes o peso só aparecia
  // dentro do modal — a série de drop não exibia peso algum na linha (só "Etapas N
  // • Total: X"), ao contrário das normais que mostram o número na caixa. Isso dava
  // a impressão de "o drop não automatizou". Violeta quando os pesos vieram do motor.
  const stageWeightSummary = stages.map((s) => String(s.weight || '').trim()).filter(Boolean).join(' → ');
  const stagesFilledByMotor = Boolean(
    suggestedWeight != null && suggestedWeight > 0 && stageWeightSummary &&
    stages.every((_, idx) => {
      const saved = isObject(stagesSavedRaw[idx]) ? (stagesSavedRaw[idx] as UnknownRecord) : null;
      const planned = isObject(stagesPlannedRaw[idx]) ? (stagesPlannedRaw[idx] as UnknownRecord) : null;
      const hasSavedW = saved?.weight != null && String(saved.weight).trim() !== '';
      const hasPlannedW = planned?.weight != null && String(planned.weight).trim() !== '';
      return !hasSavedW && !hasPlannedW;
    }),
  );

  // Ação de abrir o modal das etapas — o "peso" do drop mora lá dentro, então
  // este botão ocupa a MESMA faixa que peso/reps/RPE ocupam na série normal.
  const abrirModal = () => {
    // Preenche etapas de peso AINDA vazias com a sugestão atual do motor,
    // preservando o que já foi digitado. Sem isto, um rascunho salvo com o
    // peso vazio (modal aberto antes do histórico carregar, ou fechado sem
    // preencher) CONGELA o campo vazio: reabrir usava o rascunho e ignorava
    // a sugestão — mesmo já estando disponível. Era um dos jeitos de o drop
    // aparecer "sem peso automático".
    const fillEmptyWithSuggestion = (list: unknown[]) =>
      list.map((st, idx) => {
        const st2 = isObject(st) ? (st as UnknownRecord) : {};
        if (String(st2.weight ?? '').trim()) return st2;
        const autoW = autoStageWeight(idx);
        return autoW ? { ...st2, weight: autoW } : st2;
      });

    const draft = dropSetDraftsRef?.current?.[key];
    if (draft && typeof draft === 'object' && Array.isArray((draft as UnknownRecord).stages)) {
      const mergedStages = fillEmptyWithSuggestion((draft as UnknownRecord).stages as unknown[]);
      setDropSetModal({ ...(draft as UnknownRecord), stages: mergedStages, error: '' });
      return;
    }
    const baseStages = stages.map((st) => ({
      weight: String(st?.weight ?? '').trim(),
      reps: parseTrainingNumber(st?.reps) ?? null,
    }));
    const restSec = parseTrainingNumber(ex.rest_time ?? (ex as unknown as Record<string, unknown>).restTime) ?? 0;
    setDropSetModal({ key, label: modeLabel, stages: baseStages, restSec, rpe: log.rpe ?? '', error: '' });
  };

  const notesButton = (
    <button
      type="button"
      aria-label={isNotesOpen ? 'Fechar observações' : 'Observações'}
      onClick={() => toggleNotes(key)}
      className={
        isNotesOpen || hasAnyNote
          ? 'tap-44 h-9 w-9 inline-flex items-center justify-center rounded-lg text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
          : 'h-9 w-9 inline-flex items-center justify-center rounded-lg text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
      }
    >
      <MessageSquare size={12} />
    </button>
  );

  return (
    <div key={key} className="space-y-1">
      <div
        className={[
          'rounded-xl border px-2.5 py-2 transition-all duration-300 shadow-sm',
          done
            ? 'bg-emerald-950/30 border-emerald-500/30'
            : 'bg-neutral-900/50 border-neutral-800/80',
        ].join(' ')}
      >
        {/* MESMA grade da série normal (# | 💬 | campos | Concluir), pedido do
            dono em 19/08/2026: "deixe os cards iguais, o do drop igual do normal;
            no lugar do peso fica o botão de abrir, preenchendo todo o espaço".
            As três colunas de campo (peso/reps/RPE) viram UMA só aqui — no drop
            esses números moram no modal, e o botão que leva até eles ocupa a
            faixa inteira em vez de deixar um vão no meio da linha. */}
        <div
          className="grid items-center gap-1.5"
          style={{ gridTemplateColumns: '32px 36px minmax(0,1fr) 92px' }}
        >
          <div
            aria-hidden="true"
            className={[
              'h-7 inline-flex items-center justify-center rounded-lg text-[11px] font-black tracking-tight border select-none',
              done
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
            ].join(' ')}
          >
            {setIdx + 1}
          </div>

          {notesButton}

          <button
            type="button"
            onClick={abrirModal}
            aria-label={`Abrir etapas do ${modeLabel || 'Drop'} – série ${setIdx + 1}`}
            className={[
              'w-full tap-44 h-9 rounded-lg border text-sm outline-none inline-flex items-center justify-center gap-2 transition-colors',
              done
                ? 'bg-black/20 border-emerald-500/25 text-emerald-200 hover:border-emerald-500/50'
                : 'bg-black/30 border-neutral-700 text-white hover:border-yellow-500/60 hover:text-yellow-500',
            ].join(' ')}
          >
            <Pencil size={14} />
            <span className="text-xs font-black">{done ? summaryText : 'Abrir'}</span>
          </button>

          <button
            type="button"
            disabled={!done && !canDone}
            onClick={handleToggleDone}
            aria-label={done ? 'Desfazer série concluída' : 'Concluir série'}
            className={[
              'inline-flex items-center justify-center gap-1 tap-44 h-9 w-[92px] rounded-xl t-action text-xs whitespace-nowrap active:scale-95 transition-all duration-150',
              done
                ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/30'
                : canDone
                  ? 'bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20'
                  : 'bg-neutral-800/40 border border-neutral-800 text-neutral-400 cursor-not-allowed',
            ].join(' ')}
          >
            <Check size={13} />
            {done ? 'Feito' : 'Concluir'}
          </button>
        </div>

        {/* Rodapé do card, no molde da série normal: informação à esquerda,
            chip de falha à direita. No normal a esquerda é a nota do motor e o
            seletor de método; aqui é o método + etapas + os pesos das etapas. */}
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500 inline-flex items-center gap-1 group shrink-0">
              {modeLabel || 'Drop'}
              <HelpHint
                title={(stagesCount >= 3 ? HELP_TERMS.dropSetDuplo : HELP_TERMS.dropSet).title}
                text={(stagesCount >= 3 ? HELP_TERMS.dropSetDuplo : HELP_TERMS.dropSet).text}
                tooltip={(stagesCount >= 3 ? HELP_TERMS.dropSetDuplo : HELP_TERMS.dropSet).tooltip}
                className="h-4 w-4 text-[10px]"
              />
            </span>
            <span className="text-xs text-neutral-400">
              {stagesCount} etapas{total ? ` • ${total} reps` : ''}
            </span>
            {/* Pílula com a MESMA marcação do input de peso dos outros métodos
                (AUTO_INPUT_CLASS). Antes era só texto violeta solto: ao lado da
                caixa violeta da série normal não lia como "o motor preencheu", e
                o dono reportou que "o drop não marca em roxo igual o rest-pause". */}
            {!done && stageWeightSummary && (
              <span
                className={[
                  'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold',
                  stagesFilledByMotor
                    ? AUTO_INPUT_CLASS
                    : 'border-neutral-700 bg-black/30 text-neutral-300',
                ].join(' ')}
              >
                {stagesFilledByMotor && <span aria-hidden>🧠</span>}
                {stageWeightSummary} kg
              </span>
            )}
          </div>
          <FailureToggle exIdx={exIdx} setIdx={setIdx} />
        </div>
      </div>

      {!done && !canDone && (
        <div className="pl-12 text-[11px] text-neutral-400 font-semibold">
          Preencha peso e reps em todas as etapas no modal para concluir.
        </div>
      )}

      <AutoloadNote show={isAutoWeight} rationale={autoRationale} plateHint={autoPlateHint} className="pl-12" />
      {/* Anilhas por lado do peso da primeira etapa — é o que se monta no aparelho antes de descer. */}
      <PlateHintLine
        exerciseName={String(ex?.name ?? '')}
        weight={stages[0]?.weight}
        inventory={inventoryFromSettings(settings)}
        className="pl-12"
      />

      {isNotesOpen && (
        <div className="space-y-1.5">
          {prevNote && (
            <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
              <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600 shrink-0 mt-0.5">Anterior</span>
              <p className="text-xs text-neutral-400 italic leading-snug">{prevNote}</p>
            </div>
          )}
          <textarea
            value={notesValue}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { notes: v });
            }}
            placeholder="Observações da série"
            rows={2}
            aria-label="Observações da série"
            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-[16px] text-white outline-none focus:ring-1 ring-yellow-500"
          />
        </div>
      )}
    </div>
  );
};

export const DropSetSet = React.memo(DropSetSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
