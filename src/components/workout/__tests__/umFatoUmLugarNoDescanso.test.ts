import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * O tempo extra do descanso aparecia duas vezes, em cores opostas.
 *
 * O mesmo `+2:31` era desenhado no anel — com o rótulo "extra" em VERMELHO — e
 * repetido a centímetros dali como "+2:31 além do planejado" em VERDE.
 *
 * Não é só a duplicação (um fato aparece uma vez, `docs/DESIGN_HIERARCHY.md`):
 * as duas cópias se CONTRADIZEM. Vermelho é alarme, verde é sucesso, e o app
 * afirmava as duas coisas sobre o mesmo número. Nenhuma se sustenta — passar do
 * descanso planejado não é conquista.
 *
 * Ficou o anel, que é o lugar natural do contador. O espaço liberado é dos
 * botões, que já disputam a faixa com o rodapé do treino ativo.
 */

const src = readFileSync(join(__dirname, '..', 'RestTimerOverlay.tsx'), 'utf8')
const executavel = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

describe('o tempo extra é dito uma vez só', () => {
    it('existe exatamente uma renderização de +extraSeconds', () => {
        const ocorrencias = executavel.match(/\+\$\{formatDuration\(extraSeconds\)\}/g) || []
        expect(ocorrencias, 'o mesmo número em dois lugares — e em cores opostas').toHaveLength(1)
    })

    it('a que ficou é a do anel', () => {
        const i = executavel.indexOf('+${formatDuration(extraSeconds)}')
        // O anel desenha o contador central com `ringColor`.
        expect(executavel.slice(Math.max(0, i - 500), i)).toMatch(/ringColor/)
    })

    it('nenhum verde celebra o estouro do descanso', () => {
        // `text-green-400` no "além do planejado" dizia que passar do tempo é bom.
        expect(executavel).not.toMatch(/text-green-\d+[^"]*">\{`\+\$\{formatDuration/)
        expect(executavel).not.toMatch(/além do planejado/)
    })
})

describe('a identificação da tabela do relatório não sai da tela', () => {
    const tabela = readFileSync(
        join(__dirname, '..', '..', 'workout-report', 'ReportExerciseTable.tsx'), 'utf8')

    it('as duas primeiras colunas são ancoradas', () => {
        // 15 colunas com rolagem horizontal: sem âncora, arrastar para a direita
        // some com o NOME do exercício — a única coluna que dá sentido às outras.
        expect(tabela).toMatch(/<th className="sticky left-0[^"]*">#<\/th>/)
        expect(tabela).toMatch(/<th className="sticky left-\[44px\][^"]*">Exercício<\/th>/)
        expect(tabela).toMatch(/<td className="sticky left-0[^"]*font-mono/)
        expect(tabela).toMatch(/<td className="sticky left-\[44px\][^"]*font-semibold/)
    })

    it('a célula ancorada tem fundo opaco', () => {
        // Sem fundo, o conteúdo das outras colunas passa por baixo ao rolar.
        const ths = [...tabela.matchAll(/<th className="sticky[^"]*"/g)].map((m) => m[0])
        const tds = [...tabela.matchAll(/<td className="sticky[^"]*"/g)].map((m) => m[0])
        expect(ths.length + tds.length).toBe(4)
        for (const c of [...ths, ...tds]) expect(c, c).toMatch(/bg-neutral-9\d0/)
    })

    it('o contêiner continua rolando', () => {
        expect(tabela).toMatch(/overflow-x-auto/)
    })
})
