'use client';

import React from 'react';
import { ArrowDown, ChevronDown, ChevronUp, Dumbbell, Loader2, Pencil, Play, Plus } from 'lucide-react';
import { useWorkoutContext } from './WorkoutContext';
import { NormalSet, RestPauseSet, ClusterSet, DropSetSet } from './SetRenderers';
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

  const renderSet = (setIdx: number) => {
    const plannedSet = getPlannedSet(ex, setIdx);
    const rawCfg = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const dropSet = isObject(log.drop_set) ? (log.drop_set as UnknownRecord) : null;
    const dropStages: unknown[] = dropSet && Array.isArray(dropSet.stages) ? (dropSet.stages as unknown[]) : [];
    const hasDropStages = dropStages.length > 0;
    
    if (Array.isArray(rawCfg) || hasDropStages) {
      return <DropSetSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }
    
    const cfg = getPlanConfig(ex, setIdx);
    const method = String(ex?.method || '').trim();
    const isCluster = method === 'Cluster' || isClusterConfig(cfg);
    const isRestPause = method === 'Rest-Pause' || isRestPauseConfig(cfg);
    
    if (isCluster) {
      return <ClusterSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }
    if (isRestPause) {
      return <RestPauseSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
    }
    
    return <NormalSet key={key} ex={ex} exIdx={exIdx} setIdx={setIdx} />;
  };

  return (
    <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800/80 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
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
            } catch {}
            setCurrentExerciseIdx(exIdx);
            toggleCollapse(exIdx);
          }
        }}
        className="w-full flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
      >
        <div className="min-w-0 text-left flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <Dumbbell size={16} className="text-yellow-500" />
            <h3 className="font-black text-white truncate flex-1">{name}</h3>
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
              const term = methodKey ? (HELP_TERMS as any)[methodKey] : null;
              return (
                <span className="truncate inline-flex items-center gap-1 group">
                  <span className="truncate">{methodLabel}</span>
                  {term ? <HelpHint title={term.title} text={term.text} tooltip={term.tooltip} className="h-4 w-4 text-[10px]" /> : null}
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
        <div className="mt-1 grid grid-cols-4 gap-2 text-neutral-400 sm:flex sm:items-center sm:justify-end">
          {videoUrl ? (
            <button
              type="button"
              onClick={async (e) => {
                try {
                  e.preventDefault();
                  e.stopPropagation();
                } catch {}
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
                  } catch {}
                }
              }}
              className="h-9 w-9 inline-flex flex-col items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95"
              title="Ver vídeo"
              aria-label="Ver vídeo"
            >
              <Play size={16} />
              <span className="mt-0.5 text-[10px] leading-none text-neutral-400 opacity-60">Vídeo</span>
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
              } catch {}
              setCurrentExerciseIdx(exIdx);
              await openDeloadModal(ex, exIdx);
            }}
            className="flex-1 flex flex-col items-center justify-center py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95 min-w-[60px]"
          >
            {isReportLoading ? <Loader2 size={16} className="animate-spin mb-1" /> : <ArrowDown size={16} className="mb-1" />}
            <span className="text-[10px] leading-none text-neutral-400 font-medium">Deload</span>
          </button>
          <button
            type="button"
            onClick={async (e) => {
              try {
                e.preventDefault();
                e.stopPropagation();
              } catch {}
              setCurrentExerciseIdx(exIdx);
              await openEditExercise(exIdx);
            }}
            className="h-9 w-9 inline-flex flex-col items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95"
            title="Editar exercício"
            aria-label="Editar exercício"
          >
            <Pencil size={14} />
            <span className="mt-0.5 text-[10px] leading-none text-neutral-400 opacity-60">Editar</span>
          </button>
        </div>
      </div>

      {!collapsedNow && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: setsCount }).map((_, setIdx) => renderSet(setIdx))}
          <button
            type="button"
            onClick={() => addExtraSetToExercise(exIdx)}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 font-black hover:bg-neutral-800 active:scale-95 transition-transform"
          >
            <Plus size={16} />
            <span className="text-sm">Série extra</span>
          </button>
        </div>
      )}
    </div>
  );
}
