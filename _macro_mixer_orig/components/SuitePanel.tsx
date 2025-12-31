"use client";

import { ReactNode, useEffect } from "react";

type SuitePanelSize = "md" | "lg";

export default function SuitePanel({
  open,
  title,
  onClose,
  children,
  size = "md"
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: SuitePanelSize;
}) {
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxWidthClass = size === "lg" ? "sm:max-w-3xl" : "sm:max-w-2xl";

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative h-full w-full flex items-end sm:items-center sm:justify-center p-0 sm:p-6">
        <div
          className={
            "w-full sm:w-full " +
            maxWidthClass +
            " bg-zinc-950/85 border border-white/10 shadow-[0_28px_90px_-50px_rgba(0,0,0,0.95)] ring-1 ring-yellow-500/10 " +
            "rounded-t-3xl sm:rounded-3xl overflow-hidden"
          }
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-950/40">
            <div className="text-sm font-black tracking-tight">
              <span className="text-white">{title}</span>
            </div>
            <button
              onClick={onClose}
              className="btn-ghost w-10 h-10 p-0"
              aria-label="Fechar"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div className="p-4 max-h-[78vh] overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

