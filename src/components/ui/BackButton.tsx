'use client';

import type { MouseEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';

type BackButtonProps = {
  onClick?: () => void;
  className?: string;
  label?: string;
  /**
   * When true, runs the smart navigation (router.back / parent path fallback).
   * Defaults to false when onClick is provided (treat as "controlled"), otherwise true.
   */
  withNavigation?: boolean;
};

export function BackButton({ onClick, className, label = "Voltar", withNavigation }: BackButtonProps) {
  const router = useRouter();
  const pathname = usePathname();

  const shouldNavigate = withNavigation ?? !onClick;

  const handleBack = (e?: MouseEvent<HTMLButtonElement>) => {
    try {
      e?.preventDefault();
      e?.stopPropagation();
    } catch {}

    try {
      onClick?.();
    } catch {}

    if (!shouldNavigate) return;
    // LÓGICA SMART BACK:
    // Se o histórico for longo (navegação normal), volta.
    // Se for curto (deu F5), calcula a rota "Pai" pela URL.
    if (typeof window !== 'undefined' && window.history.length > 2) {
      router.back();
    } else {
      // Ex: /dashboard/alunos/123 -> vira -> /dashboard/alunos
      const safePathname = pathname ?? '/dashboard';
      const pathSegments = safePathname.split('/').filter(Boolean);
      // Remove o último segmento
      pathSegments.pop();
      // Monta a nova URL ou volta para dashboard se sobrar nada
      const newPath = pathSegments.length ? `/${pathSegments.join('/')}` : '/dashboard';
      router.push(newPath);
    }
  };

  return (
    <button 
      type="button"
      onClick={handleBack} 
      className={`flex items-center gap-2 text-yellow-500 hover:text-yellow-400 transition-colors py-2 active:opacity-70 bg-transparent border-none ${className ?? ''}`}
      aria-label="Voltar"
    >
      <ArrowLeft size={20} />
      <span className="font-semibold text-sm md:text-base">{label}</span>
    </button>
  );
}
