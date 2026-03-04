'use client';

import React from 'react';
import { ArrowDown, CheckCircle2, ChevronDown, ChevronUp, Dumbbell, Link, Loader2, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useWorkoutContext } from './WorkoutContext';
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
} from './SetRenderers';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { isObject, isClusterConfig, isRestPauseConfig } from './utils';
import { WorkoutExercise, UnknownRecord } from './types';
import ExecutionVideoCapture from '@/components/ExecutionVideoCapture';
import { logError, logWarn, logInfo } from '@/lib/logger'

export default function ExerciseCard({ ex, exIdx }: { ex: WorkoutExercise; exIdx: number }) {
  const {
    workout,
    collapsed,
    toggleCollapse,
    setCurrentExerciseIdx,
    reportHistoryStatus,
    reportHistoryLoadingRef,
    openDeloadModal,
    openEditExercise,
    addExtraSetToExercise,
    getPlannedSet,
    getPlanConfig,
    getLog,
    alert,
    removeExtraSetFromExercise,
    linkedWeightExercises,
    toggleLinkWeights,
  } = useWorkoutContext();

  const name = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
  const observation = String(ex?.notes || '').trim();
  const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
  const sdArr: unknown[] = Array.isArray(ex?.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex?.set_details) ? (ex.set_details as unknown[]) : [];
  const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
  const collapsedNow = collapsed.has(exIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const videoUrl = String(ex?.videoUrl ?? ex?.video_url ?? '').trim();
  const isReportLoading = reportHistoryStatus?.status === 'loading' && reportHistoryLoadingRef.current;

  // Compute whether all sets in this exercise are marked done
  const allSetsDone = setsCount > 0 && Array.from({ length: setsCount }).every((_, setIdx) => {
    const log = getLog(`${exIdx}-${setIdx}`);
    return !!log.done;
  });

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

    // Drop-Set: array config or saved drop stages
    const dropSet = isObject(log.drop_set) ? (log.drop_set as UnknownRecord) : null;
    const dropStages: unknown[] = dropSet && Array.isArray(dropSet.stages) ? (dropSet.stages as unknown[]) : [];
    if (Array.isArray(rawCfg) || dropStages.length > 0) {
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
    return <NormalSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
  };

  return (
    <div className={[
      'rounded-2xl bg-neutral-900/70 border p-4 shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-all duration-300',
      allSetsDone
        ? 'border-emerald-500/40 shadow-[0_0_20px_-4px_rgba(52,211,153,0.18)]'
        : 'border-neutral-800/80',
    ].join(' ')}>
      <div
        role="button"
        tabIndex={0}
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
        className="w-full flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
      >
        <div className="min-w-0 text-left flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {allSetsDone ? (
              <div className="relative flex-shrink-0">
                <CheckCircle2 size={18} className="text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
                <span className="absolute inset-0 rounded-full animate-ping bg-emerald-400/20" />
              </div>
            ) : (
              <Dumbbell size={16} className="text-yellow-500" />
            )}
            <h3 className={['font-black truncate flex-1', allSetsDone ? 'text-emerald-300' : 'text-white'].join(' ')}>{name}</h3>
            {collapsedNow ? <ChevronDown size={18} className="text-neutral-400" /> : <ChevronUp size={18} className="text-neutral-400" />}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
            <span className="font-mono">{setsCount} sets</span>
            <span className="opacity-30">•</span>
            <span className="font-mono">{restTime ? `${restTime}s` : '-'}</span>
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
          {observation ? (
            <div className="mt-2 rounded-xl bg-neutral-900/50 border border-yellow-500/20 px-3 py-2">
              <div className="text-sm text-neutral-200 whitespace-pre-wrap leading-snug">{observation}</div>
            </div>
          ) : null}
        </div>
        <div className="mt-1 flex flex-row flex-nowrap items-center justify-end gap-1.5 text-neutral-400">
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
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95 flex-shrink-0"
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
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95 flex-shrink-0"
            title="Sugestão de Deload"
            aria-label="Sugestão de Deload"
          >
            {isReportLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowDown size={16} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              try {
                e.preventDefault();
                e.stopPropagation();
              } catch { }
              toggleLinkWeights(exIdx);
            }}
            className={`h-9 w-9 inline-flex items-center justify-center rounded-xl border transition-colors active:scale-95 flex-shrink-0 ${linkedWeightExercises?.has(exIdx)
              ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
              }`}
            title="Sincronizar pesos"
            aria-label="Sincronizar pesos em todas as séries"
          >
            <Link size={14} className={linkedWeightExercises?.has(exIdx) ? '' : 'opacity-60'} />
          </button>
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
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95 flex-shrink-0"
            title="Editar exercício"
            aria-label="Editar exercício"
          >
            <Pencil size={14} />
          </button>
        </div>
      </div>

      {!collapsedNow && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: setsCount }).map((_, setIdx) => renderSet(setIdx))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addExtraSetToExercise(exIdx)}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 font-black hover:bg-neutral-800 active:scale-95 transition-transform"
            >
              <Plus size={16} />
              <span className="text-sm">Série extra</span>
            </button>
            <button
              type="button"
              onClick={() => {
                removeExtraSetFromExercise(exIdx);
              }}
              className="min-h-[44px] px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900/50 border border-red-500/20 text-red-500 hover:bg-red-500/10 active:scale-95 transition-colors disabled:opacity-30"
              disabled={setsCount <= 1}
              title="Remover última série"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
