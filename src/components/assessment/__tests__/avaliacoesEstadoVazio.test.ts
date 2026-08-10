import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Estado vazio das Avaliações — varredura no simulador, ago/2026.
 *
 * Dois problemas na mesma tela, e o segundo é um beco sem saída:
 *
 * 1. O texto dizia "Este aluno ainda não possui avaliações físicas registradas"
 *    para o PRÓPRIO aluno, que abre essa tela pela aba Avaliações. Ele lia sobre
 *    si mesmo na terceira pessoa, na voz do professor.
 *
 * 2. O menu de ações é um acordeão FECHADO por padrão. Sem nenhuma avaliação, o
 *    card anunciava "Nenhuma avaliação encontrada" e o único caminho para criar
 *    a primeira — "+ Nova Avaliação" — ficava escondido atrás de um título que
 *    não parece clicável. Quem nunca fez uma avaliação é exatamente quem vê essa
 *    tela, e não tinha como sair dela.
 */

const DIR = join(__dirname, '..')
const historico = readFileSync(join(DIR, 'AssessmentHistory.tsx'), 'utf8')
const header = readFileSync(join(DIR, 'AssessmentHeader.tsx'), 'utf8')
const app = readFileSync(
    join(DIR, '..', '..', 'app', '(app)', 'dashboard', 'IronTracksAppClientImpl.tsx'),
    'utf8',
)

const executavel = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('a ação primária fica alcançável', () => {
    it('o header aceita nascer aberto', () => {
        const codigo = executavel(header)
        expect(codigo).toMatch(/defaultOpen\?: boolean/)
        // O estado inicial precisa VIR da prop; `useState(false)` fixo ignora
        // o pedido e o botão continua escondido.
        expect(codigo).toContain('useState(defaultOpen)')
        expect(codigo).not.toMatch(/const \[open, setOpen\] = useState\(false\)/)
    })

    it('o estado vazio pede o menu aberto', () => {
        // Recorta o ramo `assessments.length === 0`, para não confundir com o
        // header da tela COM histórico (que segue fechado de propósito).
        const codigo = executavel(historico)
        const i = codigo.indexOf('assessments.length === 0')
        const bloco = codigo.slice(i, codigo.indexOf('LabExamsSection', i))
        expect(bloco).toContain('defaultOpen')
    })

    it('com histórico o acordeão continua fechado', () => {
        // Ali a lista é o conteúdo principal; abrir o menu por cima seria ruído.
        const codigo = executavel(historico)
        const segundo = codigo.lastIndexOf('<AssessmentHeader')
        const bloco = codigo.slice(segundo, segundo + 600)
        expect(bloco).not.toContain('defaultOpen')
    })
})

describe('a voz do texto acompanha quem está lendo', () => {
    it('o componente sabe quando é o próprio aluno', () => {
        expect(executavel(historico)).toMatch(/selfView\?: boolean/)
    })

    it('o dashboard do aluno marca selfView', () => {
        expect(executavel(app)).toMatch(/<AssessmentHistory[^>]*selfView/)
    })

    it('a terceira pessoa só sobra no contexto do professor', () => {
        const codigo = executavel(historico)
        // O texto antigo continua válido em `/assessments/[studentId]`, onde
        // quem lê é o professor — mas atrás da condição, nunca solto.
        expect(codigo).toMatch(/selfView[\s\S]{0,200}Este aluno ainda não possui/)
    })
})
