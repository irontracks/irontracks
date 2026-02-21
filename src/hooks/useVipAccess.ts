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

  // Fetch /api/vip/status for detailed limits/usage
  useEffect(() => {
    if (!userId) return;
    fetch('/api/vip/status')
      .then((r) => r.json())
      .then((d: unknown) => {
        if (d && typeof d === 'object' && (d as Record<string, unknown>).ok) {
          setVipStatus(d as VipStatus);
        }
      })
      .catch(() => { /* silently ignore */ });
  }, [userId]);

  // Fetch /api/vip/access for the boolean gate
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/vip/access', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json().catch((): unknown => null);
        if (cancelled) return;
        const j = json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
        if (j?.ok) {
          setVipAccess({ loaded: true, hasVip: !!j.hasVip });
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
