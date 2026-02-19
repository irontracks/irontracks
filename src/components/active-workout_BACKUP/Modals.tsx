import React from 'react';
import { useActiveWorkout } from './ActiveWorkoutContext';
import { X, Clock, Save, Plus, Link2, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import InviteManager from '@/components/InviteManager';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { UnknownRecord } from './types';
import { isObject, buildBlocksByCount, DROPSET_STAGE_LIMIT, DELOAD_SUGGEST_MODE } from './utils';

const ExerciseSortRow = ({
  item,
  index,
  total,
  onMoveUp,
  onMoveDown,
}: {
  item: UnknownRecord;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) => {
  const dragControls = useDragControls();
  const exercise = isObject(item.exercise) ? (item.exercise as UnknownRecord) : ({} as UnknownRecord);
  const name = String(exercise.name || '').trim() || `Exercício ${Number(index) + 1}`;
  const canMoveUp = index > 0;
  const canMoveDown = index < total - 1;

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      className="rounded-xl bg-neutral-800 border border-neutral-700 p-3 flex items-center gap-3"
    >
      <button
        type="button"
        onPointerDown={(e) => dragControls.start(e)}
        className="h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 inline-flex items-center justify-center active:scale-95"
      >
        <GripVertical size={16} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-black text-white truncate">{name}</div>
        <div className="text-[11px] text-neutral-500">Posição {index + 1}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className={
            canMoveUp
              ? 'h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-700 text-yellow-500 inline-flex items-center justify-center hover:bg-neutral-800 active:scale-95'
              : 'h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-700 inline-flex items-center justify-center'
          }
        >
          <ArrowUp size={16} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className={
            canMoveDown
              ? 'h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-700 text-yellow-500 inline-flex items-center justify-center hover:bg-neutral-800 active:scale-95'
              : 'h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-700 inline-flex items-center justify-center'
          }
        >
          <ArrowDown size={16} />
        </button>
      </div>
    </Reorder.Item>
  );
};

export const Modals = () => {
  const {
    clusterModal, setClusterModal, saveClusterModal, startTimer,
    restPauseModal, setRestPauseModal, saveRestPauseModal,
    dropSetModal, setDropSetModal, saveDropSetModal, deloadSuggestions,
    addExerciseOpen, setAddExerciseOpen, addExerciseDraft, setAddExerciseDraft, addExtraExerciseToWorkout,
    organizeOpen, setOrganizeOpen, organizeDraft, setOrganizeDraft, organizeSaving, organizeError, saveOrganize, requestCloseOrganize,
    postCheckinOpen, setPostCheckinOpen, postCheckinDraft, setPostCheckinDraft, postCheckinResolveRef,
    editExerciseOpen, setEditExerciseOpen, editExerciseDraft, setEditExerciseDraft, saveEditExercise,
    deloadModal, setDeloadModal,
    inviteOpen, setInviteOpen, handleInvite,
    getLog
  } = useActiveWorkout();

  return (
    <>
      <InviteManager
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={handleInvite}
      />

      {clusterModal && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setClusterModal(null)}
        >
          <div
            className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Cluster</div>
                <div className="text-white font-black text-lg truncate">Preencher blocos</div>
                <div className="text-xs text-neutral-400 truncate">
                  {Array.isArray(clusterModal?.plannedBlocks) ? `${clusterModal.plannedBlocks.length} blocos` : 'Blocos'}
                  {Array.isArray(clusterModal?.restsByGap) && clusterModal.restsByGap.length
                    ? ` • descanso ${clusterModal.restsByGap[0]}s`
                    : clusterModal?.intra
                      ? ` • descanso ${clusterModal.intra}s`
                      : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClusterModal(null)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {clusterModal?.error ? (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                  {String(clusterModal.error)}
                </div>
              ) : null}
              {Array.isArray(clusterModal?.blocks) && clusterModal.blocks.length > 0 ? (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setClusterModal((prev) => {
                        if (!prev || typeof prev !== 'object') return prev;
                        const plannedBlocks = Array.isArray(prev?.plannedBlocks) ? prev.plannedBlocks : [];
                        const restsByGap = Array.isArray(prev?.restsByGap) ? prev.restsByGap : [];
                        const baseWeight = String(prev?.baseWeight ?? '').trim();
                        const blocks = plannedBlocks.map((p) => ({ planned: p, weight: baseWeight, reps: null as number | null }));
                        return { ...prev, restsByGap, blocks, error: '' };
                      });
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                  >
                    Resetar pesos
                  </button>
                </div>
              ) : null}

              {!Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Configurar Cluster</div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      inputMode="decimal"
                      value={String((((clusterModal as UnknownRecord | null)?.planned as UnknownRecord | null)?.total_reps ?? '') as unknown)}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setClusterModal((prev) => {
                          if (!isObject(prev)) return prev;
                          const planned: UnknownRecord = isObject(prev.planned) ? (prev.planned as UnknownRecord) : {};
                          return { ...prev, planned: { ...planned, total_reps: v ?? null }, error: '' };
                        });
                      }}
                      placeholder="Total reps (ex.: 12)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                    <input
                      inputMode="decimal"
                      value={String((((clusterModal as UnknownRecord | null)?.planned as UnknownRecord | null)?.cluster_blocks_count ?? '') as unknown)}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setClusterModal((prev) => {
                          if (!isObject(prev)) return prev;
                          const planned: UnknownRecord = isObject(prev.planned) ? (prev.planned as UnknownRecord) : {};
                          return { ...prev, planned: { ...planned, cluster_blocks_count: v ?? null }, error: '' };
                        });
                      }}
                      placeholder="Blocos (ex.: 3)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                    <input
                      inputMode="decimal"
                      value={String((((clusterModal as UnknownRecord | null)?.planned as UnknownRecord | null)?.intra_rest_sec ?? (clusterModal as UnknownRecord | null)?.intra ?? '') as unknown)}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setClusterModal((prev) => {
                          if (!isObject(prev)) return prev;
                          const planned: UnknownRecord = isObject(prev.planned) ? (prev.planned as UnknownRecord) : {};
                          return { ...prev, planned: { ...planned, intra_rest_sec: v ?? null }, intra: v ?? prev.intra ?? 15, error: '' };
                        });
                      }}
                      placeholder="Descanso (s) (ex.: 15)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const planned = (clusterModal as UnknownRecord | null)?.planned as UnknownRecord | null;
                        const total = parseTrainingNumber(planned?.total_reps);
                        const blocksCount = parseTrainingNumber(planned?.cluster_blocks_count);
                        const intra = parseTrainingNumber(planned?.intra_rest_sec) ?? parseTrainingNumber((clusterModal as UnknownRecord | null)?.intra) ?? 15;
                        const plannedBlocks = buildBlocksByCount(total, blocksCount);
                        if (!plannedBlocks.length) {
                          setClusterModal((prev) =>
                            prev && typeof prev === 'object'
                              ? { ...prev, error: 'Configuração inválida. Preencha total reps e quantidade de blocos.' }
                              : prev,
                          );
                          return;
                        }
                        const restsByGap = plannedBlocks.length > 1 ? Array.from({ length: plannedBlocks.length - 1 }).map(() => intra) : [];
                        const baseWeight = String(clusterModal?.baseWeight ?? '').trim();
                        const blocks = plannedBlocks.map((p) => ({ planned: p, weight: baseWeight, reps: null as number | null }));
                        setClusterModal((prev) => {
                          if (!prev || typeof prev !== 'object') return prev;
                          const planned = prev.planned && typeof prev.planned === 'object' ? prev.planned : {};
                          return {
                            ...prev,
                            planned: { ...planned, total_reps: total ?? null, cluster_blocks_count: blocksCount ?? null, intra_rest_sec: intra ?? null },
                            plannedBlocks,
                            restsByGap,
                            blocks,
                            error: '',
                          };
                        });
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                    >
                      Gerar blocos
                    </button>
                  </div>
                </div>
              ) : null}
              {Array.isArray(clusterModal?.blocks) &&
                ((clusterModal as UnknownRecord).blocks as unknown[]).map((b, idx) => {
                  const modal = clusterModal as UnknownRecord;
                  const modalBlocks = Array.isArray(modal.blocks) ? (modal.blocks as unknown[]) : [];
                  const block = isObject(b) ? (b as UnknownRecord) : ({} as UnknownRecord);
                  const plannedValue = block.planned ?? null;
                  const plannedLabel = plannedValue == null ? '' : String(plannedValue);
                  const repsValue = block.reps == null ? '' : String(block.reps);
                  const weightValue = String(block.weight ?? '');
                  const isLast = idx >= modalBlocks.length - 1;
                  const restsByGap: unknown[] = Array.isArray(modal.restsByGap) ? (modal.restsByGap as unknown[]) : [];
                  const restSec = restsByGap.length ? Number(restsByGap[idx]) : Number(modal.intra);
                  const safeRestSec = Number.isFinite(restSec) && restSec > 0 ? restSec : 0;
                  return (
                    <div key={`cluster-block-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Bloco {idx + 1}</div>
                        {plannedLabel ? <div className="text-[10px] font-mono text-neutral-500">plan {plannedLabel}</div> : <div />}
                      </div>
                      {!isLast && safeRestSec ? (
                        <button
                          type="button"
                          onClick={() => {
                            startTimer(safeRestSec, { kind: 'cluster', key: modal.key, blockIndex: idx });
                          }}
                          className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 active:scale-95 transition-transform z-10"
                          aria-label={`Iniciar descanso ${safeRestSec}s`}
                        >
                          <Clock size={14} className="text-yellow-500" />
                          <span className="text-xs font-black">{safeRestSec}s</span>
                        </button>
                      ) : null}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          inputMode="decimal"
                          value={weightValue}
                          onChange={(e) => {
                            const v = e?.target?.value ?? '';
                            setClusterModal((prev) => {
                              if (!prev || typeof prev !== 'object') return prev;
                              const nextBlocks = Array.isArray(prev.blocks) ? [...prev.blocks] : [];
                              const cur = nextBlocks[idx] && typeof nextBlocks[idx] === 'object' ? nextBlocks[idx] : {};
                              nextBlocks[idx] = { ...cur, weight: v };
                              return { ...prev, blocks: nextBlocks, error: '' };
                            });
                          }}
                          placeholder="kg"
                          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                        <input
                          inputMode="decimal"
                          value={repsValue}
                          onChange={(e) => {
                            const v = parseTrainingNumber(e?.target?.value);
                            const next = v != null && v > 0 ? v : null;
                            setClusterModal((prev) => {
                              if (!prev || typeof prev !== 'object') return prev;
                              const nextBlocks = Array.isArray(prev.blocks) ? [...prev.blocks] : [];
                              const cur = nextBlocks[idx] && typeof nextBlocks[idx] === 'object' ? nextBlocks[idx] : {};
                              nextBlocks[idx] = { ...cur, reps: next };
                              return { ...prev, blocks: nextBlocks, error: '' };
                            });
                          }}
                          placeholder="reps"
                          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                      </div>
                      {!isLast ? <div className="mt-2 text-xs text-neutral-500">Descanso: {safeRestSec}s</div> : null}
                    </div>
                  );
                })}

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE da série</div>
                <input
                  inputMode="decimal"
                  value={String(clusterModal?.rpe ?? '')}
                  onChange={(e) => {
                    const v = e?.target?.value ?? '';
                    setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, rpe: v, error: '' } : prev));
                  }}
                  placeholder="RPE (0-10)"
                  className="mt-2 w-full bg-black/30 border border-yellow-500/30 rounded-lg px-3 py-2 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setClusterModal(null)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveClusterModal}
                disabled={!Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0}
                className={
                  !Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0
                    ? 'min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500/40 text-black/60 font-black text-xs uppercase tracking-widest inline-flex items-center gap-2 cursor-not-allowed'
                    : 'min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2'
                }
              >
                <Save size={16} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {restPauseModal && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setRestPauseModal(null)}
        >
          <div
            className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{String(restPauseModal?.label || '').trim() === 'SST' ? 'SST' : 'Rest-P'}</div>
                <div className="text-white font-black text-lg truncate">Preencher minis</div>
                <div className="text-xs text-neutral-400 truncate">
                  {Number(restPauseModal?.miniSets || 0)} minis • descanso {Number(restPauseModal?.pauseSec || 0)}s
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRestPauseModal(null)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {restPauseModal?.error ? (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                  {String(restPauseModal.error)}
                </div>
              ) : null}

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Configurar {String(restPauseModal?.label || 'Rest-P')}</div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.miniSets ?? '')}
                    onChange={(e) => {
                      const v = parseTrainingNumber(e?.target?.value);
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, miniSets: v ?? 0, error: '' } : prev));
                    }}
                    placeholder="Minis (ex.: 2)"
                    className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.pauseSec ?? '')}
                    onChange={(e) => {
                      const v = parseTrainingNumber(e?.target?.value);
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, pauseSec: v ?? 15, error: '' } : prev));
                    }}
                    placeholder="Descanso (s) (ex.: 15)"
                    className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.weight ?? '')}
                    onChange={(e) => {
                      const v = e?.target?.value ?? '';
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: v, error: '' } : prev));
                    }}
                    placeholder="kg"
                    className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
                <div className="mt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const minisCount = Math.max(0, Math.floor(parseTrainingNumber(restPauseModal?.miniSets) ?? 0));
                      if (!minisCount) {
                        setRestPauseModal((prev) =>
                          prev && typeof prev === 'object' ? { ...prev, error: 'Defina a quantidade de minis.' } : prev,
                        );
                        return;
                      }
                      setRestPauseModal((prev) => {
                        if (!prev || typeof prev !== 'object') return prev;
                        return { ...prev, miniSets: minisCount, minis: Array.from({ length: minisCount }).map((): number | null => null), error: '' };
                      });
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                  >
                    Gerar minis
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Ativação</div>
                  <div className="text-[10px] font-mono text-neutral-500">{Number(restPauseModal?.activationReps || 0)} reps</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.weight ?? '')}
                    onChange={(e) => {
                      const v = e?.target?.value ?? '';
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: v, error: '' } : prev));
                    }}
                    placeholder="kg"
                    className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.activationReps ?? '')}
                    onChange={(e) => {
                      const v = parseTrainingNumber(e?.target?.value);
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, activationReps: v ?? null, error: '' } : prev));
                    }}
                    placeholder="Reps ativação"
                    className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
              </div>

              {Array.isArray(restPauseModal?.minis) &&
                (((restPauseModal as UnknownRecord).minis as unknown[]) || []).map((mini, idx) => {
                  const modal = restPauseModal as UnknownRecord;
                  const minisArr = Array.isArray(modal.minis) ? (modal.minis as unknown[]) : [];
                  const isLast = idx >= minisArr.length - 1;
                  const restSec = Number(modal.pauseSec || 0);
                  const safeRestSec = Number.isFinite(restSec) && restSec > 0 ? restSec : 0;
                  return (
                    <div key={`mini-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Mini {idx + 1}</div>
                        {!isLast ? <div className="text-[10px] font-mono text-neutral-500">Descanso {safeRestSec}s</div> : <div />}
                      </div>
                      {!isLast && safeRestSec ? (
                        <button
                          type="button"
                          onClick={() => {
                            startTimer(safeRestSec, { kind: 'rest_pause', key: modal.key, miniIndex: idx });
                          }}
                          className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 active:scale-95 transition-transform z-10"
                          aria-label={`Iniciar descanso ${safeRestSec}s`}
                        >
                          <Clock size={14} className="text-yellow-500" />
                          <span className="text-xs font-black">{safeRestSec}s</span>
                        </button>
                      ) : null}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          inputMode="decimal"
                          value={String(restPauseModal?.weight ?? '')}
                          onChange={(e) => {
                            const v = e?.target?.value ?? '';
                            setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: v, error: '' } : prev));
                          }}
                          placeholder="kg"
                          className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                        <input
                          inputMode="decimal"
                          value={mini == null ? '' : String(mini)}
                          onChange={(e) => {
                            const n = parseTrainingNumber(e?.target?.value);
                            const next = n != null && n > 0 ? n : null;
                            setRestPauseModal((prev) => {
                              if (!prev || typeof prev !== 'object') return prev;
                              const list = Array.isArray(prev.minis) ? [...prev.minis] : [];
                              list[idx] = next;
                              return { ...prev, minis: list, error: '' };
                            });
                          }}
                          placeholder="reps"
                          className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                      </div>
                      {!isLast && safeRestSec ? <div className="mt-2 text-xs text-neutral-500">Descanso: {safeRestSec}s</div> : null}
                    </div>
                  );
                })}

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE da série</div>
                <input
                  inputMode="decimal"
                  value={String(restPauseModal?.rpe ?? '')}
                  onChange={(e) => {
                    const v = e?.target?.value ?? '';
                    setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, rpe: v, error: '' } : prev));
                  }}
                  placeholder="RPE (0-10)"
                  className="mt-2 w-full bg-black/30 border border-yellow-500/30 rounded-xl px-3 py-2 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setRestPauseModal(null)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveRestPauseModal}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
              >
                <Save size={16} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {dropSetModal && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setDropSetModal(null)}
        >
          {(() => {
            const modalKey = String((dropSetModal as UnknownRecord | null)?.key ?? '').trim();
            type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
            const suggestionValue = modalKey ? deloadSuggestions[modalKey] : null;
            const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue) ? (suggestionValue as DeloadEntrySuggestion) : null;
            const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';
            const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'kg';
            const repsPlaceholder = useWatermark && suggestion?.reps != null ? String(suggestion.reps) : 'reps';
            return (
              <div
                className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{String(dropSetModal?.label || 'Drop')}</div>
                    <div className="text-white font-black text-lg truncate">Preencher etapas</div>
                    <div className="text-xs text-neutral-400 truncate">{Array.isArray(dropSetModal?.stages) ? dropSetModal.stages.length : 0} etapas</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDropSetModal(null)}
                    className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                    aria-label="Fechar"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  {dropSetModal?.error ? (
                    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                      {String(dropSetModal.error)}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Etapas</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const pickWeight = () => {
                            const stages = Array.isArray(dropSetModal?.stages) ? dropSetModal.stages : [];
                            for (const st of stages) {
                              const w = String(st?.weight ?? '').trim();
                              if (w) return w;
                            }
                            return '';
                          };
                          const w = pickWeight();
                          if (!w) {
                            try {
                              window.alert('Preencha pelo menos 1 etapa com peso antes de linkar.');
                            } catch {}
                            return;
                          }
                          setDropSetModal((prev) => {
                            if (!prev || typeof prev !== 'object') return prev;
                            const stages = Array.isArray(prev.stages) ? prev.stages : [];
                            const nextStages = stages.map((st) => {
                              const cur = st && typeof st === 'object' ? st : {};
                              return { ...cur, weight: w };
                            });
                            return { ...prev, stages: nextStages, error: '' };
                          });
                        }}
                        className="min-h-[36px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 inline-flex items-center gap-2"
                      >
                        <Link2 size={14} />
                        Linkar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDropSetModal((prev) => {
                            if (!prev || typeof prev !== 'object') return prev;
                            const list = Array.isArray(prev.stages) ? [...prev.stages] : [];
                            if (list.length >= DROPSET_STAGE_LIMIT) return prev;
                            list.push({ weight: '', reps: null });
                            return { ...prev, stages: list, error: '' };
                          });
                        }}
                        className="min-h-[36px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 inline-flex items-center gap-2"
                      >
                        <Plus size={14} />
                        Adicionar
                      </button>
                    </div>
                  </div>

                  {Array.isArray(dropSetModal?.stages) &&
                    dropSetModal.stages.map((st, idx) => (
                      <div key={`ds-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Etapa {idx + 1}</div>
                          <button
                            type="button"
                            onClick={() => {
                              setDropSetModal((prev) => {
                                if (!prev || typeof prev !== 'object') return prev;
                                const list = Array.isArray(prev.stages) ? [...prev.stages] : [];
                                list.splice(idx, 1);
                                return { ...prev, stages: list, error: '' };
                              });
                            }}
                            className="h-9 w-9 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 inline-flex items-center justify-center"
                            aria-label="Remover etapa"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <input
                            inputMode="decimal"
                            value={String(st?.weight ?? '')}
                            onChange={(e) => {
                              const v = e?.target?.value ?? '';
                              setDropSetModal((prev) => {
                                if (!prev || typeof prev !== 'object') return prev;
                                const list = Array.isArray(prev.stages) ? [...prev.stages] : [];
                                const cur = list[idx] && typeof list[idx] === 'object' ? list[idx] : {};
                                list[idx] = { ...cur, weight: v };
                                return { ...prev, stages: list, error: '' };
                              });
                            }}
                            placeholder={weightPlaceholder}
                            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                          />
                          <input
                            inputMode="decimal"
                            value={st?.reps == null ? '' : String(st.reps)}
                            onChange={(e) => {
                              const n = parseTrainingNumber(e?.target?.value);
                              const next = n != null && n > 0 ? n : null;
                              setDropSetModal((prev) => {
                                if (!prev || typeof prev !== 'object') return prev;
                                const list = Array.isArray(prev.stages) ? [...prev.stages] : [];
                                const cur = list[idx] && typeof list[idx] === 'object' ? list[idx] : {};
                                list[idx] = { ...cur, reps: next };
                                return { ...prev, stages: list, error: '' };
                              });
                            }}
                            placeholder={repsPlaceholder}
                            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                          />
                        </div>
                      </div>
                    ))}
                </div>

                <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDropSetModal(null)}
                    className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={saveDropSetModal}
                    className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
                  >
                    <Save size={16} />
                    Salvar
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {addExerciseOpen && (
        <div
          className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setAddExerciseOpen(false)}
        >
          <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Adicionar</div>
                <div className="text-white font-black text-lg truncate">Novo exercício</div>
              </div>
              <button
                type="button"
                onClick={() => setAddExerciseOpen(false)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Nome</div>
                <input
                  value={addExerciseDraft.name}
                  onChange={(e) => setAddExerciseDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Agachamento Livre"
                  className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Séries</div>
                  <input
                    inputMode="decimal"
                    value={addExerciseDraft.sets}
                    onChange={(e) => setAddExerciseDraft((prev) => ({ ...prev, sets: e.target.value }))}
                    placeholder="3"
                    className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Descanso (s)</div>
                  <input
                    inputMode="decimal"
                    value={addExerciseDraft.restTime}
                    onChange={(e) => setAddExerciseDraft((prev) => ({ ...prev, restTime: e.target.value }))}
                    placeholder="60"
                    className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddExerciseOpen(false)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={addExtraExerciseToWorkout}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {organizeOpen && (
        <div
          className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={requestCloseOrganize}
        >
          <div className="bg-neutral-900 w-full max-w-lg rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Organizar</div>
                <div className="text-white font-black text-lg truncate">Reordenar exercícios</div>
              </div>
              <button
                type="button"
                onClick={requestCloseOrganize}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
              {organizeError ? (
                <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {organizeError}
                </div>
              ) : null}
              
              <Reorder.Group axis="y" values={organizeDraft} onReorder={setOrganizeDraft} className="space-y-2">
                {organizeDraft.map((item, index) => (
                  <ExerciseSortRow
                    key={String(item.id || item.workout_exercise_id || index)}
                    item={item}
                    index={index}
                    total={organizeDraft.length}
                    onMoveUp={() => {
                        if (index > 0) {
                            const next = [...organizeDraft];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            setOrganizeDraft(next);
                        }
                    }}
                    onMoveDown={() => {
                        if (index < organizeDraft.length - 1) {
                            const next = [...organizeDraft];
                            [next[index + 1], next[index]] = [next[index], next[index + 1]];
                            setOrganizeDraft(next);
                        }
                    }}
                  />
                ))}
              </Reorder.Group>
            </div>

            <div className="p-4 border-t border-neutral-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={requestCloseOrganize}
                disabled={organizeSaving}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveOrganize}
                disabled={organizeSaving}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {organizeSaving ? <Clock size={16} className="animate-spin" /> : <Save size={16} />}
                {organizeSaving ? 'Salvando...' : 'Salvar Ordem'}
              </button>
            </div>
          </div>
        </div>
      )}

      {postCheckinOpen && (
        <div
          className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => {
            setPostCheckinOpen(false);
            const r = postCheckinResolveRef.current;
            postCheckinResolveRef.current = null;
            if (typeof r === 'function') r(null);
          }}
        >
          <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Check-in</div>
                <div className="text-white font-black text-lg truncate">Pós-treino</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r(null);
                }}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Esforço (RPE 1–10)</div>
                <select
                  value={String(postCheckinDraft?.rpe ?? '')}
                  onChange={(e) => setPostCheckinDraft((prev) => ({ ...prev, rpe: String(e.target.value || '') }))}
                  className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="">Não informar</option>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Satisfação (1–5)</div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPostCheckinDraft((prev) => ({ ...prev, satisfaction: String(n) }))}
                      className={
                        String(postCheckinDraft?.satisfaction || '') === String(n)
                          ? 'min-h-[44px] rounded-xl bg-yellow-500 text-black font-black'
                          : 'min-h-[44px] rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800'
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Dor / Soreness (0–10)</div>
                <select
                  value={String(postCheckinDraft?.soreness ?? '')}
                  onChange={(e) => setPostCheckinDraft((prev) => ({ ...prev, soreness: String(e.target.value || '') }))}
                  className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="">Não informar</option>
                  <option value="0">0 - Sem dor</option>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Observações (opcional)</div>
                <textarea
                  value={String(postCheckinDraft?.notes ?? '')}
                  onChange={(e) => setPostCheckinDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Como você se sentiu?"
                  className="w-full min-h-[80px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white resize-none outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r(null);
                }}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Pular
              </button>
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r({ ...postCheckinDraft });
                }}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {editExerciseOpen && (
        <div
          className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setEditExerciseOpen(false)}
        >
          <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Editar</div>
                <div className="text-white font-black text-lg truncate">Exercício</div>
              </div>
              <button
                type="button"
                onClick={() => setEditExerciseOpen(false)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Nome</div>
                <input
                  value={editExerciseDraft.name}
                  onChange={(e) => setEditExerciseDraft((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Séries</div>
                  <input
                    inputMode="decimal"
                    value={editExerciseDraft.sets}
                    onChange={(e) => setEditExerciseDraft((prev) => ({ ...prev, sets: e.target.value }))}
                    className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Descanso (s)</div>
                  <input
                    inputMode="decimal"
                    value={editExerciseDraft.restTime}
                    onChange={(e) => setEditExerciseDraft((prev) => ({ ...prev, restTime: e.target.value }))}
                    className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Método</div>
                <select
                  value={editExerciseDraft.method}
                  onChange={(e) => setEditExerciseDraft((prev) => ({ ...prev, method: e.target.value }))}
                  className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="Normal">Normal</option>
                  <option value="Drop-set">Drop-set</option>
                  <option value="Rest-Pause">Rest-Pause</option>
                  <option value="SST">SST</option>
                  <option value="Cluster">Cluster</option>
                  <option value="Bi-Set">Bi-Set</option>
                  <option value="FST-7">FST-7</option>
                  <option value="GVT">GVT</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditExerciseOpen(false)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEditExercise}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
              >
                <Save size={16} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {deloadModal && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setDeloadModal(null)}
        >
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-2">Deload Sugerido</div>
            <h3 className="text-xl font-black text-white mb-1">{String(deloadModal.name)}</h3>
            <p className="text-sm text-neutral-400 mb-4">{String(deloadModal.reason)}</p>
            
            <div className="bg-neutral-800/50 rounded-xl p-4 mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Carga Base</span>
                    <span className="text-white font-mono">{Number(deloadModal.baseWeight || 0)} kg</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Redução</span>
                    <span className="text-red-400 font-mono">-{Math.round(Number(deloadModal.reductionPct || 0) * 100)}%</span>
                </div>
                <div className="border-t border-neutral-700 pt-2 flex justify-between text-base font-bold">
                    <span className="text-yellow-500">Sugerido</span>
                    <span className="text-white font-mono">{Number(deloadModal.suggestedWeight || 0)} kg</span>
                </div>
            </div>

            <button
              onClick={() => setDeloadModal(null)}
              className="w-full py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};
