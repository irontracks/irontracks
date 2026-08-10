/**
 * Cor dos três macronutrientes — FONTE ÚNICA.
 *
 * Este módulo existe porque a mesma decisão foi tomada três vezes, diferente em
 * cada lugar, e as três conviviam na MESMA tela:
 *
 * - `MacroBar` (card Macronutrientes): âmbar / azul / laranja, com o comentário
 *   explícito de que vermelho é EXCLUSIVO de estouro de meta.
 * - `NutritionEntryCard` (card Lançamentos): âmbar / amarelo / **vermelho** —
 *   ou seja, o carboidrato mudava de cor entre dois cards da mesma aba, e a
 *   gordura pintava o bloco inteiro com a cor de ERRO do app. Um usuário com
 *   23g de gordura via um card vermelho e lia "algo está errado".
 * - O heatmap Treino × Nutrição tinha o seu próprio par de âmbares.
 *
 * Duas das três já foram corrigidas isoladamente e a terceira reapareceu — o
 * conserto local não resolve, porque o defeito é a AUSÊNCIA de fonte única.
 *
 * Regras:
 * - Distinção por MATIZ, nunca por brilho: dois âmbares vizinhos são a mesma cor
 *   a olho nu sob a luz de uma academia.
 * - VERMELHO NÃO É COR DE MACRO. Fica reservado a estouro de meta
 *   (`MACRO_OVER_COLOR`), senão o alerta perde o significado.
 * - `hex` para o que é desenhado (barra, gráfico); `surface`/`label` para blocos
 *   de UI. Os tons de texto ficam em 300 para passar o contraste do WCAG AA
 *   sobre o fundo escuro — os `/70` anteriores não passavam.
 */
export const MACRO_COLORS = {
  protein: '#fbbf24', // âmbar — a cor de identidade do IronTracks
  carbs: '#3b82f6',   // azul (status blue da paleta)
  fat: '#f97316',     // laranja (status orange da paleta)
} as const

/** Vermelho de ALERTA — usado só quando a meta estoura, nunca como cor de macro. */
export const MACRO_OVER_COLOR = '#ef4444'

export type MacroKey = keyof typeof MACRO_COLORS

/** Classes de bloco por macro, para quem desenha caixa em vez de barra. */
export const MACRO_SURFACES: Record<MacroKey, { surface: string; label: string }> = {
  protein: { surface: 'bg-amber-500/[0.08] border-amber-500/20', label: 'text-amber-300' },
  carbs: { surface: 'bg-blue-500/[0.08] border-blue-500/20', label: 'text-blue-300' },
  fat: { surface: 'bg-orange-500/[0.08] border-orange-500/20', label: 'text-orange-300' },
}
