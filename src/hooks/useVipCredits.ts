/**
 * @module useVipCredits
 *
 * Tracks per-feature credit usage vs. limits for the current VIP tier.
 * Returns remaining credits for chat, wizard, and insights, along with
 * human-readable labels.
 *
 * Reescrito em PR-C (REACT19_MIGRATION_PLAN) usando TanStack Query v5.
 * API pública preservada: `{ credits, loading, error, refresh }`.
 *
 * @returns `{ credits, loading, error, refresh }`
 */
'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'

interface VipCredits {
    chat?: { used: number; limit: number | null; label?: string }
    wizard?: { used: number; limit: number | null; label?: string }
    insights?: { used: number; limit: number | null; label?: string }
    plan?: string
    [key: string]: unknown
}

interface VipCreditsResponse {
    ok?: boolean
    credits?: VipCredits
    error?: string
}

export function useVipCredits() {
    const query = useQuery<VipCredits>({
        queryKey: ['vip-credits'],
        queryFn: async ({ signal }): Promise<VipCredits> => {
            const res = await fetch('/api/user/vip-credits', { signal })
            const data = (await res.json()) as VipCreditsResponse
            if (!data.ok) throw new Error(data.error || 'Erro na API')
            return data.credits ?? {}
        },
        // Credits podem mudar a qualquer momento (uso AI, etc); 30s é razoável.
        staleTime: 30_000,
    })

    const refresh = useCallback(() => {
        // refetch nativo do Query — aborta in-flight + dispara novo fetch
        void query.refetch()
    }, [query])

    return {
        credits: query.data ?? null,
        loading: query.isLoading,
        error: query.error ? (query.error as Error).message : null,
        refresh,
    }
}
