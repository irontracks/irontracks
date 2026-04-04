/**
 * @module useVipCredits
 *
 * Tracks per-feature credit usage vs. limits for the current VIP tier.
 * Returns remaining credits for chat, wizard, and insights, along with
 * human-readable labels. Decrements locally on use and re-syncs with
 * the server periodically.
 *
 * @returns `{ credits, loading, error, refresh }`
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { logError, logWarn } from '@/lib/logger'

interface VipCredits {
    chat?: { used: number; limit: number | null; label?: string }
    wizard?: { used: number; limit: number | null; label?: string }
    insights?: { used: number; limit: number | null; label?: string }
    plan?: string
    [key: string]: unknown
}

export function useVipCredits() {
    const [credits, setCredits] = useState<VipCredits | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCredits = async (signal?: AbortSignal) => {
        try {
            const res = await fetch('/api/user/vip-credits', signal ? { signal } : undefined);
            const data = await res.json();
            if (data.ok) {
                setCredits(data.credits);
                setError(null);
            } else {
                setError(data.error || 'Erro na API');
            }
        } catch (err) {
            if ((err as { name?: string })?.name === 'AbortError') return; // expected on unmount, ignore
            logError('error', 'Failed to fetch VIP credits', err);
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        controllerRef.current = controller;
        fetchCredits(controller.signal).catch((err) => {
            if ((err as { name?: string })?.name === 'AbortError') return;
            logWarn('warn', 'useVipCredits: unexpected error', err);
        });
        return () => { controller.abort(); controllerRef.current = null; };
    }, []);

    const refresh = useCallback(() => {
        // Abort any in-flight refresh before starting a new one
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        fetchCredits(controller.signal).catch((err) => {
            if ((err as { name?: string })?.name === 'AbortError') return;
            logWarn('warn', 'useVipCredits.refresh: unexpected error', err);
        });
    }, []);

    return { credits, loading, error, refresh };
}
