'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Check, Clock, GripVertical, Loader2, Save, X } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { moveDraftItem, draftOrderKeys } from '@/lib/workoutReorder';
import { useWorkoutContext } from './WorkoutContext';
import {
  buildPlannedBlocks,
  buildBlocksByCount,
  isObject,
  toNumber,
  clampNumber,
  roundToStep,
  DELOAD_REDUCTION_MIN,
  DELOAD_REDUCTION_MAX,
  WEIGHT_ROUND_STEP,
  DELOAD_SUGGEST_MODE,
} from './utils';
import { UnknownRecord } from './types';

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

export default function Modals() {
  const {
    workout,
    postCheckinOpen,
    setPostCheckinOpen,
    postCheckinDraft,
    setPostCheckinDraft,
    postCheckinResolveRef,
    deloadModal,
    setDeloadModal,
    reportHistoryStatus,
    reportHistoryUpdatedAt,
    updateDeloadModalFromPercent,
    updateDeloadModalFromWeight,
    applyDeloadToExercise,
    addExerciseOpen,
    setAddExerciseOpen,
    addExerciseDraft,
    setAddExerciseDraft,
    addExtraExerciseToWorkout,
    editExerciseOpen,
    setEditExerciseOpen,
    editExerciseIdx,
    setEditExerciseIdx,
    editExerciseDraft,
    setEditExerciseDraft,
    saveEditExercise,
    organizeOpen,
    requestCloseOrganize,
    organizeDraft,
    setOrganizeDraft,
    organizeError,
    organizeSaving,
    organizeDirty,
    saveOrganize,
    clusterModal,
    setClusterModal,
    startTimer,
    clusterRefs,
    saveClusterModal,
    restPauseModal,
    setRestPauseModal,
    saveRestPauseModal,
    dropSetModal,
    setDropSetModal,
    saveDropSetModal,
    deloadSuggestions,
  } = useWorkoutContext();

  return (
    <>
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
                <div className="text-xs text-neutral-400 truncate">{String(workout?.title || 'Treino')}</div>
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
                  {Array.from({ length: 11 }).map((_, i) => (
                    <option key={i} value={String(i)}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Observações (opcional)</div>
                <textarea
                  value={String(postCheckinDraft?.notes || '')}
                  onChange={(e) => setPostCheckinDraft((prev) => ({ ...prev, notes: String(e.target.value || '') }))}
                  className="w-full min-h-[90px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  placeholder="Ex.: treino pesado, boa técnica, ajustar carga na próxima…"
                />
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r(null);
                }}
                className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
              >
                Pular
              </button>
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r(postCheckinDraft);
                }}
                className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {deloadModal && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setDeloadModal(null)}
        >
          {(() => {
            const baseWeight = Number(deloadModal?.baseWeight || 0);
            const suggestedWeight = Number(deloadModal?.suggestedWeight || 0);
            const reductionPct = Math.round((Number(deloadModal?.reductionPct || 0) * 1000) / 10) / 10;
            const minWeight = Number(deloadModal?.minWeight || 0);
            const canApply = Number.isFinite(baseWeight) && baseWeight > 0 && Number.isFinite(suggestedWeight) && suggestedWeight > 0;
            const reportStatus = String(reportHistoryStatus?.status || 'idle');
            const reportSource = String(reportHistoryStatus?.source || '');
            const reportUpdatedLabel = reportHistoryUpdatedAt
              ? new Date(reportHistoryUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '';
            const reportLabel =
              reportStatus === 'loading'
                ? 'Carregando relatórios…'
                : reportStatus === 'error'
                  ? 'Relatórios indisponíveis. Usando dados locais.'
                  : reportSource === 'cache'
                    ? 'Relatórios carregados do cache.'
                    : reportSource === 'cache-stale'
                      ? 'Relatórios do cache (atualizando).'
                      : reportSource === 'network'
                        ? 'Relatórios atualizados.'
                        : 'Relatórios prontos.';
            return (
              <div
                className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-widest text-yellow-500 font-black">Deload</div>
                    <div className="text-lg font-black text-white truncate">{String(deloadModal?.name || 'Exercício')}</div>
                    <div className="text-xs text-neutral-400 truncate">{String(deloadModal?.reason || '')}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeloadModal(null)}
                    className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
                    aria-label="Fechar"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  <div className="rounded-xl bg-neutral-950/40 border border-neutral-800 p-3 text-xs text-neutral-400 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{reportLabel}</span>
                    {reportUpdatedLabel ? <span className="font-mono text-yellow-500">{reportUpdatedLabel}</span> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-neutral-950/40 border border-neutral-800 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Peso base</div>
                      <div className="mt-2 text-xl font-black text-white">{baseWeight ? `${baseWeight} kg` : '-'}</div>
                    </div>
                    <div className="rounded-xl bg-neutral-950/40 border border-yellow-500/30 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-yellow-500 font-black">Peso sugerido</div>
                      <div className="mt-2 text-xl font-black text-yellow-500">{suggestedWeight ? `${suggestedWeight} kg` : '-'}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Redução (%)</label>
                      <input
                        inputMode="decimal"
                        value={Number.isFinite(reductionPct) ? String(reductionPct) : ''}
                        onChange={(e) => updateDeloadModalFromPercent(e?.target?.value ?? '')}
                        className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        placeholder="12"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Peso sugerido (kg)</label>
                      <input
                        inputMode="decimal"
                        value={Number.isFinite(suggestedWeight) ? String(suggestedWeight) : ''}
                        onChange={(e) => updateDeloadModalFromWeight(e?.target?.value ?? '')}
                        className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        placeholder="100"
                      />
                    </div>
                  </div>
                  <div className="rounded-xl bg-neutral-950/40 border border-neutral-800 p-3 text-xs text-neutral-400">
                    <div className="flex items-center justify-between gap-2">
                      <span>Histórico analisado</span>
                      <span className="font-mono text-yellow-500">{Number(deloadModal?.historyCount || 0)} treinos</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span>Peso mínimo seguro</span>
                      <span className="font-mono text-yellow-500">{minWeight ? `${Math.round(minWeight * 10) / 10} kg` : '-'}</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-neutral-800 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeloadModal(null)}
                    className="flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={applyDeloadToExercise}
                    disabled={!canApply}
                    className={
                      canApply
                        ? 'flex-1 min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 inline-flex items-center justify-center gap-2'
                        : 'flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-500 font-black'
                    }
                  >
                    <Check size={16} />
                    Aplicar agora
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {addExerciseOpen && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAddExerciseOpen(false)}>
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold">Treino ativo</div>
                <div className="text-lg font-black text-white truncate">Adicionar exercício extra</div>
              </div>
              <button
                type="button"
                onClick={() => setAddExerciseOpen(false)}
                className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Nome do exercício</label>
                <input
                  value={String(addExerciseDraft?.name ?? '')}
                  onChange={(e) => setAddExerciseDraft((prev) => ({ ...prev, name: e?.target?.value ?? '' }))}
                  className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                  placeholder="Ex: Supino reto"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Sets</label>
                  <input
                    inputMode="decimal"
                    value={String(addExerciseDraft?.sets ?? '')}
                    onChange={(e) => setAddExerciseDraft((prev) => ({ ...prev, sets: e?.target?.value ?? '' }))}
                    className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                    placeholder="3"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Descanso (s)</label>
                  <input
                    inputMode="decimal"
                    value={String(addExerciseDraft?.restTime ?? '')}
                    onChange={(e) => setAddExerciseDraft((prev) => ({ ...prev, restTime: e?.target?.value ?? '' }))}
                    className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                    placeholder="60"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800 flex gap-2">
              <button
                type="button"
                onClick={() => setAddExerciseOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={addExtraExerciseToWorkout}
                className="flex-1 min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {editExerciseOpen && editExerciseIdx != null && (
        <div className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setEditExerciseOpen(false); setEditExerciseIdx(null); }}>
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold">Treino ativo</div>
                <div className="text-lg font-black text-white truncate">Editar exercício</div>
              </div>
              <button
                type="button"
                onClick={() => { setEditExerciseOpen(false); setEditExerciseIdx(null); }}
                className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Nome do exercício</label>
                <input
                  value={String(editExerciseDraft?.name ?? '')}
                  onChange={(e) => setEditExerciseDraft((prev) => ({ ...prev, name: e?.target?.value ?? '' }))}
                  className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                  placeholder="Ex: Supino reto"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Sets</label>
                  <input
                    inputMode="decimal"
                    value={String(editExerciseDraft?.sets ?? '')}
                    onChange={(e) => setEditExerciseDraft((prev) => ({ ...prev, sets: e?.target?.value ?? '' }))}
                    className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                    placeholder="3"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Descanso (s)</label>
                  <input
                    inputMode="decimal"
                    value={String(editExerciseDraft?.restTime ?? '')}
                    onChange={(e) => setEditExerciseDraft((prev) => ({ ...prev, restTime: e?.target?.value ?? '' }))}
                    className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                    placeholder="60"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Método</label>
                <select
                  value={String(editExerciseDraft?.method ?? 'Normal')}
                  onChange={(e) => setEditExerciseDraft((prev) => ({ ...prev, method: String(e.target.value || 'Normal') }))}
                  className="mt-2 w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="Normal">Normal</option>
                  <option value="Drop-set">Drop-set</option>
                  <option value="Rest-Pause">Rest-Pause</option>
                  <option value="Cluster">Cluster</option>
                  <option value="Bi-Set">Bi-Set</option>
                  <option value="Cardio">Cardio</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800 flex gap-2">
              <button
                type="button"
                onClick={() => { setEditExerciseOpen(false); setEditExerciseIdx(null); }}
                className="flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEditExercise}
                className="flex-1 min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 inline-flex items-center justify-center gap-2"
              >
                <Save size={16} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {organizeOpen && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={requestCloseOrganize}>
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold">Treino ativo</div>
                <div className="text-lg font-black text-white truncate">Organizar exercícios</div>
                <div className="text-xs text-neutral-500">Arraste ou use as setas para reordenar.</div>
              </div>
              <button
                type="button"
                onClick={requestCloseOrganize}
                className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {organizeDraft.length === 0 ? (
                <div className="rounded-xl bg-neutral-800 border border-neutral-700 p-4 text-sm text-neutral-400">Sem exercícios para organizar.</div>
              ) : (
                <Reorder.Group axis="y" values={organizeDraft} onReorder={setOrganizeDraft} className="space-y-2">
                  {organizeDraft.map((item, index) => (
                    <ExerciseSortRow
                      key={String(item?.key ?? `item-${index}`)}
                      item={item}
                      index={index}
                      total={organizeDraft.length}
                      onMoveUp={() => setOrganizeDraft((prev) => moveDraftItem(prev, index, index - 1))}
                      onMoveDown={() => setOrganizeDraft((prev) => moveDraftItem(prev, index, index + 1))}
                    />
                  ))}
                </Reorder.Group>
              )}
              {organizeError ? <div className="text-sm text-red-400">{organizeError}</div> : null}
            </div>
            <div className="p-4 border-t border-neutral-800 flex gap-2">
              <button
                type="button"
                onClick={requestCloseOrganize}
                className="flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveOrganize}
                disabled={organizeSaving || !organizeDirty}
                className={
                  organizeSaving
                    ? 'flex-1 min-h-[44px] rounded-xl bg-yellow-500/70 text-black font-black inline-flex items-center justify-center gap-2 cursor-wait'
                    : !organizeDirty
                      ? 'flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-500 font-bold'
                      : 'flex-1 min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 inline-flex items-center justify-center gap-2'
                }
              >
                {organizeSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>Salvar ordem</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                          ref={(el) => {
                            if (!clusterRefs.current) clusterRefs.current = {};
                            const key = String(modal.key || '');
                            if (!clusterRefs.current[key]) clusterRefs.current[key] = [];
                            clusterRefs.current[key][idx] = el;
                          }}
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
                            const nextStages = stages.map((s) => (s && typeof s === 'object' ? { ...s, weight: w } : { weight: w, reps: null }));
                            return { ...prev, stages: nextStages, error: '' };
                          });
                        }}
                        className="text-[10px] text-yellow-500 underline"
                      >
                        Linkar peso
                      </button>
                    </div>
                  </div>

                  {Array.isArray(dropSetModal?.stages) &&
                    ((dropSetModal as UnknownRecord).stages as unknown[]).map((stage, idx) => {
                      const st = isObject(stage) ? (stage as UnknownRecord) : ({} as UnknownRecord);
                      const w = String(st.weight ?? '');
                      const r = st.reps == null ? '' : String(st.reps);
                      return (
                        <div key={`stage-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                          <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-2">Etapa {idx + 1}</div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              inputMode="decimal"
                              value={w}
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
                              value={r}
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
                      );
                    })}
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
    </>
  );
}
