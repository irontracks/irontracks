import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Densidade da série — sprint 4 da auditoria de design, ago/2026.
 *
 * Cada série ocupava TRÊS faixas verticais: os campos, o chip de falha e o
 * seletor de método. As duas últimas são metadados que raramente se toca — e
 * com 18 séries por sessão, isso dobrava a rolagem entre uma carga e a
 * seguinte, num app usado de pé, entre séries, com o celular numa mão.
 *
 * Método e falha agora dividem a mesma linha. A lista de opções continua
 * abrindo abaixo: dentro do flex, ela empurraria o chip de falha ao expandir.
 */

const SRC = join(__dirname, '..', '..', '..')
const normalSet = readFileSync(join(SRC, 'components', 'workout', 'set-renderers', 'normalSet.tsx'), 'utf8')
const failureToggle = readFileSync(join(SRC, 'components', 'workout', 'set-renderers', 'FailureToggle.tsx'), 'utf8')

/** Só o código EXECUTÁVEL: o comentário do arquivo cita o 💥 antigo para
 *  explicar o bug que ele causava, e um guard ingênuo casaria com a própria
 *  documentação — o erro nº 2 da lista de guards falsos do CLAUDE.md. */
const executavel = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

describe('rodapé da série', () => {
    // O `<PlateHintLine` do ramo UNILATERAL aparece antes deste rodapé no
    // arquivo — fatiar pela primeira ocorrência devolvia string vazia, e o
    // teste passaria a medir nada.
    const inicioRodape = normalSet.indexOf('<div className="mt-1 flex items-center justify-between gap-2">')
    const rodape = normalSet.slice(inicioRodape, normalSet.indexOf('<PlateHintLine', inicioRodape))

    it('método e falha compartilham a linha', () => {
        // Em 24/08/2026 o seletor virou o widget `SetMethodPicker` (o JSX solto
        // daqui sumia quando a série trocava de renderer, e não havia como
        // voltar para Normal). A DENSIDADE não mudou: ele continua no mesmo
        // rodapé, ao lado da falha, sem faixa própria.
        expect(rodape).toContain('<SetMethodPicker')
        expect(rodape).toContain('{failureToggle}')
    })

    it('o seletor de método não tem mais faixa própria', () => {
        expect(normalSet, 'o comentário do bloco antigo sumiu junto com a linha extra')
            .not.toContain('{/* Per-set method picker */}')
    })

    it('a série NORMAL não ganha um segundo seletor vindo do card', () => {
        // O card desenha o picker para os outros 13 renderers; se desenhasse
        // também na normal, seria a terceira faixa vertical de volta — com 18
        // séries por sessão, o dobro de rolagem que esta auditoria tirou.
        const card = readFileSync(join(SRC, 'components', 'workout', 'ExerciseCard.tsx'), 'utf8')
        expect(card).toMatch(/label === ''\s*\|\|\s*label === 'Normal'/)
    })

    it('a lista de opções abre fora do flex', () => {
        // Agora é responsabilidade do widget: o botão e a lista são irmãos
        // dentro dele, e a lista vem DEPOIS (dentro do flex, ela empurraria o
        // chip de falha ao expandir).
        const picker = readFileSync(join(SRC, 'components', 'workout', 'set-renderers', 'SetMethodPicker.tsx'), 'utf8')
        expect(picker.indexOf('{open && (')).toBeGreaterThan(picker.indexOf('aria-expanded={open}'))
    })
})

describe('chip de falha', () => {
    it('é um estado, não uma pergunta', () => {
        // `executavel` tira comentários: o cabeçalho do módulo EXPLICA por que
        // "Falha?" saiu, e um guard que casa com a própria documentação acusa o
        // texto que o defende (armadilha nº 2 do repo).
        expect(executavel(failureToggle), '"Falha?" lia como se o app perguntasse algo')
            .not.toContain('Falha?')
        // O rótulo é texto JSX direto desde que a variante só-ícone caiu
        // (19/08/2026) — antes era a string `'Falha'` condicionada ao `compact`.
        expect(failureToggle).toMatch(/\bFalha\b/)
    })

    it('o rótulo não muda de largura ao alternar', () => {
        // Texto que troca entre "Falha" e "Falha?" faz o alvo dançar debaixo do
        // polegar — em pé, entre séries, isso custa toque errado.
        expect(failureToggle).not.toMatch(/failed \? 'Falha' : 'Falha\?'/)
    })

    it('usa ícone lucide, não emoji', () => {
        expect(failureToggle).toContain('<Flame')
        expect(executavel(failureToggle), 'emoji no JSX renderizado').not.toContain('💥')
    })

    it('o estado continua acessível por aria-pressed', () => {
        expect(failureToggle).toContain('aria-pressed={failed}')
    })
})
