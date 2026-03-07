"use client";

import React, { useMemo } from 'react';
import { useDialog } from '@/contexts/DialogContext';

type HelpHintProps = {
  title: string;
  text: string;
  tooltip?: string;
  className?: string;
  forceVisible?: boolean;
};

export function HelpHint({ title, text, tooltip, className, forceVisible }: HelpHintProps) {
  const { alert } = useDialog();

  const visibilityClass = useMemo(() => {
    if (forceVisible) return 'opacity-100';
    return 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100';
  }, [forceVisible]);

  return (
    <button
      type="button"
      title={tooltip || title}
      aria-label={tooltip || title}
      onClick={async (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch {}
        try {
          await alert(text, title);
        } catch {}
      }}
      className={`h-5 w-5 inline-flex items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/40 text-[11px] font-black text-neutral-300 hover:text-yellow-500 hover:border-yellow-500/40 hover:bg-neutral-900 active:scale-95 transition-all ${visibilityClass} ${className || ''}`}
    >
      ?
    </button>
  );
}

