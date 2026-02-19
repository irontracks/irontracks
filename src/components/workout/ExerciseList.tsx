import React from 'react';
import { Reorder } from 'framer-motion';
import { ExerciseCard } from './ExerciseCard';
import { UnknownRecord } from './types';

type Props = {
  exercises: UnknownRecord[];
  collapsed: Set<number>;
  onToggleCollapse: (idx: number) => void;
  onOpenVideo: (url: string) => void;
  onOpenDeload: (ex: UnknownRecord, idx: number) => void;
  onOpenEdit: (idx: number) => void;
  onAddSet: (idx: number) => void;
};

export const ExerciseList: React.FC<Props> = ({
  exercises,
  collapsed,
  onToggleCollapse,
  onOpenVideo,
  onOpenDeload,
  onOpenEdit,
  onAddSet,
}) => {
  return (
    <div className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-6 pb-32 space-y-4">
      {exercises.map((ex, idx) => (
        <ExerciseCard
          key={idx}
          ex={ex}
          exIdx={idx}
          collapsed={collapsed.has(idx)}
          onToggle={() => onToggleCollapse(idx)}
          onOpenVideo={onOpenVideo}
          onOpenDeload={() => onOpenDeload(ex, idx)}
          onOpenEdit={() => onOpenEdit(idx)}
          onAddSet={() => onAddSet(idx)}
        />
      ))}
    </div>
  );
};
