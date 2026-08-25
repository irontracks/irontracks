'use client'

import type { ReactNode } from 'react'

/**
 * O CHASSI do card de resumo dos históricos — treino e nutrição desenham no
 * MESMO molde.
 *
 * Nasceu do pedido do dono (25/08/2026): "o histórico de refeições tem que
 * ficar com o mesmo padrão do de treinos". As duas telas respondem a mesma
 * pergunta — "como foi o meu período?" — e chegavam a ela por caminhos
 * visuais diferentes: o treino tinha um card dourado com grade de métricas e
 * pílulas de janela; a nutrição, uma faixa com dois números e botões
 * retangulares. Não era gosto: com formas diferentes, o usuário não
 * transfere o que aprendeu de uma tela para a outra.
 *
 * A alternativa — copiar o JSX do card de treino para dentro da nutrição —
 * é a mesma deriva que já produziu 86 tons de cinza e três cálculos de
 * semana neste repo. Duas cópias não divergem hoje; divergem no dia em que
 * alguém ajustar uma.
 *
 * Regra de hierarquia (`docs/DESIGN_HIERARCHY.md`): **UM destaque por
 * bloco**. `featured` marca o número acionável do card — as calorias na
 * nutrição, a contagem de treinos no histórico — e só um por vez. Guard em
 * `__tests__/historicoMesmoMolde.test.ts`.
 */

export type SummaryRangeOption = {
    key: string
    /** O que a pílula mostra. Curto: quatro delas cabem em 375pt. */
    label: string
    /** O que o leitor de tela anuncia quando o rótulo é abreviado ("7d" → "7 dias"). */
    ariaLabel?: string
}

export type SummaryMetric = {
    key: string
    label: string
    value: ReactNode
    /** 12px inline no bloco neutro; marca d'água no bloco de destaque. */
    icon?: ReactNode
    /** O ÚNICO destaque do card. */
    featured?: boolean
    /** Cor do número quando ele já carrega um código (macro). Ausente = branco. */
    valueColor?: string
}

type Props = {
    eyebrow: string
    title: string
    /** Cobertura, intervalo, ressalva — o que qualifica o título sem competir com ele. */
    subtitle?: ReactNode
    ranges?: {
        options: SummaryRangeOption[]
        value: string
        onChange: (key: string) => void
    }
    metrics: SummaryMetric[]
    /** Rodapé do card: exportação e relatórios, atrás de um separador. */
    actions?: { label: string; icon?: ReactNode; children: ReactNode }
    /** Conteúdo extra entre as pílulas e a grade (ex.: os campos de data). */
    children?: ReactNode
}

export function HistorySummaryShell({ eyebrow, title, subtitle, ranges, metrics, actions, children }: Props) {
    return (
        <div className="rounded-2xl border border-yellow-500/20 shadow-lg shadow-yellow-500/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-yellow-600/5 to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-40 h-40 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/4" />
            <div className="relative p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-yellow-500/70 font-black">{eyebrow}</div>
                        <div className="text-lg font-black tracking-tight text-white">{title}</div>
                        {subtitle && <div className="mt-0.5 text-[11px] text-neutral-400">{subtitle}</div>}
                    </div>
                    {ranges && (
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                            {ranges.options.map((opt) => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => ranges.onChange(opt.key)}
                                    aria-label={opt.ariaLabel}
                                    aria-pressed={ranges.value === opt.key}
                                    className={`tap-44 min-h-[36px] px-3 rounded-full text-[11px] font-black uppercase tracking-wider transition-all duration-300 active:scale-95 whitespace-nowrap ${ranges.value === opt.key ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30' : 'bg-neutral-900/80 border border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {children}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                    {metrics.map((m) => (
                        m.featured ? (
                            <div key={m.key} className="bg-gradient-to-br from-yellow-500/15 to-yellow-600/5 border border-yellow-500/30 rounded-xl p-3 relative overflow-hidden">
                                {m.icon && <div className="absolute top-2 right-2 opacity-10">{m.icon}</div>}
                                <div className="relative">
                                    <div className="text-[10px] uppercase tracking-wider text-yellow-500/80 font-bold">{m.label}</div>
                                    <div className="text-2xl font-black tracking-tight text-white mt-0.5 tabular-nums">{m.value}</div>
                                </div>
                            </div>
                        ) : (
                            <div key={m.key} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    {m.icon}
                                    <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">{m.label}</div>
                                </div>
                                <div
                                    className="text-xl font-black tracking-tight tabular-nums"
                                    style={m.valueColor ? { color: m.valueColor } : undefined}
                                >
                                    <span className={m.valueColor ? undefined : 'text-white'}>{m.value}</span>
                                </div>
                            </div>
                        )
                    ))}
                </div>

                {actions && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-800/70">
                        {actions.icon}
                        <span className="text-[11px] text-neutral-400 font-bold uppercase tracking-wider flex-shrink-0">{actions.label}</span>
                        <div className="flex-1" />
                        {actions.children}
                    </div>
                )}
            </div>
        </div>
    )
}
