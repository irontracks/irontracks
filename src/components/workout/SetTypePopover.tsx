'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { Check, Flame, Search } from 'lucide-react';
import { triggerHaptic } from '@/utils/native/irontracksNative';
import type { SetType } from '@/types/workout';

const LONG_PRESS_MS = 380;
const MOVE_CANCEL_PX = 10;

type LongPressHandlers = {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void;
  onContextMenu: (e: React.MouseEvent<HTMLElement>) => void;
};

// Long-press detection that ignores small finger drift (taps on a sweaty
// phone wobble a few pixels). Returns handlers to spread onto a button.
export function useLongPress(onLongPress: () => void, durationMs: number = LONG_PRESS_MS): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  useEffect(() => () => clear(), [clear]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    firedRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      timerRef.current = null;
      void triggerHaptic('medium');
      onLongPress();
    }, durationMs);
  }, [onLongPress, durationMs]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const s = startPosRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clear();
  }, [clear]);

  const handlePointerUp = useCallback(() => { clear(); }, [clear]);
  const handlePointerCancel = useCallback(() => { clear(); }, [clear]);
  const handlePointerLeave = useCallback(() => { clear(); }, [clear]);

  // Long-press on mouse = right-click context menu would also be a natural
  // trigger. Swallow it to avoid the OS menu opening on top of the popover.
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (firedRef.current) e.preventDefault();
  }, []);

  return {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerMove: handlePointerMove,
    onPointerCancel: handlePointerCancel,
    onPointerLeave: handlePointerLeave,
    onContextMenu: handleContextMenu,
  };
}

// Visual style metadata for each set type. Co-located here so renderers can
// import the same colors/letters without duplicating the constants.
export const SET_TYPE_META: Record<SetType, { label: string; shortLabel: string; suffix: string; icon: React.ComponentType<{ size?: number; className?: string }>; badgeClass: string; rowOpacityClass: string }> = {
  working: {
    label: 'Válida',
    shortLabel: '',
    suffix: '',
    icon: Check,
    badgeClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
    rowOpacityClass: '',
  },
  warmup: {
    label: 'Aquecimento',
    shortLabel: 'A',
    suffix: 'A',
    icon: Flame,
    badgeClass: 'bg-orange-400/15 text-orange-300 border-orange-400/40',
    rowOpacityClass: 'opacity-60',
  },
  feeler: {
    label: 'Reconhecimento',
    shortLabel: 'R',
    suffix: 'R',
    icon: Search,
    badgeClass: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/40',
    rowOpacityClass: 'opacity-60',
  },
};

type Props = {
  open: boolean;
  anchorRect: DOMRect | null;
  current: SetType;
  onSelect: (type: SetType) => void;
  onClose: () => void;
};

// Tiny anchored popover (no portal — relies on parent stacking context).
// Click-outside closes. ESC closes. We position absolutely relative to the
// closest positioned ancestor by computing pixel offsets from anchorRect.
export const SetTypePopover: React.FC<Props> = ({ open, anchorRect, current, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleDown = (e: PointerEvent) => {
      const node = ref.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Defer the listener install one tick so the same pointerup that opened
    // the popover doesn't immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener('pointerdown', handleDown, true);
      window.addEventListener('keydown', handleKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', handleDown, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  // Position the popover anchored to the badge: prefer right-of, fallback
  // to below if there's not enough horizontal space.
  const popoverWidth = 168;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
  const placeBelow = anchorRect.right + popoverWidth + 12 > viewportWidth;

  const style: React.CSSProperties = placeBelow
    ? { position: 'fixed', top: anchorRect.bottom + 4, left: Math.max(8, Math.min(anchorRect.left, viewportWidth - popoverWidth - 8)), width: popoverWidth, zIndex: 1000 }
    : { position: 'fixed', top: anchorRect.top + anchorRect.height / 2 - 60, left: anchorRect.right + 8, width: popoverWidth, zIndex: 1000 };

  const options: SetType[] = ['working', 'warmup', 'feeler'];

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Tipo da série"
      style={style}
      className="rounded-xl bg-neutral-900/95 backdrop-blur border border-neutral-700 shadow-2xl shadow-black/40 py-1 text-sm text-white animate-in fade-in zoom-in-95 duration-100"
    >
      {options.map((opt) => {
        const meta = SET_TYPE_META[opt];
        const isCurrent = opt === current;
        const Icon = meta.icon;
        return (
          <button
            key={opt}
            type="button"
            role="menuitem"
            onPointerUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void triggerHaptic('selection');
              onSelect(opt);
              onClose();
            }}
            className={[
              'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
              isCurrent ? 'bg-yellow-500/10 text-yellow-300' : 'hover:bg-neutral-800 text-neutral-200',
            ].join(' ')}
          >
            <Icon size={14} className="shrink-0" />
            <span className="flex-1 font-medium">{meta.label}</span>
            {isCurrent && <Check size={14} className="text-yellow-400" />}
          </button>
        );
      })}
    </div>
  );
};

// Convenience helper: derive the effective set type from a log/plan record
// that may carry either the new field or the legacy is_warmup flag.
export function resolveSetType(input: { set_type?: SetType | string | null; setType?: SetType | string | null; is_warmup?: unknown; isWarmup?: unknown }): SetType {
  const raw = (input.set_type ?? input.setType) as string | null | undefined;
  if (raw === 'working' || raw === 'warmup' || raw === 'feeler') return raw;
  const warmup = !!(input.is_warmup ?? input.isWarmup);
  return warmup ? 'warmup' : 'working';
}
