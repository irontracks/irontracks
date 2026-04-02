/**
 * IronTracks Premium UI Design System
 * 
 * Componentes reutilizáveis com estilo premium gold/glassmorphism.
 * Importe estes componentes em todos os pages/modals para padronização.
 */

import React from 'react'
import { Loader2 } from 'lucide-react'

// ─── Tokens ────────────────────────────────────────────────────────────────
export const gold = {
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)',
    gradientSubtle: 'linear-gradient(135deg, rgba(234,179,8,0.4) 0%, rgba(255,255,255,0.04) 50%, rgba(234,179,8,0.15) 100%)',
    border: 'rgba(234,179,8,0.25)',
    borderStrong: 'rgba(234,179,8,0.4)',
    glow: '0 0 24px rgba(234,179,8,0.18)',
    glowStrong: '0 0 40px rgba(234,179,8,0.28)',
    shadow: '0 4px 20px rgba(234,179,8,0.25)',
} as const

export const surface = {
    card: 'rgba(15,15,15,0.98)',
    elevated: 'rgba(22,22,22,0.98)',
    hover: 'rgba(255,255,255,0.025)',
    border: 'rgba(255,255,255,0.07)',
    borderStrong: 'rgba(255,255,255,0.12)',
    divider: 'rgba(255,255,255,0.05)',
} as const

// ─── GoldBadge ─────────────────────────────────────────────────────────────
export function GoldBadge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <span
            className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] px-2.5 py-1 rounded-full ${className}`}
            style={{
                background: 'rgba(234,179,8,0.12)',
                color: '#f59e0b',
                border: '1px solid rgba(234,179,8,0.22)',
            }}
        >
            {children}
        </span>
    )
}

// ─── GoldGradientBorder ─────────────────────────────────────────────────────
export function GoldGradientBorder({
    children,
    className = '',
    innerClassName = '',
    style,
}: {
    children: React.ReactNode
    className?: string
    innerClassName?: string
    style?: React.CSSProperties
}) {
    return (
        <div
            className={`rounded-2xl p-[1px] ${className}`}
            style={{ background: gold.gradientSubtle, ...style }}
        >
            <div
                className={`rounded-[15px] overflow-hidden h-full ${innerClassName}`}
                style={{ background: surface.card }}
            >
                {children}
            </div>
        </div>
    )
}

// ─── GoldCard ──────────────────────────────────────────────────────────────
export function GoldCard({
    children,
    className = '',
    noOverflow = false,
}: {
    children: React.ReactNode
    className?: string
    noOverflow?: boolean
}) {
    return (
        <GoldGradientBorder className={className} innerClassName={noOverflow ? '' : 'overflow-hidden'}>
            {children}
        </GoldGradientBorder>
    )
}

// ─── SectionHeader ─────────────────────────────────────────────────────────
export function SectionHeader({
    label,
    title,
    description,
    icon,
}: {
    label?: string
    title: string
    description?: string
    icon?: React.ReactNode
}) {
    return (
        <div>
            {label && (
                <GoldBadge className="mb-2">{label}</GoldBadge>
            )}
            <div className="text-white font-bold text-xl leading-tight flex items-center gap-2">
                {icon && <span className="text-yellow-500 flex-shrink-0">{icon}</span>}
                {title}
            </div>
            {description && (
                <div className="text-xs text-neutral-500 mt-1">{description}</div>
            )}
        </div>
    )
}

// ─── Divider ───────────────────────────────────────────────────────────────
export function GoldDivider({ className = '' }: { className?: string }) {
    return (
        <div
            className={`h-px ${className}`}
            style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.2), transparent)' }}
        />
    )
}

// ─── Button ────────────────────────────────────────────────────────────────
type ButtonVariant = 'gold' | 'ghost' | 'danger' | 'subtle'

export function PremiumButton({
    onClick,
    disabled,
    children,
    variant = 'gold',
    className = '',
    type = 'button',
    fullWidth = false,
}: {
    onClick?: () => void
    disabled?: boolean
    children: React.ReactNode
    variant?: ButtonVariant
    className?: string
    type?: 'button' | 'submit' | 'reset'
    fullWidth?: boolean
}) {
    const styles: Record<ButtonVariant, React.CSSProperties> = {
        gold: {
            background: disabled
                ? 'rgba(234,179,8,0.15)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)',
            color: disabled ? 'rgba(0,0,0,0.35)' : '#000',
            boxShadow: disabled ? 'none' : '0 4px 16px rgba(234,179,8,0.3)',
        },
        ghost: {
            background: 'rgba(255,255,255,0.04)',
            color: disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.75)',
            border: '1px solid rgba(255,255,255,0.09)',
        },
        danger: {
            background: 'rgba(239,68,68,0.08)',
            color: disabled ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.9)',
            border: '1px solid rgba(239,68,68,0.22)',
        },
        subtle: {
            background: 'rgba(234,179,8,0.08)',
            color: disabled ? 'rgba(234,179,8,0.25)' : '#f59e0b',
            border: '1px solid rgba(234,179,8,0.2)',
        },
    }

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-sm transition-all duration-150 active:scale-[0.97] ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:opacity-90'
                } ${fullWidth ? 'w-full' : ''} ${className}`}
            style={styles[variant]}
        >
            {children}
        </button>
    )
}

// ─── Toggle Switch ─────────────────────────────────────────────────────────
export function PremiumToggle({
    value,
    onChange,
    disabled = false,
}: {
    value: boolean
    onChange: (next: boolean) => void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            aria-label="Toggle"
            onClick={() => !disabled && onChange(!value)}
            disabled={disabled}
            className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-all duration-300 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            style={{
                background: value ? undefined : 'rgba(60,60,60,0.8)',
                ...(value
                    ? { background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 0 12px rgba(234,179,8,0.4)' }
                    : {}),
            }}
            aria-checked={value}
            role="switch"
        >
            <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${value ? 'left-6' : 'left-0.5'}`}
            />
        </button>
    )
}

// ─── SettingRow (toggle row) ────────────────────────────────────────────────
export function SettingRow({
    label,
    description,
    value,
    onChange,
    disabled,
}: {
    label: string
    description?: string
    value: boolean
    onChange: (next: boolean) => void
    disabled?: boolean
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-3.5" style={{ borderBottom: `1px solid ${surface.divider}` }}>
            <div className="min-w-0">
                <div className="text-sm font-bold text-white">{label}</div>
                {description && <div className="text-xs text-neutral-500 mt-0.5">{description}</div>}
            </div>
            <PremiumToggle value={value} onChange={onChange} disabled={disabled} />
        </div>
    )
}

// ─── Modal Overlay ─────────────────────────────────────────────────────────
export function ModalOverlay({
    children,
    onClose,
    position = 'center',
    className = '',
}: {
    children: React.ReactNode
    onClose?: () => void
    position?: 'center' | 'bottom'
    className?: string
}) {
    return (
        <div
            role="presentation"
            className={`fixed inset-0 z-[1200] flex p-4 ${position === 'bottom' ? 'items-end pb-safe' : 'items-center'
                } justify-center ${className}`}
            style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose?.() }}
        >
            {children}
        </div>
    )
}

// ─── Modal Container ───────────────────────────────────────────────────────
export function ModalContainer({
    children,
    className = '',
    maxWidth = 'max-w-lg',
}: {
    children: React.ReactNode
    className?: string
    maxWidth?: string
}) {
    return (
        <div
            className={`w-full ${maxWidth} rounded-2xl overflow-hidden shadow-2xl ${className}`}
            style={{
                background: surface.card,
                border: `1px solid ${gold.border}`,
                boxShadow: `${gold.glow}, 0 30px 80px rgba(0,0,0,0.65)`,
            }}
        >
            {children}
        </div>
    )
}

// ─── Modal Header ──────────────────────────────────────────────────────────
export function ModalHeader({
    label,
    title,
    icon,
    onClose,
}: {
    label?: string
    title: string
    icon?: React.ReactNode
    onClose?: () => void
}) {
    return (
        <div
            className="px-5 pt-5 pb-4 flex items-start justify-between gap-3"
            style={{ borderBottom: `1px solid ${surface.divider}` }}
        >
            <div className="min-w-0">
                {label && <GoldBadge className="mb-2">{label}</GoldBadge>}
                <div className="text-white font-bold text-lg flex items-center gap-2">
                    {icon && <span className="text-yellow-500">{icon}</span>}
                    {title}
                </div>
            </div>
            {onClose && (
                <button
                    type="button"
                    onClick={onClose}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-colors flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${surface.border}` }}
                    aria-label="Fechar"
                >
                    <span className="text-lg leading-none">×</span>
                </button>
            )}
        </div>
    )
}

// ─── Modal Footer ──────────────────────────────────────────────────────────
export function ModalFooter({ children }: { children: React.ReactNode }) {
    return (
        <div className="px-5 py-4 flex gap-2.5" style={{ borderTop: `1px solid ${surface.divider}` }}>
            {children}
        </div>
    )
}

// ─── Loading State ─────────────────────────────────────────────────────────
export function PremiumLoader({ label = 'Carregando…' }: { label?: string }) {
    return (
        <GoldGradientBorder>
            <div className="p-10 flex flex-col items-center gap-3">
                <Loader2 size={28} className="text-yellow-500 animate-spin" />
                <div className="text-sm text-neutral-500">{label}</div>
            </div>
        </GoldGradientBorder>
    )
}

// ─── Empty State ───────────────────────────────────────────────────────────
export function PremiumEmpty({ icon, message }: { icon?: React.ReactNode; message: string }) {
    return (
        <GoldGradientBorder>
            <div className="p-10 flex flex-col items-center gap-3 text-center">
                {icon && <div className="text-neutral-600">{icon}</div>}
                <div className="text-sm text-neutral-500">{message}</div>
            </div>
        </GoldGradientBorder>
    )
}

// ─── Input ─────────────────────────────────────────────────────────────────
export function PremiumInput({
    value,
    onChange,
    placeholder,
    type = 'text',
    className = '',
    prefix,
    suffix,
    label,
    disabled,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    type?: string
    className?: string
    prefix?: React.ReactNode
    suffix?: React.ReactNode
    label?: string
    disabled?: boolean
}) {
    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            {label && <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">{label}</label>}
            <div
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all"
                style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${surface.border}`,
                }}
            >
                {prefix && <span className="text-neutral-500 flex-shrink-0">{prefix}</span>}
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    aria-label={label ?? placeholder ?? 'input'}
                    disabled={disabled}
                    className="bg-transparent outline-none text-sm text-white flex-1 placeholder-neutral-600 disabled:opacity-50"
                />
                {suffix && <span className="text-neutral-500 flex-shrink-0">{suffix}</span>}
            </div>
        </div>
    )
}

// ─── Avatar ─────────────────────────────────────────────────────────────────
export function PremiumAvatar({
    photo,
    name,
    size = 44,
    ring = true,
}: {
    photo?: string | null
    name: string
    size?: number
    ring?: boolean
}) {
    const initials = name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    return (
        <div
            className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
            style={{
                width: size,
                height: size,
                background: photo ? 'transparent' : 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
                boxShadow: ring ? '0 0 0 1.5px rgba(234,179,8,0.25), 0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.3)',
            }}
        >
            {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" width={size} height={size} loading="lazy" className="w-full h-full object-cover" />
            ) : (
                <span className="font-black text-yellow-500/80" style={{ fontSize: size * 0.36 }}>
                    {initials || '?'}
                </span>
            )}
        </div>
    )
}

// ─── Page Shell ────────────────────────────────────────────────────────────
export function PageShell({
    children,
    className = '',
}: {
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={`min-h-screen text-white p-4 pt-safe ${className}`} style={{ background: 'radial-gradient(ellipse at top, #111 0%, #0a0a0a 100%)' }}>
            <div className="max-w-4xl mx-auto space-y-4">
                {children}
            </div>
        </div>
    )
}

// ─── List Item ─────────────────────────────────────────────────────────────
export function PremiumListItem({
    children,
    isLast = false,
    className = '',
}: {
    children: React.ReactNode
    isLast?: boolean
    className?: string
}) {
    return (
        <div
            className={`px-4 py-4 transition-colors hover:bg-white/[0.02] ${!isLast ? 'border-b border-white/[0.04]' : ''} ${className}`}
        >
            {children}
        </div>
    )
}
