import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { draftOrderKeys } from '@/lib/workoutReorder';
import type { UnknownRecord } from '../types';

type PostCheckinDraft = { rpe: string; satisfaction: string; soreness: string; notes: string };
type InputRefMap = Record<string, Array<HTMLInputElement | null>>;

/**
 * useWorkoutModals
 *
 * Manages all modal and panel UI state for the active workout screen:
 * - 13 advanced set-method modals (cluster, rest-pause, drop set, etc.)
 * - Collapsed card state (persisted to localStorage)
 * - Add/edit exercise drawers
 * - Organize panel
 * - Post-checkin form
 * - Invite, notes, linked weights
 */
/** Lê um Set<number> persistido em localStorage; devolve vazio em qualquer falha. */
function readIndexSet(key: string | null): Set<number> {
    if (!key) return new Set<number>();
    try {
        if (typeof window === 'undefined') return new Set<number>();
        const raw = window.localStorage.getItem(key);
        if (!raw) return new Set<number>();
        const arr: unknown = JSON.parse(raw);
        return new Set<number>(Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number') : []);
    } catch {
        return new Set<number>();
    }
}

export function useWorkoutModals(collapsedKey: string | null, deferredKey: string | null = null) {
    // ---- Collapsed cards (persisted) ----
    const [collapsed, setCollapsed] = useState<Set<number>>(() => readIndexSet(collapsedKey));

    useEffect(() => {
        if (!collapsedKey) return;
        try {
            if (typeof window === 'undefined') return;
            window.localStorage.setItem(collapsedKey, JSON.stringify([...collapsed]));
        } catch { }
    }, [collapsed, collapsedKey]);

    // ---- "Fazer depois" (persisted) ----
    // Mesmo armazenamento do `collapsed`: é estado de EXECUÇÃO desta sessão, não
    // do plano de treino. Sobrevive a fechar e reabrir o app (o caso real: adiar
    // um exercício, guardar o celular, voltar dez minutos depois); perder a marca
    // só devolve o card ao estado normal — nenhum log é afetado.
    const [deferredExercises, setDeferredExercises] = useState<Set<number>>(() => readIndexSet(deferredKey));

    useEffect(() => {
        if (!deferredKey) return;
        try {
            if (typeof window === 'undefined') return;
            window.localStorage.setItem(deferredKey, JSON.stringify([...deferredExercises]));
        } catch { }
    }, [deferredExercises, deferredKey]);

    // ---- Notes & UI ----
    const [openNotesKeys, setOpenNotesKeys] = useState<Set<string>>(() => new Set<string>());
    const [inviteOpen, setInviteOpen] = useState<boolean>(false);
    const [linkedWeightExercises, setLinkedWeightExercises] = useState<Set<number>>(new Set());
    const [currentExerciseIdx, setCurrentExerciseIdx] = useState<number>(0);
    const [finishing, setFinishing] = useState<boolean>(false);

    // ---- Add exercise ----
    const [addExerciseOpen, setAddExerciseOpen] = useState<boolean>(false);
    const [addExerciseDraft, setAddExerciseDraft] = useState<{ name: string; sets: string; restTime: string }>(() => ({
        name: '',
        sets: '3',
        restTime: '60',
    }));

    // ---- Edit exercise ----
    const [editExerciseOpen, setEditExerciseOpen] = useState<boolean>(false);
    const [editExerciseIdx, setEditExerciseIdx] = useState<number | null>(null);
    const [editExerciseDraft, setEditExerciseDraft] = useState<{ name: string; sets: string; restTime: string; method: string; isUnilateral?: boolean; sideRestTime?: string | null; transitionTime?: string | null }>(() => ({
        name: '',
        sets: '3',
        restTime: '60',
        method: 'Normal',
        isUnilateral: false,
        sideRestTime: '',
        transitionTime: '',
    }));
    const [editExerciseOriginal, setEditExerciseOriginal] = useState<{ name: string; sets: string; restTime: string; method: string; isUnilateral?: boolean; sideRestTime?: string | null; transitionTime?: string | null } | null>(null);
    const [persistToPlan, setPersistToPlanRaw] = useState<boolean>(false);
    // true depois que o USUÁRIO mexeu no toggle "Atualizar plano" nesta abertura
    // do modal — o auto-ligado abaixo nunca passa por cima de escolha explícita.
    const persistTouchedRef = useRef(false);
    const setPersistToPlan = useCallback((v: boolean) => {
        persistTouchedRef.current = true;
        setPersistToPlanRaw(v);
    }, []);

    const editExerciseHasChanges = useMemo(() => {
        if (!editExerciseOriginal || !editExerciseDraft) return false;
        return (
            editExerciseDraft.name !== editExerciseOriginal.name ||
            editExerciseDraft.sets !== editExerciseOriginal.sets ||
            editExerciseDraft.restTime !== editExerciseOriginal.restTime ||
            editExerciseDraft.method !== editExerciseOriginal.method ||
            !!editExerciseDraft.isUnilateral !== !!editExerciseOriginal.isUnilateral ||
            (editExerciseDraft.sideRestTime ?? '') !== (editExerciseOriginal.sideRestTime ?? '') ||
            (editExerciseDraft.transitionTime ?? '') !== (editExerciseOriginal.transitionTime ?? '')
        );
    }, [editExerciseDraft, editExerciseOriginal]);

    // Unilateral é propriedade do EXERCÍCIO, não ajuste do dia: o Cross que é
    // unilateral hoje continua unilateral amanhã. Quando o que mudou foi o
    // bloco unilateral (toggle/descanso entre lados/troca), o padrão vira
    // PERSISTIR no plano — o usuário ainda pode desligar. Sem isso, o relato
    // real de 14/08/2026: o aluno marca unilateral, toca em "Salvar" achando
    // que é definitivo (o toggle "Atualizar plano" nasce desligado), a sessão
    // recebe e o TEMPLATE não — no próximo treino o exercício volta bilateral,
    // "toda vez que eu vou lá e salvo, ele não salva".
    const unilateralBlockChanged = useMemo(() => {
        if (!editExerciseOriginal || !editExerciseDraft) return false;
        return (
            !!editExerciseDraft.isUnilateral !== !!editExerciseOriginal.isUnilateral ||
            (editExerciseDraft.sideRestTime ?? '') !== (editExerciseOriginal.sideRestTime ?? '') ||
            (editExerciseDraft.transitionTime ?? '') !== (editExerciseOriginal.transitionTime ?? '')
        );
    }, [editExerciseDraft, editExerciseOriginal]);

    useEffect(() => {
        // A cada abertura o toggle volta ao estado "não tocado" — o reset feito
        // pelo openEditExercise usa o setter embrulhado e marcaria touched.
        if (editExerciseOpen) persistTouchedRef.current = false;
    }, [editExerciseOpen]);

    useEffect(() => {
        if (!editExerciseOpen) return;
        if (persistTouchedRef.current) return;
        // Segue o bloco unilateral enquanto o usuário não tocar no toggle:
        // mudou → liga; desfez a mudança → desliga de volta.
        setPersistToPlanRaw(unilateralBlockChanged);
    }, [editExerciseOpen, unilateralBlockChanged]);

    // ---- Delete exercise confirmation ----
    const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

    // ---- Organize ----
    const [organizeOpen, setOrganizeOpen] = useState<boolean>(false);
    const [organizeDraft, setOrganizeDraft] = useState<UnknownRecord[]>([]);
    const [organizeSaving, setOrganizeSaving] = useState<boolean>(false);
    const [organizeError, setOrganizeError] = useState<string>('');
    const organizeBaseKeysRef = useRef<string[]>([]);

    const organizeDirty = useMemo(() => {
        // eslint-disable-next-line react-hooks/refs
        const baseKeys = Array.isArray(organizeBaseKeysRef.current) ? organizeBaseKeysRef.current : [];
        const draftKeys = draftOrderKeys(organizeDraft);
        if (draftKeys.length !== baseKeys.length) return true;
        for (let i = 0; i < draftKeys.length; i += 1) {
            if (draftKeys[i] !== baseKeys[i]) return true;
        }
        return false;
    }, [organizeDraft]);

    // ---- Post checkin ----
    const [postCheckinOpen, setPostCheckinOpen] = useState<boolean>(false);
    const [postCheckinDraft, setPostCheckinDraft] = useState<PostCheckinDraft>({ rpe: '', satisfaction: '', soreness: '', notes: '' });
    const postCheckinResolveRef = useRef<((value: unknown) => void) | null>(null);

    // ---- Advanced set method modals ----
    const [deloadModal, setDeloadModal] = useState<UnknownRecord | null>(null);
    const [clusterModal, setClusterModal] = useState<UnknownRecord | null>(null);

    // Draft refs: persist in-progress modal edits across dismiss/reopen (cleared on workout end via unmount)
    const restPauseDraftsRef = useRef<Record<string, UnknownRecord>>({});
    const dropSetDraftsRef = useRef<Record<string, UnknownRecord>>({});

    const [restPauseModal, setRestPauseModalRaw] = useState<UnknownRecord | null>(null);
    const setRestPauseModal = useCallback((action: UnknownRecord | null | ((prev: UnknownRecord | null) => UnknownRecord | null)) => {
        setRestPauseModalRaw((prev) => {
            const next = typeof action === 'function' ? action(prev) : action;
            if (next === null && prev !== null) {
                const k = typeof prev.key === 'string' ? prev.key : null;
                if (k) restPauseDraftsRef.current[k] = prev;
            }
            return next;
        });
    }, []);

    const [dropSetModal, setDropSetModalRaw] = useState<UnknownRecord | null>(null);
    const setDropSetModal = useCallback((action: UnknownRecord | null | ((prev: UnknownRecord | null) => UnknownRecord | null)) => {
        setDropSetModalRaw((prev) => {
            const next = typeof action === 'function' ? action(prev) : action;
            if (next === null && prev !== null) {
                const k = typeof prev.key === 'string' ? prev.key : null;
                if (k) dropSetDraftsRef.current[k] = prev;
            }
            return next;
        });
    }, []);
    const [strippingModal, setStrippingModal] = useState<UnknownRecord | null>(null);
    const [fst7Modal, setFst7Modal] = useState<UnknownRecord | null>(null);
    const [heavyDutyModal, setHeavyDutyModal] = useState<UnknownRecord | null>(null);
    const [pontoZeroModal, setPontoZeroModal] = useState<UnknownRecord | null>(null);
    const [forcedRepsModal, setForcedRepsModal] = useState<UnknownRecord | null>(null);
    const [negativeRepsModal, setNegativeRepsModal] = useState<UnknownRecord | null>(null);
    const [partialRepsModal, setPartialRepsModal] = useState<UnknownRecord | null>(null);
    const [sistema21Modal, setSistema21Modal] = useState<UnknownRecord | null>(null);
    const [waveModal, setWaveModal] = useState<UnknownRecord | null>(null);
    const [groupMethodModal, setGroupMethodModal] = useState<UnknownRecord | null>(null);

    // ---- Input refs ----
    const restPauseRefs = useRef<InputRefMap>({});
    const clusterRefs = useRef<InputRefMap>({});

    return {
        // Delete exercise confirmation
        deleteConfirmIdx, setDeleteConfirmIdx,
        // Collapsed
        collapsed, setCollapsed,
        // "Fazer depois"
        deferredExercises, setDeferredExercises,
        // Notes & UI flags
        openNotesKeys, setOpenNotesKeys,
        inviteOpen, setInviteOpen,
        linkedWeightExercises, setLinkedWeightExercises,
        currentExerciseIdx, setCurrentExerciseIdx,
        finishing, setFinishing,
        // Add exercise
        addExerciseOpen, setAddExerciseOpen,
        addExerciseDraft, setAddExerciseDraft,
        // Edit exercise
        editExerciseOpen, setEditExerciseOpen,
        editExerciseIdx, setEditExerciseIdx,
        editExerciseDraft, setEditExerciseDraft,
        editExerciseOriginal, setEditExerciseOriginal,
        persistToPlan, setPersistToPlan,
        editExerciseHasChanges,
        // Organize
        organizeOpen, setOrganizeOpen,
        organizeDraft, setOrganizeDraft,
        organizeSaving, setOrganizeSaving,
        organizeError, setOrganizeError,
        organizeBaseKeysRef,
        organizeDirty,
        // Checkin
        postCheckinOpen, setPostCheckinOpen,
        postCheckinDraft, setPostCheckinDraft,
        postCheckinResolveRef,
        // Advanced modals
        deloadModal, setDeloadModal,
        clusterModal, setClusterModal,
        restPauseModal, setRestPauseModal,
        dropSetModal, setDropSetModal,
        strippingModal, setStrippingModal,
        fst7Modal, setFst7Modal,
        heavyDutyModal, setHeavyDutyModal,
        pontoZeroModal, setPontoZeroModal,
        forcedRepsModal, setForcedRepsModal,
        negativeRepsModal, setNegativeRepsModal,
        partialRepsModal, setPartialRepsModal,
        sistema21Modal, setSistema21Modal,
        waveModal, setWaveModal,
        groupMethodModal, setGroupMethodModal,
        // Refs
        restPauseRefs,
        clusterRefs,
        restPauseDraftsRef,
        dropSetDraftsRef,
    };
}
