import { useState, useRef, useEffect } from 'react';
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient';

type UnknownRecord = Record<string, unknown>;

interface UseAdminVideoBackfillProps {
    tab: string;
    isAdmin: boolean;
}

/**
 * Hook: manages the exercise video backfill/queue state and fetching.
 */
export const useAdminVideoBackfill = ({ tab, isAdmin }: UseAdminVideoBackfillProps) => {
    const supabase = useStableSupabaseClient();

    const [videoQueue, setVideoQueue] = useState<UnknownRecord[]>([]);
    const [videoLoading, setVideoLoading] = useState<boolean>(false);
    const [videoMissingCount, setVideoMissingCount] = useState<number | null>(null);
    const [videoMissingLoading, setVideoMissingLoading] = useState<boolean>(false);
    const [videoExerciseName, setVideoExerciseName] = useState<string>('');
    const [videoBackfillLimit, setVideoBackfillLimit] = useState<string>('20');
    const [videoCycleRunning, setVideoCycleRunning] = useState<boolean>(false);
    const [videoCycleStats, setVideoCycleStats] = useState<{ processed: number; created: number; skipped: number }>({ processed: 0, created: 0, skipped: 0 });
    const videoCycleStopRef = useRef<boolean>(false);

    // Exercise aliases
    const [exerciseAliasesReview, setExerciseAliasesReview] = useState<UnknownRecord[]>([]);
    const [exerciseAliasesLoading, setExerciseAliasesLoading] = useState<boolean>(false);
    const [exerciseAliasesError, setExerciseAliasesError] = useState<string>('');
    const [exerciseAliasesBackfillLoading, setExerciseAliasesBackfillLoading] = useState<boolean>(false);
    const [exerciseAliasesNotice, setExerciseAliasesNotice] = useState<string>('');

    // Fetch videos + missing count
    useEffect(() => {
        if (tab !== 'videos' || !isAdmin) return;
        const normalizeExercise = (value: unknown): string => {
            const s = String(value || '').trim().toLowerCase();
            if (!s) return '';
            return s
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');
        };
        const fetchMissing = async () => {
            setVideoMissingLoading(true);
            try {
                const { data: rows, error } = await supabase
                    .from('exercises')
                    .select('name, video_url')
                    .or('video_url.is.null,video_url.eq.')
                    .limit(2000);
                if (error) throw error;
                const normalized = new Set<string>();
                for (const r of (rows || [])) {
                    const name = String(r?.name || '').trim();
                    if (!name) continue;
                    const n = normalizeExercise(name);
                    if (!n) continue;
                    normalized.add(n);
                    if (normalized.size >= 1000) break;
                }
                const normalizedList = Array.from(normalized);
                if (!normalizedList.length) {
                    setVideoMissingCount(0);
                    return;
                }
                const { data: libRows } = await supabase
                    .from('exercise_library')
                    .select('normalized_name, video_url')
                    .in('normalized_name', normalizedList)
                    .limit(normalizedList.length);
                const withVideo = new Set(
                    (libRows || [])
                        .filter((x) => !!String(x?.video_url || '').trim())
                        .map((x) => String(x?.normalized_name || '').trim())
                        .filter(Boolean)
                );
                let missing = 0;
                for (const n of normalizedList) {
                    if (!withVideo.has(n)) missing += 1;
                }
                setVideoMissingCount(missing);
            } catch {
                setVideoMissingCount(null);
            } finally {
                setVideoMissingLoading(false);
            }
        };
        const fetchVideos = async () => {
            setVideoLoading(true);
            try {
                const { data, error } = await supabase
                    .from('exercise_videos')
                    .select('id, url, title, channel_title, created_at, exercise_library_id, exercise_library:exercise_library_id(display_name_pt)')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })
                    .limit(60);
                if (!error) setVideoQueue(data || []);
            } catch {
                setVideoQueue([]);
            } finally {
                setVideoLoading(false);
            }
        };
        fetchVideos();
        fetchMissing();
    }, [tab, isAdmin, supabase]);

    // Fetch aliases
    useEffect(() => {
        if (tab !== 'system' || !isAdmin) return;
        let cancelled = false;
        const fetchAliases = async () => {
            setExerciseAliasesLoading(true);
            setExerciseAliasesError('');
            try {
                const { data, error } = await supabase
                    .from('exercise_aliases')
                    .select('id, user_id, canonical_id, alias, normalized_alias, confidence, source, needs_review, created_at, updated_at')
                    .eq('needs_review', true)
                    .order('created_at', { ascending: false })
                    .limit(200);
                if (cancelled) return;
                if (error) {
                    setExerciseAliasesReview([]);
                    const msg = String(error?.message || '');
                    if (msg) setExerciseAliasesError(msg);
                    return;
                }
                setExerciseAliasesReview(Array.isArray(data) ? data : []);
            } catch (e: unknown) {
                if (!cancelled) {
                    setExerciseAliasesReview([]);
                    const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
                    if (msg) setExerciseAliasesError(msg);
                }
            } finally {
                if (!cancelled) setExerciseAliasesLoading(false);
            }
        };
        fetchAliases();
        return () => { cancelled = true; };
    }, [tab, isAdmin, supabase]);

    return {
        videoQueue, setVideoQueue,
        videoLoading, setVideoLoading,
        videoMissingCount, setVideoMissingCount,
        videoMissingLoading, setVideoMissingLoading,
        videoExerciseName, setVideoExerciseName,
        videoBackfillLimit, setVideoBackfillLimit,
        videoCycleRunning, setVideoCycleRunning,
        videoCycleStats, setVideoCycleStats,
        videoCycleStopRef,

        exerciseAliasesReview, setExerciseAliasesReview,
        exerciseAliasesLoading, setExerciseAliasesLoading,
        exerciseAliasesError, setExerciseAliasesError,
        exerciseAliasesBackfillLoading, setExerciseAliasesBackfillLoading,
        exerciseAliasesNotice, setExerciseAliasesNotice,
    };
};
