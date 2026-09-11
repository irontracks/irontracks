import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O histórico de nutrição não consulta o banco enquanto está FECHADO.
 *
 * Quarto caso da classe varrida em 10/09/2026. Aqui o defeito não era baseline,
 * era ORDEM: hooks rodam antes do `return null` do componente. O
 * `NutritionHistoryModal` era montado sem condicional
 * (`<NutritionHistoryModal open={x} …/>`), devolvia `null` fechado — mas este
 * hook já tinha disparado o SELECT em `nutrition_day_flags`, uma vez por
 * abertura da aba NUTRIÇÃO.
 *
 * O contraste que fechou o diagnóstico está no MESMO componente: o efeito
 * principal dele sempre teve `if (!open || !uid || !periodo) return`; o hook
 * irmão não tinha nada.
 *
 * Hoje há duas defesas, e as duas existem de propósito: o chamador monta
 * condicionalmente (resolve hoje) e o hook tem o parâmetro `ativo` (resolve se
 * alguém voltar a montar sempre) — e é o parâmetro que dá para testar assim.
 */

const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ gte: () => ({ lte: () => Promise.resolve({ data: [], error: null }) }) }) }),
}))
vi.mock('@/utils/supabase/client', () => ({ createClient: () => ({ from }) }))

import { useNutritionDayFlags } from '../useNutritionDayFlags'

beforeEach(() => from.mockClear())

describe('useNutritionDayFlags só vai ao banco quando a tela está aberta', () => {
    it('inativo NÃO consulta, mesmo com todos os dados prontos', () => {
        renderHook(() => useNutritionDayFlags('u1', '2026-09-01', '2026-09-30', false))

        expect(from, 'SELECT disparado com o histórico fechado').not.toHaveBeenCalled()
    })

    it('ativo consulta', () => {
        renderHook(() => useNutritionDayFlags('u1', '2026-09-01', '2026-09-30', true))

        expect(from, 'a consulta legítima deixou de acontecer').toHaveBeenCalledWith('nutrition_day_flags')
    })

    it('sem dado não consulta, com ou sem ativo', () => {
        renderHook(() => useNutritionDayFlags(undefined, null, null, true))

        expect(from).not.toHaveBeenCalled()
    })
})
