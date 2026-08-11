'use client'

/**
 * O paywall que VENDE — Fase 1 da tração (02/08/2026, aprovado pelo dono).
 *
 * O que havia nos pontos de limite: um `confirm()` de sistema no Wizard
 * ("créditos esgotados") e um X vermelho genérico no upload de exame. O dia em
 * que o usuário mais deseja a feature era respondido com um "não" seco — zero
 * venda no único momento em que vender funciona.
 *
 * Este card responde ao limite com o VALOR do que está do outro lado, por
 * feature, e mede tudo: `paywall_shown` e `paywall_cta` entram no funil junto
 * de `wizard_auto_open`/`vip_trial_granted` — em duas semanas dá para saber
 * qual elo do ciclo converte e qual quebra.
 */

import React, { useEffect } from 'react'
import { Sparkles, FlaskConical, Crown } from 'lucide-react'
import { trackUserEvent } from '@/lib/telemetry/userActivity'

export type UpsellFeature = 'wizard' | 'lab_exams'

const COPY: Record<UpsellFeature, {
    icon: typeof Sparkles
    titulo: string
    subtitulo: string
    beneficios: string[]
}> = {
    wizard: {
        icon: Sparkles,
        titulo: 'Suas gerações da semana acabaram',
        subtitulo: 'No VIP o Wizard continua montando seus treinos — com seu histórico, seu objetivo e suas restrições.',
        beneficios: [
            'VIP Start: 4 treinos por semana',
            'VIP Pro: 8 por semana + exames de sangue e macros',
            'VIP Elite: sem limite nenhum',
        ],
    },
    lab_exams: {
        icon: FlaskConical,
        titulo: 'Seu primeiro exame foi por nossa conta',
        subtitulo: 'Você já viu o que a análise entrega: marcadores lidos e protocolo de treino, dieta e suplementação. Os próximos exames são VIP.',
        beneficios: [
            'Análise completa de cada exame novo',
            'Protocolo integrado atualizado a cada resultado',
            'Disponível em todos os planos VIP',
        ],
    },
}

export function VipUpsellCard({ feature, onDismiss }: {
    feature: UpsellFeature
    /** "Agora não" — o card nunca é beco sem saída. */
    onDismiss: () => void
}) {
    const copy = COPY[feature]
    const Icon = copy.icon

    // Impressão medida no mount — sem isso não dá pra calcular conversão
    // (cta / shown) por feature.
    useEffect(() => {
        try { trackUserEvent('paywall_shown', { type: 'paywall', screen: feature }) } catch { }
    }, [feature])

    const irParaPlanos = () => {
        try { trackUserEvent('paywall_cta', { type: 'paywall', screen: feature }) } catch { }
        try { window.location.href = '/marketplace' } catch { }
    }

    return (
        <div className="rounded-2xl border border-yellow-500/25 bg-gradient-to-b from-yellow-500/10 to-transparent p-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-yellow-500/30 bg-yellow-500/10">
                <Icon className="h-6 w-6 text-yellow-400" />
            </div>
            <h3 className="mt-3 text-[16px] font-black text-white">{copy.titulo}</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-snug text-neutral-400">{copy.subtitulo}</p>

            <div className="mx-auto mt-4 max-w-sm space-y-1.5 text-left">
                {copy.beneficios.map((b) => (
                    <div key={b} className="flex items-start gap-2 text-[13px] text-neutral-300">
                        <Crown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
                        <span>{b}</span>
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={irParaPlanos}
                className="mt-5 inline-flex min-h-[46px] w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 px-4 text-[14px] font-black text-black transition-transform active:scale-[0.98]"
            >
                Conhecer os planos
            </button>
            <button
                type="button"
                onClick={onDismiss}
                className="mt-2 block w-full text-[12px] font-bold text-neutral-400 transition-colors hover:text-neutral-300"
            >
                Agora não
            </button>
        </div>
    )
}
