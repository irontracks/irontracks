import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regressão (reportado pelo dono, IMG_0059): o campo "Peso de hoje (kg)" do modal de
 * CHECK-IN pré-treino não deixava digitar vírgula (95,5) — "só números redondos". O
 * placeholder até sugeria "Ex: 85,0", mas o input tinha type="number", que num WebView
 * com locale != pt-BR REJEITA a vírgula.
 *
 * Dois invariantes:
 *  1) O input do peso do check-in NÃO pode usar type="number" (bloqueia a vírgula).
 *  2) O peso salvo tem que normalizar vírgula → ponto, senão Number("95,5") = NaN e o
 *     peso é silenciosamente descartado no cálculo calórico.
 */
const src = readFileSync('src/app/(app)/dashboard/DashboardModals.tsx', 'utf8')

describe('peso do check-in pré-treino aceita decimal (vírgula)', () => {
  it('o input precheckin-weight NÃO usa type="number"', () => {
    const idx = src.indexOf('id="precheckin-weight"')
    expect(idx).toBeGreaterThan(-1)
    // janela do JSX do input (do id até o fechamento da tag)
    const window = src.slice(idx, idx + 400)
    expect(window).not.toMatch(/type="number"/)
    expect(window).toMatch(/inputMode="decimal"/)
  })

  it('o peso salvo no check-in normaliza vírgula → ponto', () => {
    expect(src).toMatch(/weight:\s*preCheckinWeightValue\.replace\(\s*','\s*,\s*'\.'\s*\)/)
  })
})
