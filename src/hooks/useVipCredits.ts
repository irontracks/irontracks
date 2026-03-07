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
import { logError, logWarn, logInfo } from '@/lib/logger'

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

    const fetchCredits = async () => {
        try {
            const res = await fetch('/api/user/vip-credits');
            const data = await res.json();
            if (data.ok) {
                setCredits(data.credits);
                setError(null);
            } else {
                setError(data.error || 'Erro na API');
            }
        } catch (error) {
            logError('error', 'Failed to fetch VIP credits', error);
            setError((error as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCredits();
    }, []);

    return { credits, loading, error, refresh: fetchCredits };
}
