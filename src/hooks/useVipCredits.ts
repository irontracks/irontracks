import { useState, useEffect } from 'react';

export function useVipCredits() {
    const [credits, setCredits] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<any>(null);

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
            console.error('Failed to fetch VIP credits', error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCredits();
    }, []);

    return { credits, loading, error, refresh: fetchCredits };
}
