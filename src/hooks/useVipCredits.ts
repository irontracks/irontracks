import { useState, useEffect } from 'react';
import { logError, logWarn, logInfo } from '@/lib/logger'

interface VipCredits {
    chat?: { used: number; limit: number }
    wizard?: { used: number; limit: number }
    insights?: { used: number; limit: number }
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
