'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { ArrowDown, CheckCircle2, ChevronDown, ChevronUp, Dumbbell, Link, Loader2, Pencil, Play, Plus, Share2, Trash2, Trophy, Weight } from 'lucide-react';
import { useWorkoutContext, useWorkoutLogs } from './WorkoutContext';
import { pickExerciseLogSlice, shallowEqualByRef } from './helpers/exerciseLogSlice';
import { stripRedundantOpening, noteNeedsExpand } from './helpers/exerciseNotePreview';
import {
  NormalSet,
  RestPauseSet,
  ClusterSet,
  DropSetSet,
  StrippingSet,
  FST7Set,
  HeavyDutySet,
  PontoZeroSet,
  ForcedRepsSet,
  NegativeRepsSet,
  PartialRepsSet,
  Sistema21Set,
  WaveSet,
  GroupMethodSet,
} from './set-renderers';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { setTopWeightReps } from '@/utils/report/setVolume';
import { isObject, isClusterConfig, isRestPauseConfig } from './utils';
import { WorkoutExercise, UnknownRecord } from './types';
import { isPlank } from '@/utils/exerciseTracking';
import { SetMethodPicker } from './set-renderers/SetMethodPicker';
import { resolveSetMethodLabel, podeTrocarMetodoRapido, precisaCongelarMetodo, metodoParaCongelar } from './helpers/resolveSetMethod';
import { PlankSetInput } from './PlankSetInput';
import { CardioSetInput } from './CardioSetInput';
import ExecutionVideoCapture from '@/components/ExecutionVideoCapture';
import { logError, logInfo } from '@/lib/logger'
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext'
import AIExerciseSwap from './AIExerciseSwap'
import PlateCalculatorSheet from './PlateCalculatorSheet'
import { inferEquipmentFromName } from '@/utils/autoload/equipmentFromName';
import { resolveIncrement } from '@/utils/autoload/plateMath';
import { inventoryFromSettings, type PlateInventory } from '@/utils/plates/plateInventory';

function useSafeTeamWorkout() {
  try {
    return useTeamWorkout()
  } catch {
    return null
  }
}

type GroupPos = 'first' | 'middle' | 'last';

function ExerciseCardInner({ ex, exIdx, groupPos, logsSlice }: { ex: WorkoutExercise; exIdx: number; groupPos?: GroupPos; logsSlice: Record<string, Record<string, unknown>> }) {
  // Só as entradas de log DESTE exercício (passadas pelo wrapper connected, com referência
  // estável). Assim o card só re-renderiza quando as próprias séries mudam — não a cada
  // tecla em qualquer outro exercício. Ver helpers/exerciseLogSlice.ts.
  const logs = logsSlice;
  const {
    workout,
    collapsed,
    toggleCollapse,
    setCurrentExerciseIdx,
    reportHistoryStatus,
    reportHistoryLoadingRef,
    reportHistory,
    deloadAlerts,
    sessionDeloadAlert,
    openDeloadModal,
    autoLoadEnabled,
    openEditExercise,
    addExtraSetToExercise,
    getPlannedSet,
    getPlanConfig,
    getLog,
    alert,
    removeSetAtIndex,
    linkedWeightExercises,
    toggleLinkWeights,
    deleteConfirmIdx,
    openDeleteConfirm,
    closeDeleteConfirm,
    removeExerciseFromWorkout,
    settings,
    updateLog,
    onSavePlateSetup,
  } = useWorkoutContext();

  const teamCtx = useSafeTeamWorkout();

  const name = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
  // Aviso proativo de deload deste exercício (estagnação/regressão com histórico
  // suficiente). Sem isto o app calculava a análise e não contava pra ninguém.
  //
  // Cala quando a descarga vira decisão de SESSÃO (banner no topo do treino):
  // repetir o mesmo recado em cada card e mais uma vez no topo é ruído, e ruído
  // foi o que manteve esta feature sem uso.
  const deloadAlertRaw = (deloadAlerts as Record<number, { status: 'stagnation' | 'overtraining'; suggestedPct: number; itemsCount: number }> | undefined)?.[exIdx];
  const deloadAlert = sessionDeloadAlert ? undefined : deloadAlertRaw;
  const observation = String(ex?.notes || '').trim();
  // Preview sem a abertura que só repete o título (ver exerciseNotePreview).
  const notePreview = useMemo(() => stripRedundantOpening(observation, name), [observation, name]);
  const noteCollapsible = noteNeedsExpand(notePreview);
  const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
  const sdArr: unknown[] = Array.isArray(ex?.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex?.set_details) ? (ex.set_details as unknown[]) : [];
  const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
  const collapsedNow = collapsed.has(exIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const isExPlank = isPlank(name);
  // For plank exercises, show planned exercise duration (from first setDetail) instead of rest time.
  // The "Xs" in the header is restTime for normal exercises, which users correctly read as "rest".
  // For planks, users assume "Xs" is how long to hold — so we show durationSeconds here.
  const plankPlannedSec: number | null = isExPlank && sdArr.length > 0 && isObject(sdArr[0])
    ? (parseTrainingNumber((sdArr[0] as Record<string, unknown>).durationSeconds) ?? null)
    : null;
  const videoUrl = String(ex?.videoUrl ?? ex?.video_url ?? '').trim();
  const isReportLoading = reportHistoryStatus?.status === 'loading' && reportHistoryLoadingRef.current;

  // Compute how many sets in this exercise are marked done (for progress bar)
  const doneSetsCount = Array.from({ length: setsCount }).filter((_, setIdx) => {
    const log = getLog(`${exIdx}-${setIdx}`);
    return !!log.done;
  }).length;
  const cardProgressPct = setsCount > 0 ? Math.round((doneSetsCount / setsCount) * 100) : 0;

  // Compute whether all sets in this exercise are marked done
  const allSetsDone = setsCount > 0 && doneSetsCount === setsCount;

  // ── Calculadora de anilhas ────────────────────────────────────────────────
  // Só aparece em exercício de BARRA: em máquina/cabo/halter não existe anilha por
  // lado, e o ícone seria ruído num header que já tem 6 botões.
  const [plateCalcOpen, setPlateCalcOpen] = useState(false);
  // Nota recolhida por padrão, e o estado é por CARD: abrir a técnica de um
  // exercício não deve abrir a dos outros sete.
  const [noteOpen, setNoteOpen] = useState(false);
  // Qual série remover. A lixeira apagava sempre a ÚLTIMA, então tirar a 2ª de
  // quatro exigia apagar as de cima e refazer — o dono reportou isso justamente
  // num exercício onde a série do meio era a que ele queria fora (19/08/2026).
  const [removeSetOpen, setRemoveSetOpen] = useState(false);
  const isBarbell = useMemo(
    () => resolveIncrement(inferEquipmentFromName(name)).equipmentClass === 'barbell',
    [name],
  );
  const plateInventory: PlateInventory = useMemo(() => inventoryFromSettings(settings), [settings]);
  /**
   * Série que receberá o peso: a primeira NÃO concluída (a que o usuário está fazendo).
   * Quando todas estão concluídas, cai na última — aplicar numa série já fechada é
   * correção legítima. O sheet SEMPRE mostra o rótulo antes de aplicar: em drop-set,
   * cluster e stripping a "série corrente" tem sub-etapas, e escrever no lugar errado
   * é a classe de bug que já mordeu a família de renderers.
   */
  const targetSetIdx = useMemo(() => {
    for (let i = 0; i < setsCount; i++) {
      // Deriva de `logs` (o slice deste exercício), não de getLog: getLog é estável e lê
      // uma ref, então o memo não reavaliaria ao concluir uma série.
      if (!logs[`${exIdx}-${i}`]?.done) return i;
    }
    return Math.max(0, setsCount - 1);
  }, [setsCount, exIdx, logs]);

  // Completion animation — brief scale+glow when exercise finishes
  const [justCompleted, setJustCompleted] = useState(false);
  const prevAllDoneRef = React.useRef(allSetsDone);
  // Refs so the effect can read latest values without re-running
  const collapsedNowRef = React.useRef(collapsedNow);
  collapsedNowRef.current = collapsedNow;
  const toggleCollapseRef = React.useRef(toggleCollapse);
  toggleCollapseRef.current = toggleCollapse;
  useEffect(() => {
    if (allSetsDone && !prevAllDoneRef.current) {
      setJustCompleted(true);
      const animT = setTimeout(() => setJustCompleted(false), 800);
      // Auto-collapse after the completion animation plays
      const collapseT = setTimeout(() => {
        if (!collapsedNowRef.current) toggleCollapseRef.current(exIdx);
      }, 600);
      prevAllDoneRef.current = true;
      return () => { clearTimeout(animT); clearTimeout(collapseT); };
    }
    prevAllDoneRef.current = allSetsDone;
  }, [allSetsDone, exIdx]);

  // PR detection: compare current session max weight with reportHistory
  const isPR = useMemo(() => {
    if (!reportHistory || setsCount === 0) return false;
    try {
      const normalizedName = String(ex?.name || '').trim().toLowerCase().replace(/\s+/g, '_');
      const exercises_map = (reportHistory as Record<string, unknown>)?.exercises as Record<string, { items?: Array<{ topWeight?: number | null }> }>;
      if (!exercises_map) return false;
      const histEntry = Object.entries(exercises_map).find(
        ([k]) => k === normalizedName || k.includes(normalizedName) || normalizedName.includes(k)
      );
      const items = histEntry?.[1]?.items ?? [];
      const histTopWeight = items.length
        ? Math.max(...items.map(i => Number(i.topWeight ?? 0)).filter(v => v > 0))
        : 0;
      if (!histTopWeight) return false;
      const logsObj = logs as Record<string, Record<string, unknown>>;
      let sessionMax = 0;
      for (let i = 0; i < setsCount; i++) {
        const log = logsObj[`${exIdx}-${i}`];
        // Ignora séries de AQUECIMENTO: um aquecimento pesado não é recorde.
        if (log?.set_type === 'warmup' || log?.is_warmup === true) continue;
        // setTopWeightReps trata unilateral (L_/R_) — sem isto, exercícios
        // unilaterais (que salvam só em L_weight/R_weight) nunca acendiam o badge PR.
        const w = setTopWeightReps(log as Record<string, unknown>).weight || Number(log?.weight ?? log?.total_weight ?? 0);
        if (w > sessionMax) sessionMax = w;
      }
      return sessionMax > 0 && sessionMax > histTopWeight;
    } catch { return false; }
  }, [ex?.name, exIdx, logs, reportHistory, setsCount]);

  // Parse SST config from exercise description (e.g. "SST na última: Falha > 10s > Falha > 10s > Falha")
  const parsedSSTConfig = (() => {
    const notes = String(ex?.notes || '');
    // Detect "SST na última" or "SST na Nª série" patterns
    const lastMatch = /SST\s+na\s+(última|ult\.)/i.exec(notes);
    const nthMatch = /SST\s+na\s+(\d+)[ªa°.]?\s*série/i.exec(notes);
    if (!lastMatch && !nthMatch) return null;

    // Parse the rest of the pattern after ":" to get mini count and rest time
    const colonIdx = notes.indexOf(':');
    const pattern = colonIdx >= 0 ? notes.slice(colonIdx + 1) : notes;
    const restMatch = /(\d+)\s*s/i.exec(pattern);
    const restSec = restMatch ? parseInt(restMatch[1]) : 10;
    const miniCount = Math.max(2, (pattern.match(/Falha/gi) ?? []).length) || 3;

    const targetSetIdx = nthMatch
      ? parseInt(nthMatch[1]) - 1  // "SST na 3ª série" → index 2
      : setsCount - 1;              // "SST na última" → last set

    return { restSec, miniCount, targetSetIdx };
  })();

  const renderSet = (setIdx: number) => {
    const plannedSet = getPlannedSet(ex, setIdx);
    const rawCfg = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const method = String(ex?.method || '').trim();

    // Isometric exercises (Prancha/Plank) use time-based input instead of reps
    if (isPlank(String(ex?.name ?? ''))) {
      return <PlankSetInput key={key} ex={ex as UnknownRecord} exIdx={exIdx} setIdx={setIdx} setsCount={setsCount} />;
    }

    // Cardio (method === 'Cardio'): tempo + intensidade (+ inclinação na esteira)
    // com botão START da contagem regressiva, em vez de PESO/REPS/RPE.
    if (method.toLowerCase() === 'cardio') {
      return <CardioSetInput key={key} ex={ex as UnknownRecord} exIdx={exIdx} setIdx={setIdx} setsCount={setsCount} />;
    }

    // Per-set method override — takes precedence over all automatic detection
    const perSetMethod = String(log.per_set_method || '').trim();
    if (perSetMethod === 'Normal') {
      return <NormalSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} setsCount={setsCount} />;
    }
    if (perSetMethod === 'Drop-Set') {
      return <DropSetSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }
    if (perSetMethod === 'SST') {
      return <RestPauseSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} sstOverride={{ restSec: 10, miniCount: 3 }} />;
    }
    if (perSetMethod === 'Rest-Pause') {
      return <RestPauseSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }
    if (perSetMethod === 'Cluster') {
      return <ClusterSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }
    if (perSetMethod === 'Stripping') {
      return <StrippingSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }
    if (perSetMethod === 'Bi-Set' || perSetMethod === 'Super-Set' || perSetMethod === 'Tri-Set' || perSetMethod === 'Giant-Set' || perSetMethod === 'Pré-exaustão' || perSetMethod === 'Pós-exaustão') {
      return <GroupMethodSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // SST from description: override the method on the specific target set
    if (parsedSSTConfig && setIdx === parsedSSTConfig.targetSetIdx) {
      return (
        <RestPauseSet
          key={key}
          ex={ex}
          exIdx={exIdx}
          setIdx={setIdx}
          sstOverride={{ restSec: parsedSSTConfig.restSec, miniCount: parsedSSTConfig.miniCount }}
        />
      );
    }

    // Drop-Set: array config, estágios salvos, OU o método do exercício = "Drop-set"
    // (o dropdown grava method='Drop-set' SEM criar advanced_config; sem esta terceira
    // condição, escolher "Drop-set" no editor caía silenciosamente em NormalSet).
    const dropSet = isObject(log.drop_set) ? (log.drop_set as UnknownRecord) : null;
    const dropStages: unknown[] = dropSet && Array.isArray(dropSet.stages) ? (dropSet.stages as unknown[]) : [];
    const isDropByMethod = /^drop-?set$/i.test(method);
    if (Array.isArray(rawCfg) || dropStages.length > 0 || isDropByMethod) {
      return <DropSetSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // Stripping: saved stripping stages OR method name
    const stripping = isObject(log.stripping) ? (log.stripping as UnknownRecord) : null;
    const strippingStages: unknown[] = stripping && Array.isArray(stripping.stages) ? (stripping.stages as unknown[]) : [];
    if (method === 'Stripping' || strippingStages.length > 0) {
      return <StrippingSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // FST-7
    if (method === 'FST-7' || isObject(log.fst7)) {
      return <FST7Set key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // Heavy Duty
    if (method === 'Heavy Duty' || isObject(log.heavy_duty)) {
      return <HeavyDutySet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // Ponto Zero
    if (method === 'Ponto Zero' || isObject(log.ponto_zero)) {
      return <PontoZeroSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // Repetições Forçadas
    if (method === 'Repetições Forçadas' || isObject(log.forced_reps)) {
      return <ForcedRepsSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // Repetições Negativas
    if (method === 'Repetições Negativas' || isObject(log.negative_reps)) {
      return <NegativeRepsSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // Repetições Parciais
    if (method === 'Repetições Parciais' || isObject(log.partial_reps)) {
      return <PartialRepsSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // Sistema 21
    if (method === 'Sistema 21' || isObject(log.sistema21)) {
      return <Sistema21Set key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // Onda (Wave Loading)
    if (method === 'Onda' || isObject(log.wave)) {
      return <WaveSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // Group methods
    const GROUP_METHODS = ['Bi-Set', 'Super-Set', 'Tri-Set', 'Giant-Set', 'Pré-exaustão', 'Pós-exaustão'];
    if (GROUP_METHODS.includes(method)) {
      return <GroupMethodSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    const cfg = getPlanConfig(ex, setIdx);
    const isCluster = method === 'Cluster' || isClusterConfig(cfg);
    const isRestPause = method === 'Rest-Pause' || isRestPauseConfig(cfg);

    if (isCluster) {
      return <ClusterSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }
    if (isRestPause) {
      return <RestPauseSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }

    // GVT, Pirâmide Crescente, Pirâmide Decrescente, and Normal all use NormalSet
    return <NormalSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} setsCount={setsCount} />;
  };

  /**
   * Método efetivo da série — a MESMA decisão do `renderSet`, resolvida por
   * `resolveSetMethodLabel`. Rotular por palpite seria pior que não rotular: o
   * app diria "Normal" numa série desenhada como DROP.
   */
  const methodLabelOfSet = (setIdx: number): string => {
    const plannedSet = getPlannedSet(ex, setIdx);
    const cfg = getPlanConfig(ex, setIdx);
    return resolveSetMethodLabel({
      exerciseMethod: ex?.method,
      log: getLog(`${exIdx}-${setIdx}`),
      plannedConfig: plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null,
      sstFromNotes: Boolean(parsedSSTConfig && setIdx === parsedSSTConfig.targetSetIdx),
      isClusterConfig: isClusterConfig(cfg),
      isRestPauseConfig: isRestPauseConfig(cfg),
    });
  };

  /**
   * Antes de remover a série `removedIdx`, grava explicitamente o método que as
   * OUTRAS séries já mostravam — mas só naquelas em que ele é **inferido**.
   *
   * O método pode não existir como dado: a nota "DROP-SET na última série" faz
   * `getPlannedSet` injetar os estágios na última. Remover a última fazia a
   * penúltima herdar o drop, e o usuário via "apagou a série errada" — o drop
   * continuava na tela, uma linha acima (relato do dono, 24/08/2026).
   *
   * Escrever a marcação explícita é o que trava a regra: `per_set_method` vence
   * qualquer inferência.
   */
  const freezeInferredMethodsBeforeRemoval = (removedIdx: number) => {
    try {
      for (let sIdx = 0; sIdx < setsCount; sIdx += 1) {
        if (sIdx === removedIdx) continue;
        const key = `${exIdx}-${sIdx}`;
        const log = getLog(key);
        const plannedSet = getPlannedSet(ex, sIdx);
        const cfg = getPlanConfig(ex, sIdx);
        const input = {
          exerciseMethod: ex?.method,
          log,
          plannedConfig: plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null,
          sstFromNotes: Boolean(parsedSSTConfig && sIdx === parsedSSTConfig.targetSetIdx),
          isClusterConfig: isClusterConfig(cfg),
          isRestPauseConfig: isRestPauseConfig(cfg),
        };
        if (!precisaCongelarMetodo(input)) continue;
        // Grava `Normal` EXPLÍCITO quando a série é normal hoje: é justamente
        // ela que viraria drop ao passar a ser a última. String vazia não serve
        // — cai de volta na inferência.
        updateLog(key, { per_set_method: metodoParaCongelar(input) });
      }
    } catch { /* congelar é defesa; nunca pode impedir a remoção */ }
  };

  const renderMethodPicker = (setIdx: number) => {
    const label = methodLabelOfSet(setIdx);
    if (!podeTrocarMetodoRapido(label, isExPlank)) return null;
    // Série normal já tem o seletor no próprio rodapé (`normalSet`), onde não
    // custa linha. Desenhar aqui também daria uma faixa vertical extra em
    // TODAS as séries — exatamente a densidade que a auditoria de ago/2026
    // corrigiu (guard: `__tests__/densidadeDaSerie.test.ts`).
    if (label === '' || label === 'Normal') return null;
    const key = `${exIdx}-${setIdx}`;
    const done = !!getLog(key).done;
    return (
      <div className="px-1 -mt-1 mb-1 flex justify-end">
        <SetMethodPicker
          current={label}
          disabled={done}
          onSelect={(m) => updateLog(key, { per_set_method: m })}
        />
      </div>
    );
  };

  return (
    <div
      data-exercise-idx={exIdx}
      className={[
      'rounded-2xl bg-neutral-900/70 border p-4 shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-all duration-300',
      allSetsDone
        ? 'border-emerald-500/40 shadow-[0_0_20px_-4px_rgba(52,211,153,0.18)]'
        : 'border-neutral-800/80',
      // Borda esquerda dourada sinaliza que o card faz parte de um grupo (Bi-Set, etc.)
      groupPos && !allSetsDone ? 'border-l-2 border-l-yellow-500/60' : '',
      justCompleted ? 'scale-[1.01] shadow-[0_0_30px_-4px_rgba(52,211,153,0.35)]' : '',
    ].join(' ')}>
      {/* Outer wrapper — plain div, no interactive role */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        {/* Collapse trigger: exercise info only, no nested interactive elements */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={!collapsedNow}
          aria-label={`${collapsedNow ? 'Expandir' : 'Recolher'} ${name}`}
          onClick={() => {
            setCurrentExerciseIdx(exIdx);
            toggleCollapse(exIdx);
          }}
          onKeyDown={(e) => {
            const key = e?.key;
            if (key === 'Enter' || key === ' ') {
              try {
                e.preventDefault();
              } catch { }
              setCurrentExerciseIdx(exIdx);
              toggleCollapse(exIdx);
            }
          }}
          className="min-w-0 text-left flex-1 cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* Exercise number badge */}
            <span className={[
              'flex-shrink-0 inline-flex items-center justify-center rounded-lg text-[11px] font-black tabular-nums min-w-[22px] h-[22px] px-1',
              allSetsDone
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/25',
            ].join(' ')}>
              {String(exIdx + 1).padStart(2, '0')}
            </span>
            {allSetsDone ? (
              <div className="relative flex-shrink-0">
                <CheckCircle2 size={18} className="text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
                <span className="absolute inset-0 rounded-full animate-ping bg-emerald-400/20" />
              </div>
            ) : (
              <Dumbbell size={16} className="text-yellow-500" />
            )}
            <h3 className={['font-black truncate flex-1', allSetsDone ? 'text-emerald-300' : 'text-white'].join(' ')}>{name}</h3>
            {isPR && (
              <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/40 text-yellow-400 text-[10px] font-black">
                <Trophy size={10} />
                PR
              </span>
            )}
            {collapsedNow ? <ChevronDown size={18} className="text-neutral-400" /> : <ChevronUp size={18} className="text-neutral-400" />}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
            <span className="font-mono">{setsCount} sets</span>
            <span className="opacity-30">•</span>
            {isExPlank ? (
              // Plank: show exercise hold time (durationSeconds) with "⏱" prefix so users
              // don't confuse it with rest time. Falls back to restTime if not configured.
              <span className="font-mono">
                {plankPlannedSec ? `⏱${plankPlannedSec}s` : restTime ? `${restTime}s desc` : '-'}
              </span>
            ) : (
              <span className="font-mono">{restTime ? `${restTime}s` : '-'}</span>
            )}
            <span className="opacity-30">•</span>
            {(() => {
              const methodLabel = String(ex?.method || 'Normal');
              const methodKey =
                methodLabel === 'Drop-set'
                  ? 'dropSet'
                  : methodLabel === 'Rest-Pause'
                    ? 'restPause'
                    : methodLabel === 'Cluster'
                      ? 'cluster'
                      : methodLabel === 'Bi-Set'
                        ? 'biSet'
                        : null;
              const term = methodKey ? (HELP_TERMS as Record<string, { title?: string; text?: string; tooltip?: string }>)[methodKey] : null;
              return (
                <span className="truncate inline-flex items-center gap-1 group">
                  <span className="truncate">{methodLabel}</span>
                  {term ? <HelpHint title={term.title || ""} text={term.text || ""} tooltip={term.tooltip} className="h-4 w-4 text-[10px]" /> : null}
                </span>
              );
            })()}
          </div>
          {/* Observação do professor — contexto de PREPARAÇÃO, não de execução.
              Antes vinha sempre aberta, em caixa com borda dourada: seis linhas
              de texto corrido por exercício empurravam a primeira série para
              fora da tela, e o dourado (que neste app significa AÇÃO) competia
              em peso com o botão de concluir. Agora nasce em duas linhas, com
              régua neutra, e abre sob toque. */}
          {observation ? (
            <div className="mt-2 border-l-2 border-white/10 pl-2.5">
              <div
                className={[
                  'text-[13px] text-neutral-400 leading-relaxed whitespace-pre-wrap',
                  noteOpen ? '' : 'line-clamp-2',
                ].join(' ')}
              >
                {noteOpen ? observation : notePreview}
              </div>
              {noteCollapsible ? (
                <button
                  type="button"
                  aria-expanded={noteOpen}
                  onClick={(e) => {
                    // O card inteiro é um role="button" que recolhe o exercício;
                    // sem parar a propagação, ler a técnica fecharia o exercício.
                    try { e.preventDefault(); e.stopPropagation(); } catch { }
                    setNoteOpen((v) => !v);
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-neutral-400 active:scale-95 transition-transform"
                >
                  {noteOpen ? 'Ocultar' : 'Ver técnica'}
                  {noteOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              ) : null}
            </div>
          ) : null}
          {/* Aviso proativo de deload: a análise de estagnação/regressão já existia
              e só alimentava um placeholder cinza escondido atrás do valor do
              autoload — daí a feature nunca ter sido usada (0 de 543 sessões).
              Agora ela fala. Só aparece com histórico suficiente e quando há algo
              a dizer; progressão normal não gera ruído. */}
          {deloadAlert ? (
            <div className="mt-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13px] text-amber-200 leading-snug">
                  {deloadAlert.status === 'overtraining'
                    ? `Sua carga caiu nas últimas ${deloadAlert.itemsCount} vezes que você fez este treino.`
                    : `Você está há ${deloadAlert.itemsCount} treinos sem evoluir neste exercício.`}
                </div>
                {/* O termo "deload" é jargão: quem nunca ouviu não sabe que reduzir
                    carga de propósito é o que destrava a evolução. O texto de ajuda
                    já existia pronto em HELP_TERMS e não era usado em lugar nenhum. */}
                <HelpHint
                  forceVisible
                  title={HELP_TERMS.deload.title}
                  text={HELP_TERMS.deload.text}
                  tooltip={HELP_TERMS.deload.tooltip}
                  className="h-5 w-5 shrink-0 text-[11px] border-amber-500/40 text-amber-300"
                />
              </div>
              {/* Explica o BENEFÍCIO antes de pedir a ação — sem isso o aviso manda
                  o usuário fazer algo que soa contraintuitivo (treinar mais leve). */}
              <div className="mt-1 text-[11px] text-amber-200/70 leading-snug">
                Aliviar a carga por um treino ajuda o corpo a recuperar e costuma
                destravar a evolução na semana seguinte.
              </div>
              <button
                type="button"
                onClick={async (e) => {
                  try { e.preventDefault(); e.stopPropagation(); } catch { }
                  setCurrentExerciseIdx(exIdx);
                  await openDeloadModal(ex, exIdx);
                }}
                className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-400 active:scale-95 transition-transform"
              >
                Aliviar {Math.round(deloadAlert.suggestedPct * 100)}% hoje →
              </button>
            </div>
          ) : null}
          {/* Per-card sets progress bar */}
          {setsCount > 0 && (
            <div className="mt-2 h-[3px] w-full bg-neutral-800/60 rounded-full overflow-hidden">
              <div
                className={[
                  'h-full rounded-full transition-all duration-500 ease-out',
                  allSetsDone ? 'bg-emerald-400' : 'bg-yellow-500'
                ].join(' ')}
                style={{ width: `${cardProgressPct}%` }}
              />
            </div>
          )}
        </div>
        {/* Action toolbar — sibling of collapse trigger, never nested inside interactive element */}
        <div className="flex-shrink-0 flex flex-row flex-wrap items-center justify-end gap-1.5 text-neutral-400">
          {videoUrl ? (
            <button
              type="button"
              onClick={async (e) => {
                try {
                  e.preventDefault();
                  e.stopPropagation();
                } catch { }
                setCurrentExerciseIdx(exIdx);
                try {
                  const win = typeof window !== 'undefined' ? window : null;
                  if (!win || !videoUrl) throw new Error('URL do vídeo indisponível');
                  const opened = win.open(videoUrl, '_blank', 'noopener,noreferrer');
                  if (!opened) throw new Error('Popup bloqueado ao abrir vídeo');
                  logInfo('ExerciseCard', '[ActiveWorkout] video opened', { exIdx, videoUrl });
                } catch (err) {
                  logError('ExerciseCard', '[ActiveWorkout] video open failed', { exIdx, videoUrl, err });
                  try {
                    await alert('Não foi possível abrir o vídeo agora. Verifique o link e tente novamente.');
                  } catch { }
                }
              }}
              className="tap-44 h-9 w-9 inline-flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95 flex-shrink-0"
              title="Ver vídeo"
              aria-label="Ver vídeo"
            >
              <Play size={16} />
            </button>
          ) : null}
          <ExecutionVideoCapture
            exerciseName={name}
            workoutId={workout?.id || undefined}
            exerciseId={String(ex?.id || ex?.exercise_id || '')}
            exerciseLibraryId={String(ex?.exercise_library_id || '')}
          />
          {/* O liga/desliga de descarga POR EXERCÍCIO saiu daqui em ago/2026.
              Descarga é decisão do TREINO — a fadiga que a justifica é sistêmica,
              e aliviar um movimento só não descansa nada. Oito botões pediam oito
              decisões para o que é uma só, e a chave por NOME de exercício fazia
              desligar o Supino num treino desligar em todos. O controle único
              está no topo da lista (SessionDeloadBanner). O modal manual abaixo
              segue para quem NÃO usa a carga automática. */}
          {autoLoadEnabled ? null : (
            <button
              type="button"
              onClick={async (e) => {
                try {
                  e.preventDefault();
                  e.stopPropagation();
                } catch { }
                setCurrentExerciseIdx(exIdx);
                await openDeloadModal(ex, exIdx);
              }}
              className={[
                'tap-44 h-9 inline-flex items-center justify-center gap-1 rounded-xl border transition-colors active:scale-95 flex-shrink-0',
                // Com aviso ativo o botão ganha rótulo e destaque: era um ícone de
                // seta sem texto no meio de outros ícones, e no celular não há hover
                // pra revelar o `title` — ninguém descobria que ali morava o deload.
                deloadAlert ? 'px-2.5 border-amber-500/50 bg-amber-500/15 text-amber-300' : 'w-9 bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-yellow-400 hover:bg-neutral-800',
              ].join(' ')}
              title="Sugestão de Deload"
              aria-label="Sugestão de Deload"
            >
              {isReportLoading ? <Loader2 size={16} className="animate-spin text-yellow-500" /> : <ArrowDown size={16} />}
              {deloadAlert ? (
                <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">Deload</span>
              ) : null}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              try {
                e.preventDefault();
                e.stopPropagation();
              } catch { }
              toggleLinkWeights(exIdx);
            }}
            className={`tap-44 h-9 w-9 inline-flex items-center justify-center rounded-xl border transition-colors active:scale-95 flex-shrink-0 ${linkedWeightExercises?.has(exIdx)
              ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
              }`}
            title="Sincronizar pesos"
            aria-label="Sincronizar pesos em todas as séries"
          >
            <Link size={14} className={linkedWeightExercises?.has(exIdx) ? '' : 'opacity-60'} />
          </button>
          {isBarbell ? (
            <button
              type="button"
              onClick={(e) => {
                try { e.preventDefault(); e.stopPropagation(); } catch { }
                setCurrentExerciseIdx(exIdx);
                setPlateCalcOpen(true);
              }}
              className="tap-44 h-9 w-9 inline-flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-yellow-400 hover:bg-neutral-800 transition-colors active:scale-95 flex-shrink-0"
              title="Calculadora de anilhas"
              aria-label="Calculadora de anilhas"
            >
              <Weight size={15} />
            </button>
          ) : null}
          <AIExerciseSwap exerciseName={name} exerciseIndex={exIdx} />
          <button
            type="button"
            onClick={async (e) => {
              try {
                e.preventDefault();
                e.stopPropagation();
              } catch { }
              setCurrentExerciseIdx(exIdx);
              await openEditExercise(exIdx);
            }}
            className="tap-44 h-9 w-9 inline-flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95 flex-shrink-0"
            title="Editar exercício"
            aria-label="Editar exercício"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              try { e.preventDefault(); e.stopPropagation(); } catch { }
              if (deleteConfirmIdx === exIdx) {
                closeDeleteConfirm();
              } else {
                openDeleteConfirm(exIdx);
              }
            }}
            className={[
              'tap-44 h-9 w-9 inline-flex items-center justify-center rounded-xl border transition-colors active:scale-95 flex-shrink-0',
              deleteConfirmIdx === exIdx
                ? 'bg-red-500/15 border-red-500/40 text-red-400'
                : 'bg-neutral-900 border-red-500/20 text-red-400/50 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10',
            ].join(' ')}
            title="Remover exercício"
            aria-label="Remover exercício do treino"
          >
            <Trash2 size={14} />
          </button>
          {/* Share with partner — only when team session is active */}
          {teamCtx?.teamSession && (
            <button
              type="button"
              onClick={(e) => {
                try {
                  e.preventDefault();
                  e.stopPropagation();
                } catch { }
                try {
                  // Collect current logs for this exercise
                  const exerciseLogs: Record<string, unknown> = {}
                  for (let i = 0; i < setsCount; i++) {
                    const key = `${exIdx}-${i}`
                    exerciseLogs[key] = getLog(key)
                  }
                  teamCtx.shareExerciseWithPartner(exIdx, ex as Record<string, unknown>, exerciseLogs, null)
                } catch (err) {
                  logError('ExerciseCard', 'Failed to share exercise', { exIdx, err })
                }
              }}
              className="tap-44 h-9 w-9 inline-flex items-center justify-center rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 transition-colors active:scale-95 flex-shrink-0"
              title="Compartilhar com parceiro"
              aria-label="Compartilhar exercício com parceiro"
            >
              <Share2 size={14} />
            </button>
          )}
        </div>
      </div>

      {plateCalcOpen ? (
        <PlateCalculatorSheet
          isOpen={plateCalcOpen}
          onClose={() => setPlateCalcOpen(false)}
          exerciseName={name}
          setLabel={`Série ${targetSetIdx + 1}`}
          initialWeight={parseTrainingNumber(getLog(`${exIdx}-${targetSetIdx}`).weight) ?? null}
          inventory={plateInventory}
          onApply={(w) => {
            // weightSource 'user': o usuário assumiu esta carga — o motor de autoload
            // nunca mais a reescreve (mesma regra do campo digitado à mão).
            updateLog(`${exIdx}-${targetSetIdx}`, { weight: String(w), weightSource: 'user' });
          }}
          onSaveInventory={(counts, bar) => onSavePlateSetup?.(counts, bar)}
        />
      ) : null}

      {deleteConfirmIdx === exIdx && (
        <div className="mt-3 rounded-xl border border-red-500/25 p-4" style={{ background: 'rgba(239,68,68,0.07)' }}>
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)' }}>
              <Trash2 size={15} className="text-red-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white leading-snug">Remover &quot;{name}&quot;?</div>
              <div className="text-xs text-neutral-400 mt-0.5 leading-snug">Escolha como deseja remover este exercício.</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={(e) => { try { e.stopPropagation(); } catch { } void removeExerciseFromWorkout(false); }}
              className="w-full min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-sm text-white font-medium hover:bg-neutral-700 active:scale-95 transition-all"
            >
              Só desta vez
            </button>
            <button
              type="button"
              onClick={(e) => { try { e.stopPropagation(); } catch { } void removeExerciseFromWorkout(true); }}
              className="w-full min-h-[44px] rounded-xl border border-red-500/30 text-sm text-red-400 font-medium hover:bg-red-500/15 active:scale-95 transition-all"
              style={{ background: 'rgba(239,68,68,0.08)' }}
            >
              Remover do plano de treino
            </button>
            <button
              type="button"
              onClick={(e) => { try { e.stopPropagation(); } catch { } closeDeleteConfirm(); }}
              className="w-full min-h-[44px] rounded-xl text-sm text-neutral-400 hover:text-neutral-300 active:scale-95 transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!collapsedNow && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: setsCount }).map((_, setIdx) => (
            <div key={`set-${exIdx}-${setIdx}`}>
              {renderSet(setIdx)}
              {/* Seletor de método FORA do renderer: vale para os 14 sem tocar
                  em nenhum. Antes ele vivia só no `normalSet`, então a série que
                  virava avançada perdia a única forma de voltar para Normal —
                  e no caso real o drop nem tinha sido escolhido: veio da nota
                  "DROP-SET na última série". */}
              {renderMethodPicker(setIdx)}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addExtraSetToExercise(exIdx)}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 font-black hover:bg-neutral-800 active:scale-95 transition-transform"
            >
              <Plus size={16} />
              <span className="text-sm">Série extra</span>
            </button>
            <button aria-label="Remover série"
              type="button"
              onClick={() => setRemoveSetOpen((v) => !v)}
              aria-expanded={removeSetOpen}
              className={[
                'min-h-[44px] px-4 inline-flex items-center justify-center gap-2 rounded-xl border active:scale-95 transition-colors disabled:opacity-30',
                removeSetOpen
                  ? 'bg-red-500/15 border-red-500/40 text-red-400'
                  : 'bg-neutral-900/50 border-red-500/20 text-red-500 hover:bg-red-500/10',
              ].join(' ')}
              disabled={setsCount <= 1}
              title="Remover uma série"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Escolha da série a remover. Fica FORA da linha dos botões (uma lixeira
              por série apertaria 14 renderers diferentes; aqui a mesma escolha vale
              para todos os métodos, sem tocar em nenhum deles). */}
          {removeSetOpen && setsCount > 1 && (
            <div className="rounded-xl border border-red-500/25 p-3" style={{ background: 'rgba(239,68,68,0.07)' }}>
              <div className="text-xs font-black uppercase tracking-widest text-red-300 mb-2">Remover qual série?</div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: setsCount }).map((_, sIdx) => {
                  const sDone = !!getLog(`${exIdx}-${sIdx}`).done;
                  return (
                    <button
                      key={sIdx}
                      type="button"
                      aria-label={`Remover série ${sIdx + 1}`}
                      onClick={() => {
                        setRemoveSetOpen(false);
                        // Congela o método VISÍVEL das séries que ficam antes de
                        // remover. Sem isto, apagar a série que carrega um método
                        // INFERIDO ("DROP-SET na última série", vindo da nota) faz
                        // a regra escorregar para a vizinha: o dono apagou a 3
                        // (drop) e a 2 virou drop, parecendo que o app tinha
                        // apagado a série errada (24/08/2026).
                        freezeInferredMethodsBeforeRemoval(sIdx);
                        void removeSetAtIndex(exIdx, sIdx);
                      }}
                      className={[
                        'tap-44 min-w-[44px] h-9 px-3 inline-flex items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-colors',
                        sDone
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-300'
                          : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-300',
                      ].join(' ')}
                    >
                      #{sIdx + 1}
                      {sDone && <CheckCircle2 size={12} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setRemoveSetOpen(false)}
                className="mt-2 w-full min-h-[44px] rounded-xl text-sm text-neutral-400 hover:text-neutral-300 active:scale-95 transition-all"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Comparador do memo: re-renderiza o card pesado só quando ex/exIdx/groupPos mudam OU o slice
// de logs DESTE exercício muda (shallow por referência). Assim uma tecla em outro exercício
// (que gera um slice novo mas shallow-igual aqui) NÃO re-renderiza este card.
function arePropsEqual(
  prev: { ex: WorkoutExercise; exIdx: number; groupPos?: GroupPos; logsSlice: Record<string, Record<string, unknown>> },
  next: { ex: WorkoutExercise; exIdx: number; groupPos?: GroupPos; logsSlice: Record<string, Record<string, unknown>> },
): boolean {
  return (
    prev.ex === next.ex &&
    prev.exIdx === next.exIdx &&
    prev.groupPos === next.groupPos &&
    shallowEqualByRef(prev.logsSlice, next.logsSlice)
  );
}

const ExerciseCardMemo = React.memo(ExerciseCardInner, arePropsEqual);

// Wrapper "connected": ISOLA a assinatura do context de logs. Ele re-renderiza a cada tecla
// (é barato — só extrai o slice), mas o card pesado (ExerciseCardMemo) só re-renderiza quando
// o slice DESTE exercício muda (via arePropsEqual). Antes, o ExerciseCardInner chamava
// useWorkoutLogs() direto e o React.memo era inútil (context não respeita memo) -> todos os
// cards re-renderizavam a cada tecla. Os 4 call sites (lista, partner overlay, 2× teacher)
// seguem renderizando <ExerciseCard> sem mudança — o wrapper cuida dos logs internamente.
function ExerciseCard({ ex, exIdx, groupPos }: { ex: WorkoutExercise; exIdx: number; groupPos?: GroupPos }) {
  const logs = useWorkoutLogs() as Record<string, Record<string, unknown>>;
  const logsSlice = pickExerciseLogSlice(logs, exIdx) as Record<string, Record<string, unknown>>;
  return <ExerciseCardMemo ex={ex} exIdx={exIdx} groupPos={groupPos} logsSlice={logsSlice} />;
}
export default ExerciseCard;
