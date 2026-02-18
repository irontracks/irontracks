import React from 'react';
import { Plus, GripVertical, UserPlus, Clock } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { formatElapsed } from './utils';

type HeaderProps = {
  title: string;
  elapsedSeconds: number;
  exercisesCount: number;
  onBack?: () => void;
  onAddExercise: () => void;
  onOrganize: () => void;
  onInvite: () => void;
};

export const Header: React.FC<HeaderProps> = ({
  title,
  elapsedSeconds,
  exercisesCount,
  onBack,
  onAddExercise,
  onOrganize,
  onInvite,
}) => {
  return (
    <div className="sticky top-0 z-40 bg-neutral-950 border-b border-neutral-800 px-4 md:px-6 py-4 pt-safe">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BackButton onClick={onBack} />
          <button
            type="button"
            onClick={onAddExercise}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black hover:bg-yellow-400 transition-colors active:scale-95"
            title="Adicionar exercício extra"
          >
            <Plus size={16} />
            <span className="text-sm font-black hidden sm:inline">Exercício</span>
          </button>
          <button
            type="button"
            onClick={onOrganize}
            disabled={exercisesCount < 2}
            className={
              exercisesCount < 2
                ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-700'
                : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 transition-colors active:scale-95'
            }
            title="Organizar exercícios"
          >
            <GripVertical size={16} />
            <span className="text-sm font-black hidden sm:inline">Organizar</span>
          </button>
          <button
            type="button"
            onClick={onInvite}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 transition-colors active:scale-95"
            title="Convidar para treinar junto"
          >
            <UserPlus size={16} />
            <span className="text-sm font-black hidden sm:inline">Convidar</span>
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-black text-white truncate text-right">{title}</div>
          <div className="text-xs text-neutral-400 flex items-center justify-end gap-2 mt-1">
            <Clock size={14} className="text-yellow-500" />
            <span className="font-mono text-yellow-500">{formatElapsed(elapsedSeconds)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
