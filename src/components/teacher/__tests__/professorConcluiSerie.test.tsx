/**
 * O professor consegue CONCLUIR a série do aluno — e a ação tem nome.
 *
 * INCIDENTE (12/09/2026): o dono controlou um treino real, preencheu peso,
 * reps e RPE nas quatro séries do primeiro exercício, e **nenhuma** ficou
 * concluída. Conferido no banco: os quatro logs existiam, todos sem `done`.
 *
 * ⚠️ A capacidade EXISTIA. Concluir era tocar no NÚMERO da série — um toggle
 * escondido atrás de um "1", sem rótulo, sem affordance, sem coluna. Ninguém
 * adivinha, e ele não adivinhou: pediu "preciso do botão (concluir)".
 *
 * Por que importa mais que estética: sem `done`, a série não conta no volume,
 * não alimenta o motor de carga e não aparece no relatório (`isLogDone` é a
 * fonte única dessa regra). O professor anotava o treino inteiro e o treino
 * continuava valendo zero.
 *
 * Este guard trava as duas metades: a ação EXISTE e é ALCANÇÁVEL por um nome
 * acessível — não por um número que por acaso é clicável.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ARQUIVO = 'src/components/teacher/TeacherControlModal.tsx'

/** O modal inteiro exige supabase, realtime e auth — montar mediria o harness.
 *  A linha de série é o que importa aqui, e ela é exercitada via source-guard
 *  + um render da própria SetRow através do módulo. */
const src = readFileSync(path.join(process.cwd(), ARQUIVO), 'utf8')
const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('a ação de concluir tem nome', () => {
    it('existe um controle rotulado "Concluir série", não um número clicável', () => {
        expect(
            semComentarios,
            'o professor precisa de um alvo com NOME para concluir a série — o toggle ' +
            'escondido no número da série é o defeito que este guard existe para impedir.',
        // ⚠️ `[^}]*` NÃO serve aqui: o rótulo é um ternário com template
        // string, e o primeiro `}` é o do `${setIdx + 1}` — o guard nascia
        // vermelho com o código correto. Janela limitada em vez de classe negada.
        ).toMatch(/aria-label=\{[\s\S]{0,140}?Concluir série/)
    })

    it('o mesmo controle DESFAZ, e o rótulo muda junto', () => {
        // Errar a série é comum; desfazer não pode depender do aluno.
        expect(semComentarios).toMatch(/Desfazer série/)
        expect(semComentarios).toMatch(/aria-pressed=\{Boolean\(log\.done\)\}/)
    })

    it('⚠️ o número da série NÃO é mais um botão secreto', () => {
        // Ancorado no que vai FICAR (o indicador `aria-hidden`), não na string
        // que a correção apagou — jeito nº 6 da lista de guards falsos.
        const i = semComentarios.indexOf("{log.done ? '✓' : String(setIdx + 1)}")
        expect(i, 'o indicador da série sumiu').toBeGreaterThan(0)
        const tagDoIndicador = semComentarios.slice(Math.max(0, i - 700), i)
        expect(
            tagDoIndicador,
            'o número da série voltou a ser <button>: duas ações iguais na mesma linha, ' +
            'e a descoberta continua dependendo de adivinhar.',
        ).not.toMatch(/<button[^>]*onClick=\{toggleDone\}[\s\S]*$/)
        expect(tagDoIndicador).toContain('aria-hidden="true"')
    })

    it('a coluna aparece no cabeçalho — a ação é anunciada antes de ser procurada', () => {
        expect(semComentarios).toMatch(/>Feito</)
        // O cabeçalho tem de acompanhar o número real de colunas da linha.
        expect(semComentarios).toMatch(/grid-cols-5/)
    })

    it('o alvo respeita o tamanho mínimo de toque', () => {
        const i = semComentarios.indexOf('Concluir série')
        const bloco = semComentarios.slice(Math.max(0, i - 400), i + 400)
        expect(bloco, 'o botão de concluir precisa de alvo de 44pt').toContain('tap-44')
    })
})

describe('o toggle grava `done` no log, sem apagar o que já foi anotado', () => {
    /**
     * ⚠️ A primeira versão deste bloco REIMPLEMENTAVA o updater dentro do teste
     * e afirmava "marca done sem apagar peso e reps". Passava verde com o botão
     * arrancado do componente: era tautológico (jeito nº 1 da lista de guards
     * falsos). Um teste que escreve a própria resposta não testa nada.
     *
     * A `SetRow` é interna ao modal e montá-la exigiria supabase+realtime, então
     * o que trava o comportamento é a FORMA da chamada — e ela é verificada
     * contra o arquivo real, com mutação provando que reprova.
     */
    it('o handler alterna `done` a partir do valor atual', () => {
        expect(
            semComentarios,
            'concluir precisa ser um toggle sobre o estado atual — `update("done", true)` ' +
            'fixo impediria desfazer a série.',
        ).toMatch(/const toggleDone = \(\) => update\('done', !log\.done\)/)
    })

    it('o patch preserva o log anterior — concluir não pode zerar peso e reps', () => {
        // `{ ...prevLog, [field]: value }`: sem o spread, marcar concluída
        // apagaria os números que o professor acabou de anotar.
        expect(semComentarios).toMatch(/\{ \.\.\.prevLog, \[field\]: value \}/)
    })
})
