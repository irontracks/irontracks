'use client'

import { useState, useEffect, useRef } from 'react'
import type { VipBatchEntry, VipBatchResult } from '@/app/api/admin/vip/batch-status/route'

export type { VipBatchEntry, VipBatchResult }

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
    const prevIdsRef = useRef('')

    useEffect(() => {
        const ids = userIds.filter(Boolean)
        if (ids.length === 0) return

        // Prevent re-fetching for same set of IDs
        const key = ids.sort().join(',')
        if (key === prevIdsRef.current) return
        prevIdsRef.current = key

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
    }, [userIds])

    return { vipMap, loading, refresh: () => { prevIdsRef.current = ''; setVipMap({}) } }
}
