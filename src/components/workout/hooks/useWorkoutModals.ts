import { useEffect, useMemo, useRef, useState } from 'react';
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
export function useWorkoutModals(collapsedKey: string | null) {
    // ---- Collapsed cards (persisted) ----
    const [collapsed, setCollapsed] = useState<Set<number>>(() => {
        if (!collapsedKey) return new Set<number>();
        try {
            if (typeof window === 'undefined') return new Set<number>();
            const raw = window.localStorage.getItem(collapsedKey);
            if (!raw) return new Set<number>();
            const arr: unknown = JSON.parse(raw);
            return new Set<number>(Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number') : []);
        } catch {
            return new Set<number>();
        }
    });

    useEffect(() => {
        if (!collapsedKey) return;
        try {
            if (typeof window === 'undefined') return;
            window.localStorage.setItem(collapsedKey, JSON.stringify([...collapsed]));
        } catch { }
    }, [collapsed, collapsedKey]);

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
    const [editExerciseDraft, setEditExerciseDraft] = useState<{ name: string; sets: string; restTime: string; method: string }>(() => ({
        name: '',
        sets: '3',
        restTime: '60',
        method: 'Normal',
    }));

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
    const [restPauseModal, setRestPauseModal] = useState<UnknownRecord | null>(null);
    const [dropSetModal, setDropSetModal] = useState<UnknownRecord | null>(null);
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
        // Collapsed
        collapsed, setCollapsed,
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
    };
}
