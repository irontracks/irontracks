import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'

/**
 * Cor de macro escrita à mão — agora em CLASSE Tailwind, que o guard antigo não
 * via.
 *
 * `nutritionEntryCard.test.tsx` reprova HEX de macro dentro de componente, e é
 * por isso que a deriva reapareceu por outra sintaxe: quatro cards da aba
 * Nutrição pintavam os três macros com `text-<cor>-<n>` cru, em TRÊS esquemas
 * diferentes, e nenhum deles era o da fonte única. Medido em 27/08/2026:
 *
 *   MyDietPlan / PrescribedDietPlan   P amarelo · C âmbar   · G VERMELHO
 *   CustomFoodScanner                 P âmbar   · C laranja · G amarelo
 *   CustomFoodLibrary                 P âmbar   · C laranja · G amarelo
 *   macroColors.ts (a regra)          P âmbar   · C AZUL    · G laranja
 *
 * O pior é o vermelho na gordura: é a cor de ERRO do app, e o próprio
 * `macroColors.ts` foi escrito para matar exatamente esse bug — "um usuário com
 * 23g de gordura via um card vermelho e lia 'algo está errado'". Ele voltou por
 * uma sintaxe que o guard não cobria.
 *
 * Aqui a checagem é pela POSIÇÃO do rótulo: um `<span>` que abre com "P ",
 * "C " ou "G " seguido de número é um macro, e a cor dele tem que sair de
 * `MACRO_SURFACES`.
 */

const arquivos = execSync(
    "grep -rl 'kcal\\|protein\\|carbs\\|fat' src/components/dashboard/nutrition src/components/nutrition 2>/dev/null || true",
    { encoding: 'utf8' },
).trim().split('\n').filter(Boolean)

/** `<span className="… text-red-400 …">G {…}` — rótulo de macro com cor crua. */
const MACRO_COM_COR_CRUA =
    /className="[^"]*\btext-(red|orange|amber|yellow|blue|sky|lime|emerald|green)-\d+[^"]*"\s*>\s*(P|C|G)\s*\{/g

describe('cor de macro sai da fonte única, também em classe Tailwind', () => {
    it('o guard encontrou arquivos para medir', () => {
        expect(arquivos.length).toBeGreaterThan(3)
    })

    it('nenhum rótulo de macro escolhe a cor à mão', () => {
        const achados: string[] = []
        for (const arquivo of arquivos) {
            const src = readFileSync(arquivo, 'utf8')
            for (const m of src.matchAll(MACRO_COM_COR_CRUA)) {
                achados.push(`${arquivo}: ${m[2]} em text-${m[1]}-*`)
            }
        }
        expect(
            achados,
            'a cor vem de MACRO_SURFACES. Escrever à mão foi o que produziu três ' +
                'esquemas diferentes na mesma aba — e o VERMELHO na gordura, que é a ' +
                'cor de erro do app:\n' + achados.join('\n'),
        ).toEqual([])
    })

    /**
     * O vermelho é o alerta de estouro de meta (`MACRO_OVER_COLOR`). Se ele
     * também pintar um macro, deixa de significar alguma coisa — foi o defeito
     * original que criou este módulo.
     */
    it('vermelho não pinta macro em lugar nenhum da nutrição', () => {
        const comVermelho: string[] = []
        for (const arquivo of arquivos) {
            const src = readFileSync(arquivo, 'utf8')
            for (const m of src.matchAll(/\btext-red-\d+[^"'`]*"\s*>\s*(P|C|G)\s*\{/g)) {
                comVermelho.push(`${arquivo}: macro ${m[1]}`)
            }
        }
        expect(comVermelho, 'vermelho é estouro de meta, nunca macro').toEqual([])
    })

    it('a fonte única continua dizendo o que este guard cobra', () => {
        const fonte = readFileSync('src/lib/nutrition/macroColors.ts', 'utf8')
        expect(fonte).toMatch(/protein:\s*\{\s*surface:[^}]*label:\s*'text-amber-300'/)
        expect(fonte).toMatch(/carbs:\s*\{\s*surface:[^}]*label:\s*'text-blue-300'/)
        expect(fonte).toMatch(/fat:\s*\{\s*surface:[^}]*label:\s*'text-orange-300'/)
    })
})
