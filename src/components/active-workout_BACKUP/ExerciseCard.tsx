import React from 'react';
import { Dumbbell, ChevronDown, ChevronUp, Play, Loader2, ArrowDown, Pencil, Plus } from 'lucide-react';
import { HelpHint } from '@/components/ui/HelpHint';
import ExecutionVideoCapture from '@/components/ExecutionVideoCapture';
import { useActiveWorkout } from './ActiveWorkoutContext';
import { ExerciseSet } from './sets/ExerciseSet';
import { toNumber } from './utils';
import { UnknownRecord } from './types';

type Props = {
  ex: UnknownRecord;
  exIdx: number;
  collapsed: boolean;
  onToggle: () => void;
  onOpenVideo: (url: string) => void;
  onOpenDeload: () => void;
  onOpenEdit: () => void;
  onAddSet: () => void;
};

export const ExerciseCard: React.FC<Props> = ({
  ex,
  exIdx,
  collapsed,
  onToggle,
  onOpenVideo,
  onOpenDeload,
  onOpenEdit,
  onAddSet,
}) => {
  const { HELP_TERMS, getLog } = useActiveWorkout(); // getLog maybe not needed here directly

  const name = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
  const observation = String(ex?.notes || '').trim();
  const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
  const sdArr: unknown[] = Array.isArray(ex?.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex?.set_details) ? (ex.set_details as unknown[]) : [];
  const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
  const restTime = toNumber(ex?.restTime ?? ex?.rest_time);
  const videoUrl = String(ex?.videoUrl ?? ex?.video_url ?? '').trim();
  const isReportLoading = false; // TODO: Pass via props if needed

  return (
    <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800/80 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        className="w-full flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
      >
        <div className="min-w-0 text-left flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <Dumbbell size={16} className="text-yellow-500" />
            <h3 className="font-black text-white truncate flex-1">{name}</h3>
            {collapsed ? <ChevronDown size={18} className="text-neutral-400" /> : <ChevronUp size={18} className="text-neutral-400" />}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
            <span className="font-mono">{setsCount} sets</span>
            <span className="opacity-30">•</span>
            <span className="font-mono">{restTime ? `${restTime}s` : '-'}</span>
            <span className="opacity-30">•</span>
            {(() => {
              const methodLabel = String(ex?.method || 'Normal');
              return <span className="truncate">{methodLabel}</span>;
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
              onClick={(e) => {
                e.stopPropagation();
                onOpenVideo(videoUrl);
              }}
              className="h-9 w-9 inline-flex flex-col items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95"
            >
              <Play size={16} />
              <span className="mt-0.5 text-[10px] leading-none text-neutral-400 opacity-60">Vídeo</span>
            </button>
          ) : null}
          <ExecutionVideoCapture
            exerciseName={name}
            workoutId={null} // TODO: Pass via props
            exerciseId={String(ex?.id || ex?.exercise_id || '')}
            exerciseLibraryId={String(ex?.exercise_library_id || '')}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDeload();
            }}
            className="h-9 w-9 inline-flex flex-col items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95 group"
          >
            {isReportLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowDown size={14} />}
            <span className="mt-0.5 text-[10px] leading-none text-neutral-400 opacity-60">Deload</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenEdit();
            }}
            className="h-9 w-9 inline-flex flex-col items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95"
          >
            <Pencil size={14} />
            <span className="mt-0.5 text-[10px] leading-none text-neutral-400 opacity-60">Editar</span>
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: setsCount }).map((_, setIdx) => (
            <ExerciseSet key={setIdx} ex={ex} exIdx={exIdx} setIdx={setIdx} />
          ))}
          <button
            type="button"
            onClick={onAddSet}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 font-black hover:bg-neutral-800 active:scale-95 transition-transform"
          >
            <Plus size={16} />
            <span className="text-sm">Série extra</span>
          </button>
        </div>
      )}
    </div>
  );
};
