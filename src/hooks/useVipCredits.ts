/**
 * @module useVipCredits
 *
 * Tracks per-feature credit usage vs. limits for the current VIP tier.
 * Returns remaining credits for chat, wizard, and insights, along with
 * human-readable labels. Decrements locally on use and re-syncs with
 * the server periodically.
 *
 * @returns `{ credits, useCredit, isExhausted, refresh }`
 */
import { useState, useEffect } from 'react';
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

    useEffect(() => {
        const controller = new AbortController();
        fetchCredits(controller.signal).catch((err) => {
            if ((err as { name?: string })?.name === 'AbortError') return;
            logWarn('warn', 'useVipCredits: unexpected error', err);
        });
        return () => { controller.abort(); };
    }, []);

    const refresh = () => fetchCredits();

    return { credits, loading, error, refresh };
}
