import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * O app dava veredicto clínico em cada dobra a partir do milímetro CRU.
 *
 * `< 8 mm` era "Baixa", `> 35 mm` era "Elevada", e no meio "Normal" — com borda
 * VERDE, como se medir 20 mm fosse uma conquista. O mesmo corte para as sete
 * dobras, para os dois sexos e para todas as idades.
 *
 * Cada um destes invalida o rótulo sozinho:
 *
 * - **Sítio**: tríceps de 20 mm é banal, subescapular de 20 mm é outra coisa.
 * - **Sexo**: a distribuição de gordura é diferente; 25 mm não dizem o mesmo.
 * - **Idade**: as equações de Jackson & Pollock corrigem por idade exatamente
 *   porque a mesma soma dá percentuais diferentes.
 *
 * E o app TEM idade e sexo — usa os dois no cálculo da densidade corporal. Ele
 * sabia e opinava sem usar. Uma mulher com suprailíaca de 36 mm, valor normal
 * para ela, lia "Elevada" em amarelo.
 *
 * O veredicto correto já existe e é o outro: o %BF da equação, que considera
 * soma, idade e sexo. A dobra individual não precisa julgar — só precisa não
 * estar obviamente errada, e é isso que restou: 3 mm e 50 mm são limites de
 * PLAUSIBILIDADE de adipômetro, não de saúde.
 */

const src = readFileSync(join(__dirname, '..', 'SkinfoldStep.tsx'), 'utf8')
const executavel = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

describe('a dobra não recebe veredicto clínico', () => {
    it('os rótulos de julgamento sumiram', () => {
        for (const veredicto of ["'Baixa'", "'Normal'", "'Elevada'"]) {
            expect(executavel, `${veredicto} exige sítio, sexo e idade — que este rótulo não tem`).not.toContain(veredicto)
        }
    })

    it('os cortes intermediários sumiram junto', () => {
        // Eram `< 8` e `> 35`: os números que separavam "baixa" de "normal" de
        // "elevada" sem saber de quem nem de qual dobra.
        expect(executavel).not.toMatch(/numValue < 8\b/)
        expect(executavel).not.toMatch(/numValue > 35\b/)
    })

    it('a checagem de plausibilidade FICA — é a única que o app pode fazer', () => {
        expect(executavel).toMatch(/numValue < 3\b/)
        expect(executavel).toMatch(/numValue > 50\b/)
        expect(executavel).toMatch(/confira a medição/)
    })
})

describe('cor não vira elogio nem alarme', () => {
    /**
     * O escopo é o INDICADOR DE STATUS, não o arquivo.
     *
     * A primeira versão proibia vermelho no arquivo inteiro e acusava a
     * validação de formulário (`errors[campo] ? 'border-red-500'`) — que é uso
     * correto: ali o vermelho é erro de verdade. Guard largo demais é o que
     * alguém afrouxa na primeira semana.
     */
    const statusColorido = (() => {
        const i = executavel.indexOf('const statusBorder')
        const j = executavel.indexOf('const effectiveValue')
        return executavel.slice(i, j > i ? j : i + 900)
    })()

    it('o guard encontrou as funções de status', () => {
        expect(statusColorido).toContain('statusBorder')
        expect(statusColorido).toContain('statusTextColor')
    })

    it('nenhum verde: registrar uma dobra não é acerto', () => {
        expect(statusColorido).not.toMatch(/green-/)
    })

    it('nenhum vermelho: valor implausível é atenção, não erro sem volta', () => {
        expect(statusColorido).not.toMatch(/red-/)
    })

    it('só o implausível recebe cor, e ela é âmbar', () => {
        expect(executavel).toMatch(/implausivel\(status\)\s*\?\s*'border-amber/)
        expect(executavel).toMatch(/implausivel\(status\)\s*\?\s*'text-amber/)
    })

    it('valor plausível não desenha linha de status nenhuma', () => {
        // Com o veredicto fora, o texto fica vazio: um ponto cinza ao lado de
        // um span vazio seria ruído.
        expect(executavel.match(/\{implausivel\(status\) && \(/g) || []).toHaveLength(2)
        expect(executavel).not.toMatch(/\{status !== 'empty' && \(/)
    })
})
