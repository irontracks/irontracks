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
    const rodape = normalSet.slice(
        normalSet.indexOf('<div className="mt-1 flex items-center justify-between gap-2">'),
        normalSet.indexOf('Lista de métodos'),
    )

    it('método e falha compartilham a linha', () => {
        expect(rodape).toContain('per_set_method')
        expect(rodape).toContain('{failureToggle}')
    })

    it('o seletor de método não tem mais faixa própria', () => {
        expect(normalSet, 'o comentário do bloco antigo sumiu junto com a linha extra')
            .not.toContain('{/* Per-set method picker */}')
    })

    it('a lista de opções abre fora do flex', () => {
        const idxLinha = normalSet.indexOf('<div className="mt-1 flex items-center justify-between gap-2">')
        const idxLista = normalSet.indexOf('Lista de métodos')
        expect(idxLista, 'a lista precisa vir depois da linha, não dentro dela').toBeGreaterThan(idxLinha)
    })
})

describe('chip de falha', () => {
    it('é um estado, não uma pergunta', () => {
        expect(failureToggle, '"Falha?" lia como se o app perguntasse algo')
            .not.toContain("'Falha?'")
        expect(failureToggle).toContain("'Falha'")
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
