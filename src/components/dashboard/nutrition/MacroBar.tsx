'use client'

/** Cores de CATEGORIA dos macros — todas da paleta do app, mutuamente distinguíveis. */
export const MACRO_COLORS = {
  protein: '#fbbf24', // âmbar — a cor de identidade do IronTracks
  carbs: '#3b82f6',   // azul (status blue da paleta)
  fat: '#f97316',     // laranja (status orange da paleta)
} as const

/** Vermelho de ALERTA — usado só quando a meta estoura, nunca como cor de macro. */
export const MACRO_OVER_COLOR = '#ef4444'

const safeNumber = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const clamp01 = (n: number): number => {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export interface MacroBarProps {
  label: string
  value: number
  goal: number
  /** Cor da categoria — use MACRO_COLORS. */
  color: string
}

/**
 * Barra de progresso de um macronutriente.
 *
 * Três decisões que valem explicação, porque a versão anterior errava nas três:
 *
 * 1. COR É CATEGORIA, VERMELHO É ALERTA. A gordura era `#ef4444` — a mesma cor que
 *    o app usa para erro. Em `0/74g` o usuário lia "algo está errado" quando o
 *    número só dizia "você ainda não comeu gordura hoje". Agora o vermelho é
 *    EXCLUSIVO de estouro. E proteína (`#fbbf24`) e carboidrato (`#f59e0b`) eram
 *    indistinguíveis a olho nu, ainda mais sob a luz de uma academia: duas
 *    categorias, uma cor. O carbo foi para o azul e a gordura para o laranja.
 *
 * 2. O ATLETA PERGUNTA "QUANTO FALTA", NÃO "QUAL A RAZÃO". `0/208g` exige subtração
 *    mental no meio do dia. O card de calorias logo acima já diz "Restam X kcal" —
 *    esta barra passa a falar a mesma língua da tela em que vive.
 *
 * 3. BARRA VAZIA PRECISA COMUNICAR VAZIO. Com 1,5px de altura e trilho a 4% de
 *    branco, 0% era um sulco invisível: parecia componente quebrado, não estado
 *    inicial. O trilho ganhou presença própria, e qualquer valor > 0 rende pelo
 *    menos 2% de barra — senão 1g de 208g desenha nada e mente sobre o registro.
 */
export default function MacroBar({ label, value, goal, color }: MacroBarProps) {
  const sVal = safeNumber(value)
  const sGoal = Math.max(1, safeNumber(goal))
  const pct = Math.round(clamp01(sVal / sGoal) * 100)
  const over = sVal > sGoal
  const diff = Math.round(Math.abs(sGoal - sVal))

  // Quanto do excesso mostrar em vermelho, sobreposto à barra cheia: comunica
  // "bateu a meta E passou" em vez de pintar tudo de vermelho, o que apagaria a
  // informação de que a meta foi atingida.
  const overPct = over ? Math.min(100, Math.round(((sVal - sGoal) / sGoal) * 100)) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-neutral-400">{label}</span>
        <span className="text-sm font-bold tabular-nums text-white">
          {Math.round(sVal)}
          <span className="text-xs font-medium text-neutral-500"> / {Math.round(sGoal)} g</span>
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <div
          className="relative h-2 flex-1 rounded-full bg-white/[0.07] overflow-hidden"
          role="progressbar"
          aria-label={label}
          aria-valuenow={Math.round(sVal)}
          aria-valuemin={0}
          aria-valuemax={Math.round(sGoal)}
          aria-valuetext={`${Math.round(sVal)} de ${Math.round(sGoal)} gramas, ${pct}%${over ? `, ${diff} gramas acima da meta` : ''}`}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.max(pct, sVal > 0 ? 2 : 0)}%`, backgroundColor: color }}
          />
          {over && (
            <div
              className="absolute inset-y-0 right-0 rounded-r-full transition-all duration-500 ease-out"
              style={{ width: `${overPct}%`, backgroundColor: MACRO_OVER_COLOR }}
            />
          )}
        </div>

        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-neutral-400 min-w-[5.5rem] text-right">
          {over ? (
            <span className="text-red-400">+{diff} g acima</span>
          ) : (
            <>
              <span style={{ color }}>{pct}%</span>
              <span className="text-neutral-500"> · faltam {diff} g</span>
            </>
          )}
        </span>
      </div>
    </div>
  )
}
