'use client';

import { explicitSetMethod } from '../helpers/resolveSetMethod';
import React from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { useWorkoutContext } from '../WorkoutContext';
import { AdvancedSetRow } from './AdvancedSetRow';
import { HELP_TERMS } from '@/utils/help/terms';
import {
  isObject,
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
    || DROP_METHOD_RE.test(explicitSetMethod(log, plannedSet));
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

  const verbete = stagesCount >= 3 ? HELP_TERMS.dropSetDuplo : HELP_TERMS.dropSet;

  return (
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel={modeLabel || 'Drop'}
      help={{ title: verbete.title, text: verbete.text, tooltip: verbete.tooltip }}
      info={
        <span className="inline-flex items-center gap-2 flex-wrap">
          <span>{stagesCount} etapas{total ? ` • ${total} reps` : ''}</span>
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
        </span>
      }
      doneSummary={summaryText}
      hint={!canDone ? 'Preencha peso e reps em todas as etapas no modal para concluir.' : ''}
      onOpen={abrirModal}
      onToggleDone={handleToggleDone}
    >
      <AutoloadNote show={isAutoWeight} rationale={autoRationale} plateHint={autoPlateHint} className="pl-12" />
      {/* Anilhas por lado do peso da primeira etapa — é o que se monta no aparelho antes de descer. */}
      <PlateHintLine
        exerciseName={String(ex?.name ?? '')}
        weight={stages[0]?.weight}
        inventory={inventoryFromSettings(settings)}
        className="pl-12"
      />
    </AdvancedSetRow>
  );
};

export const DropSetSet = React.memo(DropSetSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
