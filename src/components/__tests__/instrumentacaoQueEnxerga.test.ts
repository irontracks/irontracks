import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dois eventos que existiam e não respondiam a pergunta para a qual foram
 * criados. Medido no banco em 30/08/2026.
 *
 * 1. `nav_loop` detectou até **76 voltas** num caso e gravava só a tela e a
 *    contagem — nunca ENTRE QUAIS telas. O problema voltou quatro vezes em três
 *    meses, e a cada volta o diagnóstico recomeçava do zero.
 *
 * 2. `wizard_abandoned`: **53 aberturas, 12 treinos criados, 3 abandonos
 *    registrados**. As 38 saídas restantes eram descartadas por uma guarda que
 *    ignorava quem fechava na etapa 0 — o caso mais comum.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (f: string) =>
    f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const PERF = semComentarios(ler('src/components/PerformanceReporter.tsx'))
const WIZARD = semComentarios(ler('src/components/dashboard/WorkoutWizardModal.tsx'))

describe('nav_loop diz ENTRE QUAIS telas', () => {
    it('grava o ciclo', () => {
        const at = PERF.indexOf('"nav_loop"')
        expect(at, 'o evento sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
        expect(PERF.slice(at, at + 400)).toMatch(/ciclo:/)
    })

    it('o ciclo colapsa repetições consecutivas', () => {
        // Sem isso, uma tela visitada 40 vezes seguidas viraria 40 entradas
        // iguais e o par que ricocheteia ficaria ilegível.
        expect(PERF).toMatch(/ciclo\[ciclo\.length - 1\] !== p\.path/)
    })

    it('e tem teto — a janela é de 60s e loop apertado enche a lista', () => {
        expect(PERF).toMatch(/ciclo\.slice\(-\d+\)/)
    })

    it('a contagem que já existia continua', () => {
        const at = PERF.indexOf('"nav_loop"')
        expect(PERF.slice(at, at + 400)).toMatch(/count,/)
    })
})

describe('wizard_abandoned enxerga a etapa 0', () => {
    it('não descarta mais quem fecha sem interagir', () => {
        // Era a guarda que escondia 38 das 41 saídas.
        expect(
            WIZARD,
            'a guarda voltou — abandono na etapa 0 fica invisível de novo',
        ).not.toMatch(/if \(!deepestStepRef\.current && !hasStartedRef\.current\) return/)
    })

    it('mas separa quem MEXEU de quem só olhou', () => {
        // O ruído não some: fica identificável. Filtrar por `interagiu`
        // devolve o número antigo; ignorá-lo devolve o total.
        const at = WIZARD.indexOf("'wizard_abandoned'")
        expect(at).toBeGreaterThan(-1)
        expect(WIZARD.slice(at, at + 400)).toMatch(/interagiu: hasStartedRef\.current/)
    })

    it('e continua registrando o passo mais fundo', () => {
        const at = WIZARD.indexOf("'wizard_abandoned'")
        expect(WIZARD.slice(at, at + 400)).toMatch(/deepestStep: deepestStepRef\.current/)
    })

    it('quem criou o treino não conta como abandono', () => {
        // `outcome` continua sendo o filtro que separa saída de sucesso.
        expect(WIZARD).toMatch(/outcomeRef\.current !== 'pending'/)
    })
})
