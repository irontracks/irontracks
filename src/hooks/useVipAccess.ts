/**
 * @module useVipAccess
 *
 * Provides the current user's VIP subscription status, tier, and
 * feature entitlements. Fetches from `/api/vip/status` and caches
 * the result for the session. Used to gate premium features like
 * AI chat, analytics, and offline mode.
 *
 * @returns `{ loaded, hasVip, tier, limits }`
 */
'use client';

import { useState, useEffect } from 'react';
import type { VipStatus } from '@/types/app';

interface VipAccessState {
  loaded: boolean;
  hasVip: boolean;
}

interface UseVipAccessOptions {
  userId?: string | null;
  /** If the user is already known admin/teacher, pre-seed hasVip = true */
  initialRole?: string | null;
}

export function useVipAccess({ userId, initialRole }: UseVipAccessOptions = {}) {
  const isElevated = initialRole === 'admin' || initialRole === 'teacher';

  const [vipAccess, setVipAccess] = useState<VipAccessState>({
    loaded: isElevated,
    hasVip: isElevated,
  });

  const [vipStatus, setVipStatus] = useState<VipStatus | null>(null);

  // Single fetch that covers both the boolean gate and detailed limits/usage.
  // /api/vip/access already returns entitlement + role; /api/vip/status returns tier + limits + usage.
  // We use /api/vip/status as the single source because it's a superset.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/vip/status', { credentials: 'include', cache: 'no-store' });
        const json = await res.json().catch((): unknown => null);
        if (cancelled) return;
        const j = json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
        if (j?.ok) {
          setVipStatus(j as VipStatus);
          const hasVip = String(j.tier ?? '').toLowerCase() !== 'free';
          setVipAccess({ loaded: true, hasVip });
          return;
        }
        setVipAccess((prev) => ({ loaded: true, hasVip: prev.hasVip }));
      } catch {
        if (!cancelled) setVipAccess((prev) => ({ loaded: true, hasVip: prev.hasVip }));
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return { vipAccess, setVipAccess, vipStatus, setVipStatus };
}
