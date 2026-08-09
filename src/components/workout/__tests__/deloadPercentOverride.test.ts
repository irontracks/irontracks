import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
    DELOAD_REDUCTION_MIN,
    DELOAD_REDUCTION_MAX,
    DELOAD_REDUCTION_OVERTRAIN,
    DELOAD_REDUCTION_STAGNATION,
    DELOAD_REDUCTION_STABLE,
} from '@/components/workout/utils'

/**
 * Porcentagem de descarga escolhida pelo usuário — ago/2026.
 *
 * O banner oferecia um botão único ("Reduzir 22% no treino de hoje") e nenhuma
 * forma de discordar. O 22% nunca foi arbitrário: é o `DELOAD_REDUCTION_OVERTRAIN`,
 * escolhido porque o motor diagnosticou queda de carga. Estagnação daria 15%.
 *
 * A ARMADILHA desta mudança, e o motivo destes guards existirem: a redução real
 * NÃO vem do número exibido no banner. `applyDeloadToSession` recalcula por
 * exercício dentro de `buildDeloadSuggestion`. Colocar os atalhos na tela sem
 * repassar a escolha até lá produziria o pior resultado possível — o botão
 * dizendo 10% e o peso caindo 22%, silenciosamente, no dado mais sensível do
 * app. Nenhum teste de render pegaria isso.
 */

const DIR = join(__dirname, '..')
const hook = readFileSync(join(DIR, 'hooks', 'useWorkoutDeload.ts'), 'utf8')
const banner = readFileSync(join(DIR, 'SessionDeloadBanner.tsx'), 'utf8')

/** Reduz ao código executável — comentários aqui citam os padrões proibidos. */
const executavel = (src: string) =>
    src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, '')

describe('a escolha do usuário chega até o cálculo', () => {
    it('buildDeloadSuggestion aceita override', () => {
        expect(executavel(hook)).toMatch(/buildDeloadSuggestion\s*=\s*\(([\s\S]{0,400}?)overridePct/)
    })

    it('applyDeloadToSession aceita e REPASSA o override', () => {
        const codigo = executavel(hook)
        expect(codigo).toMatch(/applyDeloadToSession\s*=\s*async\s*\([^)]*overridePct/)
        // A fiação: sem o 4º argumento aqui, o parâmetro existe e não faz nada.
        expect(
            codigo,
            'sem repassar, o banner mostra 10% e o app aplica os 22% do diagnóstico',
        ).toMatch(/buildDeloadSuggestion\(\s*ex as WorkoutExercise,\s*exIdx,\s*null,\s*overridePct\s*\)/)
    })

    it('o banner passa a porcentagem ao aplicar', () => {
        expect(executavel(banner))
            .toMatch(/applyDeloadToSession\(\s*sessionDeloadModal\.selected,\s*sessionDeloadModal\.suggestedPct\s*\)/)
    })

    it('o modal recebe a porcentagem ESCOLHIDA, não a sugerida', () => {
        // `suggestedPct: pct / 100` — `pct` já é `pctEscolhida ?? pctSugerido`.
        // Voltar para `sessionDeloadAlert.suggestedPct` descartaria a escolha.
        const codigo = executavel(banner)
        expect(codigo).toContain('suggestedPct: pct / 100')
        expect(codigo).toContain('const pct = pctEscolhida ?? pctSugerido')
    })
})

describe('limites — as duas superfícies concordam', () => {
    it('o override usa os MESMOS limites do ajuste manual por exercício', () => {
        // 5–40% já valia no modal por exercício (`updateDeloadModalFromPercent`).
        // Se o banner aceitasse outro intervalo, o mesmo app teria duas regras.
        expect(executavel(hook))
            .toMatch(/clampNumber\(overridePct,\s*DELOAD_REDUCTION_MIN,\s*DELOAD_REDUCTION_MAX\)/)
    })

    it('os limites são os valores esperados', () => {
        expect(DELOAD_REDUCTION_MIN).toBe(0.05)
        expect(DELOAD_REDUCTION_MAX).toBe(0.4)
    })

    it('os atalhos oferecidos cabem no intervalo válido', () => {
        for (const v of [10, 15, 22, 30]) {
            expect(v / 100).toBeGreaterThanOrEqual(DELOAD_REDUCTION_MIN)
            expect(v / 100).toBeLessThanOrEqual(DELOAD_REDUCTION_MAX)
        }
    })
})

describe('o diagnóstico do motor continua valendo', () => {
    it('sem escolha do usuário, a porcentagem vem do status', () => {
        const codigo = executavel(hook)
        // O ternário do override precisa PRECEDER o do diagnóstico, e o
        // diagnóstico precisa sobreviver — é ele que diferencia 22% de 15%.
        expect(codigo).toContain('DELOAD_REDUCTION_OVERTRAIN')
        expect(codigo).toContain('DELOAD_REDUCTION_STAGNATION')
        expect(codigo).toContain('DELOAD_REDUCTION_STABLE')
        expect(codigo).toMatch(/typeof overridePct === 'number'/)
    })

    it('os três níveis do diagnóstico são distintos', () => {
        // Colapsar dois deles faria o motor "diagnosticar" sem consequência.
        const niveis = new Set([
            DELOAD_REDUCTION_STABLE,
            DELOAD_REDUCTION_STAGNATION,
            DELOAD_REDUCTION_OVERTRAIN,
        ])
        expect(niveis.size).toBe(3)
        expect(DELOAD_REDUCTION_OVERTRAIN).toBeGreaterThan(DELOAD_REDUCTION_STAGNATION)
        expect(DELOAD_REDUCTION_STAGNATION).toBeGreaterThan(DELOAD_REDUCTION_STABLE)
    })

    it('o sugerido nunca some da lista de atalhos', () => {
        // Se o motor sugerir 12% (STABLE), o usuário tem que conseguir voltar
        // a ele depois de experimentar outro valor.
        expect(executavel(banner)).toMatch(/new Set\(\[10, 15, 22, 30, pctSugerido\]\)/)
    })
})

describe('a escolha não vira preferência permanente', () => {
    it('o estado é local do componente, não persistido', () => {
        const codigo = executavel(banner)
        expect(codigo).toMatch(/useState<number \| null>\(null\)/)
        expect(codigo, 'gravar a escolha faria o diagnóstico virar decoração')
            .not.toMatch(/localStorage|user_settings|preferences/)
    })
})
