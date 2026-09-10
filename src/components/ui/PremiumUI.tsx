/**
 * `PremiumInput` — o que sobrou de um kit de UI que nasceu grande e não pegou.
 *
 * Até 10/09/2026 este arquivo tinha 485 linhas e ~15 componentes exportados
 * (GoldBadge, GoldCard, PremiumButton, ModalContainer, PageShell…). A auditoria
 * mediu: **um único import em todo o repo**, o desta função em `ProfilePage`.
 * Os outros nunca foram consumidos — e dois já estavam registrados em allowlists
 * de guard como "código morto, verificado", o que os manteve invisíveis.
 *
 * Componente novo aqui só com consumidor no mesmo PR. Kit de UI sem uso é a
 * duplicação que diverge do resto da tela em silêncio.
 */
'use client'

import React from 'react'

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
                    // era `surface.border` do kit removido — único token que
                    // sobrevivia a ele.
                    border: '1px solid rgba(255,255,255,0.07)',
                }}
            >
                {prefix && <span className="text-neutral-400 flex-shrink-0">{prefix}</span>}
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    aria-label={label ?? placeholder ?? 'input'}
                    disabled={disabled}
                    className="bg-transparent outline-none text-sm text-white flex-1 placeholder-neutral-600 disabled:opacity-50"
                />
                {suffix && <span className="text-neutral-400 flex-shrink-0">{suffix}</span>}
            </div>
        </div>
    )
}
