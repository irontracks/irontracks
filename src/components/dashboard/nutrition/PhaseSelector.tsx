'use client'

import { NUTRITION_PHASES, type NutritionPhase } from '@/lib/nutrition/phase'

export interface PhaseSelectorProps {
  /** Fase marcada agora (draft do painel, não o que está salvo). */
  value: NutritionPhase
  onSelect: (phase: NutritionPhase) => void
  /** false = a fase foi DERIVADA do objetivo de treino, o usuário nunca escolheu. */
  isExplicit?: boolean
  /** true depois do primeiro clique — dispara a dica de "confira e salve". */
  touched?: boolean
}

/**
 * Seletor de fase da dieta (Cutting / Manutenção / Off) do painel ⚙ Metas.
 *
 * Só PREENCHE os campos de meta com o recálculo do TDEE — quem grava é o botão
 * Salvar do painel. Essa separação é deliberada: aplicar direto apagaria sem aviso
 * um ajuste manual de macros que o usuário tenha feito antes.
 */
export default function PhaseSelector({ value, onSelect, isExplicit, touched }: PhaseSelectorProps) {
  const active = NUTRITION_PHASES.find(p => p.value === value)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold">Fase</span>
        {!isExplicit && !touched && (
          <span className="text-[9px] text-neutral-400">sugerida pelo seu objetivo</span>
        )}
      </div>

      <div role="radiogroup" aria-label="Fase da dieta" className="grid grid-cols-3 gap-2">
        {NUTRITION_PHASES.map(opt => {
          const isActive = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onSelect(opt.value)}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 transition active:scale-95 ${isActive
                ? 'border-yellow-500/60 bg-yellow-500/10 text-white'
                : 'border-white/[0.08] bg-white/[0.03] text-neutral-400 hover:text-white hover:border-white/20'}`}
            >
              <span className="text-xs font-bold">{opt.label}</span>
              <span className={`text-[9px] font-semibold ${isActive ? 'text-yellow-500' : 'text-neutral-400'}`}>{opt.hint}</span>
            </button>
          )
        })}
      </div>

      <p className="text-[10px] leading-snug text-neutral-400">{active?.description}</p>

      {touched && (
        <p className="text-[10px] leading-snug text-yellow-500/90">
          Metas recalculadas do seu TDEE. Ajuste se quiser e toque em Salvar.
        </p>
      )}
    </div>
  )
}
