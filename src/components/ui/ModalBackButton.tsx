'use client'

/**
 * ModalBackButton — botão "Voltar" padrão pra modais full-screen.
 *
 * Substitui o tradicional "×" (close) no canto direito por uma seta
 * "←" no canto esquerdo — semântica de "voltar pra tela anterior",
 * mais coerente com padrão mobile-first (iOS/Android headers nativos).
 *
 * Funcionalmente é igual ao close: dispara onClick (que normalmente
 * fecha o modal). A diferença é só visual + semântica (aria-label).
 *
 * Usage
 * ─────
 *   <ModalBackButton onClick={() => setOpen(false)} />
 *
 * Ou com label customizado (default "Voltar"):
 *   <ModalBackButton onClick={onClose} label="Cancelar avaliação" />
 *
 * Variantes
 * ─────────
 *   - default: pill flutuante 40×40 com border (tema dark do app)
 *   - subtle:  só ícone sem fundo (pra headers já com background próprio)
 *   - filled:  fundo opaco (pra usar sobre imagens/conteúdo)
 */

import { ArrowLeft } from 'lucide-react'

interface ModalBackButtonProps {
  onClick: () => void
  /** Texto pra screen readers. Default: "Voltar". */
  label?: string
  /** Variante visual. */
  variant?: 'default' | 'subtle' | 'filled'
  /** Tamanho do ícone (default 18). */
  iconSize?: number
  /** Classes adicionais. */
  className?: string
  /** Quando true, desabilita interação (útil em estados de loading). */
  disabled?: boolean
}

export function ModalBackButton({
  onClick,
  label = 'Voltar',
  variant = 'default',
  iconSize = 18,
  className = '',
  disabled,
}: ModalBackButtonProps) {
  const variantClasses = {
    default:
      'bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800',
    subtle:
      'hover:bg-white/[0.06] text-neutral-400 hover:text-white border border-transparent',
    filled:
      'bg-neutral-950/85 hover:bg-neutral-900 text-white border border-white/10 backdrop-blur-md',
  }[variant]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses} ${className}`}
      aria-label={label}
      title={label}
    >
      <ArrowLeft size={iconSize} strokeWidth={2.2} />
    </button>
  )
}

export default ModalBackButton
