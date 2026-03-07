/**
 * @module useAdminVipMap
 *
 * Batch-fetches VIP tier status for a list of user IDs via the admin API.
 * Returns a `vipMap` keyed by user ID with tier, plan, validity, and source.
 * Includes label/color helpers for rendering tier badges in the admin panel.
 *
 * @param userIds - Array of user IDs to look up
 * @returns `{ vipMap, loading, refresh }`
 */
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

export type VipBatchEntry = {
    tier: string
    plan_id: string | null
    valid_until: string | null
    source: string
    status: string | null
}

export type VipBatchResult = Record<string, VipBatchEntry>

const TIER_LABELS: Record<string, string> = {
    vip_start: 'START',
    vip_pro: 'PRO',
    vip_elite: 'ELITE',
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    vip_start: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/25', dot: 'bg-yellow-400' },
    vip_pro: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/25', dot: 'bg-green-400' },
    vip_elite: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/25', dot: 'bg-purple-400' },
}

export const getVipLabel = (tier: string) => TIER_LABELS[tier] || null
export const getVipColors = (tier: string) => TIER_COLORS[tier] || null

export function useAdminVipMap(userIds: string[]) {
    const [vipMap, setVipMap] = useState<VipBatchResult>({})
    const [loading, setLoading] = useState(false)
    const prevKeyRef = useRef('')

    // Stabilize array reference — only recalculate on actual content change
    const stableKey = useMemo(() => {
        const ids = userIds.filter(Boolean)
        return ids.length > 0 ? [...ids].sort().join(',') : ''
    }, [userIds])

    useEffect(() => {
        if (!stableKey) return
        if (stableKey === prevKeyRef.current) return
        prevKeyRef.current = stableKey

        const ids = stableKey.split(',')
        let cancelled = false
        setLoading(true)

        fetch('/api/admin/vip/batch-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ user_ids: ids }),
        })
            .then(r => r.json())
            .then((d: unknown) => {
                if (cancelled) return
                const data = d as Record<string, unknown>
                if (data?.ok && data?.vip) {
                    setVipMap(data.vip as VipBatchResult)
                }
            })
            .catch(() => { })
            .finally(() => { if (!cancelled) setLoading(false) })

        return () => { cancelled = true }
    }, [stableKey])

    return { vipMap, loading, refresh: () => { prevKeyRef.current = ''; setVipMap({}) } }
}
