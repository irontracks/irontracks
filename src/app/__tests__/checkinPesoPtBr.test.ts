import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O peso do check-in pré-treino aparece em pt-BR — no campo também.
 *
 * A mesma tela mostrava três formatos do mesmo número: o campo vinha com
 * **"94.6"** (`String(94.6)`, ponto do JavaScript), o texto logo abaixo dizia
 * **"94,6 kg"** (`formatKgPtBr`) e o placeholder ensinava **"Ex: 85,0"**.
 *
 * É só exibição — o salvamento normaliza vírgula → ponto em
 * `preCheckinResolvedDraft`, porque `Number("95,5")` é `NaN` e o peso sumiria do
 * cálculo calórico. O que estava errado era o app ensinar vírgula e escrever
 * ponto.
 */

const SRC = readFileSync(
    join(process.cwd(), 'src/app/(app)/dashboard/DashboardModals.tsx'),
    'utf8',
)
const semComentarios = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/** O corpo de `preCheckinWeightValue`, que monta o valor inicial do campo. */
const blocoDoValor = (): string => {
    const at = semComentarios.indexOf('const preCheckinWeightValue')
    expect(at, 'o valor do campo de peso sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
    return semComentarios.slice(at, semComentarios.indexOf('})()', at))
}

describe('peso do check-in', () => {
    it('o campo é preenchido em pt-BR, como o texto e o placeholder ao lado', () => {
        expect(blocoDoValor()).toMatch(/formatKgPtBr\(/)
    })

    it('não volta a usar String() cru — é ele que põe o ponto', () => {
        expect(
            blocoDoValor(),
            'String(94.6) devolve "94.6"; a tela inteira usa vírgula',
        ).not.toMatch(/String\(profileBodyWeightKg\)/)
    })

    it('salvar continua normalizando para ponto — Number("95,5") é NaN', () => {
        expect(semComentarios).toMatch(/weight:\s*preCheckinWeightValue\.replace\(',',\s*'\.'\)/)
    })
})
