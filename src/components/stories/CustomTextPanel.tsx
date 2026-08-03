'use client'

import React from 'react'
import { CUSTOM_TEXT_MAX_CHARS } from './customText'

/**
 * Campo da legenda livre do Story.
 *
 * O texto sai na tipografia do template escolhido — o pedido do dono era que o
 * story já fosse "100% personalizado para o insta", sem passar por outro editor.
 *
 * O teto de caracteres é aplicado no ESTADO (`clampCustomText`), não só aqui: colar
 * um texto gigante não pode furar o limite por passar longe do `onChange`.
 */

interface CustomTextPanelProps {
    value: string
    onChange: (v: string) => void
    /** A legenda passou da área segura do Instagram? Avisa, não bloqueia. */
    overflowing?: boolean
}

export function CustomTextPanel({ value, onChange, overflowing }: CustomTextPanelProps) {
    const used = Array.from(value ?? '').length
    const left = CUSTOM_TEXT_MAX_CHARS - used

    return (
        <div className="w-full space-y-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-semibold">
                    Sua legenda
                </span>
                <span
                    className={`text-[10px] font-semibold tabular-nums ${left <= 20 ? 'text-yellow-400' : 'text-neutral-500'}`}
                >
                    {left}
                </span>
            </div>

            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={3}
                maxLength={CUSTOM_TEXT_MAX_CHARS}
                placeholder="Escreva algo para sair no story…"
                aria-label="Legenda do story"
                className="w-full resize-none rounded-xl bg-black/30 border border-neutral-700 px-3 py-2 text-[16px] text-white placeholder:text-neutral-500 outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50 transition"
            />

            <p className="text-[10px] leading-snug text-neutral-500">
                Sai na fonte do estilo escolhido. Arraste na prévia para posicionar.
            </p>

            {overflowing && (
                // Aviso, não bloqueio: cortar a frase do usuário seria pior do que
                // deixá-lo encurtar ou mover.
                <p className="text-[10px] leading-snug text-yellow-400">
                    A legenda passou da área segura — o Instagram pode cortar. Encurte ou arraste para cima.
                </p>
            )}
        </div>
    )
}
