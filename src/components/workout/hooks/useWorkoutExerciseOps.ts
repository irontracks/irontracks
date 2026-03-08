import { useCallback } from 'react';
import { useDialog } from '@/contexts/DialogContext';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { applyExerciseOrder, buildExerciseDraft, draftOrderKeys } from '@/lib/workoutReorder';
import {
    isObject,
} from '../utils';
import type {
    WorkoutExercise,
    UnknownRecord,
    WorkoutSetDetail,
} from '../types';

const MAX_EXTRA_SETS_PER_EXERCISE = 50;
const MAX_EXTRA_EXERCISES_PER_WORKOUT = 50;
const DEFAULT_EXTRA_EXERCISE_REST_TIME_S = 60;

interface UseWorkoutExerciseOpsProps {
    workout: UnknownRecord | null;
    exercises: WorkoutExercise[];
    logs: Record<string, unknown>;
    onUpdateSession?: (patch: Record<string, unknown>) => void;
    // Modal states from useWorkoutModals
    addExerciseDraft: Record<string, unknown> | null;
    setAddExerciseOpen: (v: boolean) => void;
    setAddExerciseDraft: (v: Record<string, unknown>) => void;
    editExerciseIdx: number | null;
    editExerciseDraft: Record<string, unknown> | null;
    setEditExerciseOpen: (v: boolean) => void;
    setEditExerciseIdx: (v: number | null) => void;
    setEditExerciseDraft: (v: Record<string, unknown>) => void;
    setCollapsed: React.Dispatch<React.SetStateAction<Set<number>>>;
    setOrganizeDraft: (v: UnknownRecord[]) => void;
    setOrganizeOpen: (v: boolean) => void;
    setOrganizeError: (v: string) => void;
    setOrganizeSaving: (v: boolean) => void;
    organizeDraft: UnknownRecord[];
    organizeSaving: boolean;
    organizeDirty: boolean;
    organizeBaseKeysRef: React.MutableRefObject<string[]>;
}

/**
 * Hook: Exercise lifecycle operations — add/remove sets, edit exercises, add extra exercises, organize.
 * Extracted from useActiveWorkoutController to reduce its size.
 */
export const useWorkoutExerciseOps = (props: UseWorkoutExerciseOpsProps) => {
    const { alert, confirm } = useDialog();
    const {
        workout, exercises, logs, onUpdateSession,
        addExerciseDraft, setAddExerciseOpen, setAddExerciseDraft,
        editExerciseIdx, editExerciseDraft, setEditExerciseOpen, setEditExerciseIdx, setEditExerciseDraft,
        setCollapsed,
        setOrganizeDraft, setOrganizeOpen, setOrganizeError, setOrganizeSaving,
        organizeDraft, organizeSaving, organizeDirty, organizeBaseKeysRef,
    } = props;

    const addExtraSetToExercise = useCallback(async (exIdx: unknown) => {
        if (!workout || typeof onUpdateSession !== 'function') return;
        const idx = Number(exIdx);
        if (!Number.isFinite(idx) || idx < 0 || idx >= exercises.length) return;
        try {
            const nextExercises = [...exercises];
            const exRaw = nextExercises[idx] && typeof nextExercises[idx] === 'object' ? nextExercises[idx] : {} as WorkoutExercise;
            const setsHeader = Math.max(0, Number.parseInt(String(exRaw?.sets ?? '0'), 10) || 0);
            const sdArrRaw = Array.isArray(exRaw?.setDetails) ? exRaw.setDetails : Array.isArray(exRaw?.set_details) ? exRaw.set_details : [];
            const sdArr = Array.isArray(sdArrRaw) ? [...sdArrRaw] : [];
            const setsCount = Math.max(setsHeader, sdArr.length);
            if (setsCount >= MAX_EXTRA_SETS_PER_EXERCISE) return;

            const last = sdArr.length > 0 ? sdArr[sdArr.length - 1] : null;
            const base = last && typeof last === 'object' ? last : {};
            sdArr.push({ ...base, set_number: setsCount + 1, weight: null, reps: '', rpe: null, notes: null, is_warmup: false });
            nextExercises[idx] = { ...exRaw, sets: setsCount + 1, setDetails: sdArr };
            onUpdateSession({ workout: { ...workout, exercises: nextExercises } });
            setCollapsed(prev => { const next = new Set(prev); next.delete(idx); return next; });
        } catch (e: unknown) {
            try { const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || ''); await alert('Não foi possível adicionar série extra: ' + msg); } catch { }
        }
    }, [workout, exercises, onUpdateSession, alert, setCollapsed]);

    const removeExtraSetFromExercise = useCallback(async (exIdx: unknown) => {
        if (!workout || typeof onUpdateSession !== 'function') return;
        const idx = Number(exIdx);
        if (!Number.isFinite(idx) || idx < 0 || idx >= exercises.length) return;
        try {
            const nextExercises = [...exercises];
            const exRaw = nextExercises[idx] && typeof nextExercises[idx] === 'object' ? nextExercises[idx] : {} as WorkoutExercise;
            const setsHeader = Math.max(0, Number.parseInt(String(exRaw?.sets ?? '0'), 10) || 0);
            const sdArrRaw = Array.isArray(exRaw?.setDetails) ? exRaw.setDetails : Array.isArray(exRaw?.set_details) ? exRaw.set_details : [];
            const sdArr = Array.isArray(sdArrRaw) ? [...sdArrRaw] : [];
            const setsCount = Math.max(setsHeader, sdArr.length);
            if (setsCount <= 1) return;

            sdArr.pop();
            nextExercises[idx] = { ...exRaw, sets: setsCount - 1, setDetails: sdArr };
            const nextLogs: Record<string, unknown> = { ...(logs && typeof logs === 'object' ? logs : {}) };
            try { delete nextLogs[`${idx}-${setsCount - 1}`]; } catch { }
            onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });
        } catch (e: unknown) {
            try { const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || ''); await alert('Não foi possível remover a série: ' + msg); } catch { }
        }
    }, [workout, exercises, logs, onUpdateSession, alert]);

    const openEditExercise = useCallback(async (exIdx: unknown) => {
        if (!workout) return;
        const idx = Number(exIdx);
        if (!Number.isFinite(idx) || idx < 0 || idx >= exercises.length) return;
        try {
            const ex = exercises[idx] && typeof exercises[idx] === 'object' ? exercises[idx] : {} as WorkoutExercise;
            const name = String(ex?.name || '').trim() || `Exercício ${idx + 1}`;
            const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
            const sdArrRaw: unknown[] = Array.isArray(ex?.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex?.set_details) ? (ex.set_details as unknown[]) : [];
            const setsCount = Math.max(setsHeader, Array.isArray(sdArrRaw) ? sdArrRaw.length : 0) || 1;
            const restTimeNum = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
            const restTime = typeof restTimeNum === 'number' && Number.isFinite(restTimeNum) && restTimeNum > 0 ? restTimeNum : DEFAULT_EXTRA_EXERCISE_REST_TIME_S;
            const method = String(ex?.method || 'Normal').trim() || 'Normal';
            setEditExerciseDraft({ name, sets: String(setsCount), restTime: String(restTime), method });
            setEditExerciseIdx(idx);
            setEditExerciseOpen(true);
        } catch (e: unknown) {
            try { const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || ''); await alert('Não foi possível abrir a edição do exercício: ' + msg); } catch { }
        }
    }, [workout, exercises, alert, setEditExerciseDraft, setEditExerciseIdx, setEditExerciseOpen]);

    const saveEditExercise = useCallback(async () => {
        if (!workout || typeof onUpdateSession !== 'function') return;
        const idx = typeof editExerciseIdx === 'number' ? editExerciseIdx : -1;
        if (idx < 0 || idx >= exercises.length) return;
        const name = String(editExerciseDraft?.name || '').trim();
        if (!name) { try { await alert('Informe o nome do exercício.', 'Editar exercício'); } catch { } return; }
        const desiredSets = Math.max(1, Math.min(MAX_EXTRA_SETS_PER_EXERCISE, Number.parseInt(String(editExerciseDraft?.sets || '1'), 10) || 1));
        const restParsed = parseTrainingNumber(editExerciseDraft?.restTime);
        const restTime = typeof restParsed === 'number' && Number.isFinite(restParsed) && restParsed > 0 ? restParsed : null;
        const method = String(editExerciseDraft?.method || 'Normal').trim() || 'Normal';

        try {
            const nextExercises = [...exercises];
            const exRaw = nextExercises[idx] && typeof nextExercises[idx] === 'object' ? nextExercises[idx] : {} as WorkoutExercise;
            const setsHeader = Math.max(0, Number.parseInt(String(exRaw?.sets ?? '0'), 10) || 0);
            const sdArrRaw: unknown[] = Array.isArray(exRaw?.setDetails) ? (exRaw.setDetails as unknown[]) : Array.isArray(exRaw?.set_details) ? (exRaw.set_details as unknown[]) : [];
            const sdArr = Array.isArray(sdArrRaw) ? [...sdArrRaw] : [];
            const previousSetsCount = Math.max(setsHeader, sdArr.length);

            const nextSetDetails: WorkoutSetDetail[] = [];
            for (let i = 0; i < desiredSets; i++) {
                const current = sdArr[i];
                const currentObj = current && typeof current === 'object' ? (current as UnknownRecord) : null;
                const setNumber = i + 1;
                if (currentObj) {
                    nextSetDetails.push({ ...currentObj, set_number: Number(currentObj.set_number ?? currentObj.setNumber ?? setNumber) || setNumber });
                } else {
                    nextSetDetails.push({ set_number: setNumber, weight: null, reps: '', rpe: null, notes: null, is_warmup: false, advanced_config: null });
                }
            }

            nextExercises[idx] = { ...exRaw, name, method, sets: desiredSets, restTime, setDetails: nextSetDetails };
            const nextLogs: Record<string, unknown> = { ...(logs && typeof logs === 'object' ? logs : {}) };
            if (previousSetsCount > desiredSets) {
                for (let i = desiredSets; i < previousSetsCount; i++) { try { delete nextLogs[`${idx}-${i}`]; } catch { } }
            }
            onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });
            setEditExerciseOpen(false);
            setEditExerciseIdx(null);
        } catch (e: unknown) {
            try { const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || ''); await alert('Não foi possível salvar a edição do exercício: ' + msg); } catch { }
        }
    }, [workout, exercises, logs, editExerciseIdx, editExerciseDraft, onUpdateSession, alert, setEditExerciseOpen, setEditExerciseIdx]);

    const addExtraExerciseToWorkout = useCallback(async () => {
        if (!workout || typeof onUpdateSession !== 'function') return;
        if (exercises.length >= MAX_EXTRA_EXERCISES_PER_WORKOUT) return;
        const name = String(addExerciseDraft?.name || '').trim();
        if (!name) { try { await alert('Informe o nome do exercício.', 'Exercício extra'); } catch { } return; }
        const sets = Math.max(1, Number.parseInt(String(addExerciseDraft?.sets || '3'), 10) || 1);
        const rest = parseTrainingNumber(addExerciseDraft?.restTime);
        const restTime = typeof rest === 'number' && Number.isFinite(rest) && rest > 0 ? rest : null;
        try {
            onUpdateSession({ workout: { ...workout, exercises: [...exercises, { name, sets, restTime, method: 'Normal', setDetails: [] }] } });
            setAddExerciseOpen(false);
            setAddExerciseDraft({ name: '', sets: String(sets), restTime: String(restTime ?? DEFAULT_EXTRA_EXERCISE_REST_TIME_S) });
        } catch (e: unknown) {
            try { const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || ''); await alert('Não foi possível adicionar exercício extra: ' + msg); } catch { }
        }
    }, [workout, exercises, addExerciseDraft, onUpdateSession, alert, setAddExerciseOpen, setAddExerciseDraft]);

    const openOrganizeModal = useCallback(() => {
        const draft = buildExerciseDraft(exercises);
        const safeDraft: UnknownRecord[] = Array.isArray(draft) ? (draft as UnknownRecord[]) : [];
        setOrganizeDraft(safeDraft);
        organizeBaseKeysRef.current = draftOrderKeys(safeDraft);
        setOrganizeError('');
        setOrganizeOpen(true);
    }, [exercises, setOrganizeDraft, organizeBaseKeysRef, setOrganizeError, setOrganizeOpen]);

    const requestCloseOrganize = useCallback(async () => {
        if (organizeSaving) return;
        if (organizeDirty) {
            let ok = false;
            try { ok = typeof confirm === 'function' ? await confirm('Existem mudanças não salvas. Deseja sair?', 'Sair sem salvar?', { confirmText: 'Sair', cancelText: 'Continuar' }) : false; } catch { ok = false; }
            if (!ok) return;
        }
        setOrganizeOpen(false);
    }, [organizeSaving, organizeDirty, confirm, setOrganizeOpen]);

    const saveOrganize = useCallback(async () => {
        if (!workout || organizeSaving) return;
        const workoutId = String((workout as UnknownRecord)?.id ?? (workout as UnknownRecord)?.workout_id ?? '').trim();
        if (!workoutId) { setOrganizeError('Não foi possível salvar: treino sem ID.'); return; }
        setOrganizeSaving(true);
        setOrganizeError('');
        try {
            const orderedExercises = applyExerciseOrder(exercises, organizeDraft);
            const payload = { ...workout, exercises: orderedExercises };
            const response = await fetch('/api/workouts/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: workoutId, workout: payload }),
            }).catch((): null => null);
            const result = response ? await response.json().catch((): null => null) : null;
            if (!response || !response.ok || !result?.ok) {
                setOrganizeError(String(result?.error || 'Falha ao salvar a ordem.'));
                setOrganizeSaving(false);
                return;
            }
            if (typeof onUpdateSession === 'function') {
                onUpdateSession({ workout: { ...workout, exercises: orderedExercises } });
            }
            organizeBaseKeysRef.current = draftOrderKeys(organizeDraft);
            setOrganizeOpen(false);
            try { await alert('Ordem dos exercícios salva com sucesso.'); } catch { }
        } catch (e: unknown) {
            const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || 'Falha ao salvar a ordem.');
            setOrganizeError(msg);
        } finally {
            setOrganizeSaving(false);
        }
    }, [workout, exercises, organizeDraft, organizeSaving, onUpdateSession, alert, setOrganizeError, setOrganizeSaving, setOrganizeOpen, organizeBaseKeysRef]);

    return {
        addExtraSetToExercise,
        removeExtraSetFromExercise,
        openEditExercise,
        saveEditExercise,
        addExtraExerciseToWorkout,
        openOrganizeModal,
        requestCloseOrganize,
        saveOrganize,
    };
};
