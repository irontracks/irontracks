import { useState, useCallback, useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from '@/utils/errorMessage';

type UnknownRecord = Record<string, unknown>;

const COACH_INBOX_DEFAULTS = {
    churnDays: 7,
    volumeDropPct: 30,
    loadSpikePct: 60,
    minPrev7Volume: 500,
    minCurrent7VolumeSpike: 800,
    snoozeDefaultMinutes: 1440,
};

interface UseAdminPrioritiesParams {
    tab: string;
    userId: string | undefined;
    // Supabase client — no generated DB types in this project; using base client type
    supabase: SupabaseClient;
}

/**
 * useAdminPriorities
 *
 * Owns the "Coach Inbox / Priorities" domain:
 * - fetch priorities feed
 * - load/save coach inbox settings
 * - compose message state
 */
export function useAdminPriorities({ tab, userId, supabase }: UseAdminPrioritiesParams) {
    const [prioritiesItems, setPrioritiesItems] = useState<UnknownRecord[]>([]);
    const [prioritiesLoading, setPrioritiesLoading] = useState<boolean>(false);
    const [prioritiesError, setPrioritiesError] = useState<string>('');
    const [prioritiesSettingsOpen, setPrioritiesSettingsOpen] = useState<boolean>(false);
    const [prioritiesSettings, setPrioritiesSettings] = useState(() => ({ ...COACH_INBOX_DEFAULTS }));
    const [prioritiesSettingsLoading, setPrioritiesSettingsLoading] = useState<boolean>(false);
    const [prioritiesSettingsError, setPrioritiesSettingsError] = useState<string>('');
    const prioritiesSettingsPrefRef = useRef<UnknownRecord | null>(null);
    const [prioritiesComposeOpen, setPrioritiesComposeOpen] = useState<boolean>(false);
    const [prioritiesComposeStudentId, setPrioritiesComposeStudentId] = useState<string>('');
    const [prioritiesComposeKind, setPrioritiesComposeKind] = useState<string>('');
    const [prioritiesComposeText, setPrioritiesComposeText] = useState<string>('');

    const fetchPriorities = useCallback(async () => {
        try {
            setPrioritiesLoading(true);
            setPrioritiesError('');
            const res = await fetch('/api/teacher/inbox/feed?limit=80', { cache: 'no-store', credentials: 'include' });
            const json = await res.json().catch((): null => null);
            if (!res.ok || !json?.ok) {
                setPrioritiesItems([]);
                setPrioritiesError(String(json?.error || `Falha ao carregar (${res.status})`));
                return;
            }
            setPrioritiesItems(Array.isArray(json.items) ? json.items : []);
        } catch (e: unknown) {
            setPrioritiesItems([]);
            const msg = getErrorMessage(e);
            setPrioritiesError(msg || 'Erro ao carregar');
        } finally {
            setPrioritiesLoading(false);
        }
    }, []);

    const normalizeCoachInboxSettings = useCallback((raw: unknown) => {
        const s: UnknownRecord = raw && typeof raw === 'object' ? (raw as UnknownRecord) : {};
        const toInt = (v: unknown, min: number, max: number, fallback: number) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            const x = Math.floor(n);
            return Math.max(min, Math.min(max, x));
        };
        return {
            churnDays: toInt(s.churnDays, 1, 60, COACH_INBOX_DEFAULTS.churnDays),
            volumeDropPct: toInt(s.volumeDropPct, 5, 90, COACH_INBOX_DEFAULTS.volumeDropPct),
            loadSpikePct: toInt(s.loadSpikePct, 10, 300, COACH_INBOX_DEFAULTS.loadSpikePct),
            minPrev7Volume: toInt(s.minPrev7Volume, 0, 1000000, COACH_INBOX_DEFAULTS.minPrev7Volume),
            minCurrent7VolumeSpike: toInt(s.minCurrent7VolumeSpike, 0, 1000000, COACH_INBOX_DEFAULTS.minCurrent7VolumeSpike),
            snoozeDefaultMinutes: toInt(s.snoozeDefaultMinutes, 5, 10080, COACH_INBOX_DEFAULTS.snoozeDefaultMinutes),
        };
    }, []);

    const loadPrioritiesSettings = useCallback(async () => {
        try {
            setPrioritiesSettingsLoading(true);
            setPrioritiesSettingsError('');
            const uid = userId ? String(userId) : '';
            if (!uid) return;
            const { data, error } = await supabase
                .from('user_settings')
                .select('preferences')
                .eq('user_id', uid)
                .maybeSingle();
            if (error) {
                const msg = String(getErrorMessage(error) || '');
                const code = String((error as unknown as Record<string, unknown>)?.code || '');
                const missing = code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg);
                if (missing) {
                    prioritiesSettingsPrefRef.current = null;
                    setPrioritiesSettings({ ...COACH_INBOX_DEFAULTS });
                    setPrioritiesSettingsError('Tabela user_settings não disponível (migrations pendentes).');
                    return;
                }
                setPrioritiesSettingsError(msg || 'Falha ao carregar configurações.');
                return;
            }
            const prefs: UnknownRecord = data?.preferences && typeof data.preferences === 'object' ? (data.preferences as UnknownRecord) : {};
            prioritiesSettingsPrefRef.current = prefs;
            const next = normalizeCoachInboxSettings(prefs.coachInbox);
            setPrioritiesSettings(next);
        } catch (e: unknown) {
            const msg = getErrorMessage(e);
            setPrioritiesSettingsError(msg || 'Falha ao carregar configurações.');
        } finally {
            setPrioritiesSettingsLoading(false);
        }
    }, [normalizeCoachInboxSettings, supabase, userId]);

    const savePrioritiesSettings = useCallback(async () => {
        try {
            const uid = userId ? String(userId) : '';
            if (!uid) return false;
            setPrioritiesSettingsLoading(true);
            setPrioritiesSettingsError('');
            const basePrefs = prioritiesSettingsPrefRef.current && typeof prioritiesSettingsPrefRef.current === 'object'
                ? prioritiesSettingsPrefRef.current
                : {};
            const payload = {
                user_id: uid,
                preferences: { ...basePrefs, coachInbox: normalizeCoachInboxSettings(prioritiesSettings) },
                updated_at: new Date().toISOString(),
            };
            const { error } = await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' });
            if (error) {
                setPrioritiesSettingsError(String(getErrorMessage(error) || 'Falha ao salvar.'));
                return false;
            }
            prioritiesSettingsPrefRef.current = payload.preferences;
            return true;
        } catch (e: unknown) {
            const msg = getErrorMessage(e);
            setPrioritiesSettingsError(msg || 'Falha ao salvar.');
            return false;
        } finally {
            setPrioritiesSettingsLoading(false);
        }
    }, [normalizeCoachInboxSettings, prioritiesSettings, supabase, userId]);

    // Auto-load when tab is 'priorities'
    useEffect(() => {
        if (tab !== 'priorities') return;
        fetchPriorities();
    }, [tab, fetchPriorities]);

    return {
        prioritiesItems, setPrioritiesItems,
        prioritiesLoading, setPrioritiesLoading,
        prioritiesError, setPrioritiesError,
        prioritiesSettingsOpen, setPrioritiesSettingsOpen,
        prioritiesSettings, setPrioritiesSettings,
        prioritiesSettingsLoading, setPrioritiesSettingsLoading,
        prioritiesSettingsError, setPrioritiesSettingsError,
        prioritiesSettingsPrefRef,
        prioritiesComposeOpen, setPrioritiesComposeOpen,
        prioritiesComposeStudentId, setPrioritiesComposeStudentId,
        prioritiesComposeKind, setPrioritiesComposeKind,
        prioritiesComposeText, setPrioritiesComposeText,
        fetchPriorities,
        normalizeCoachInboxSettings,
        loadPrioritiesSettings,
        savePrioritiesSettings,
    };
}
