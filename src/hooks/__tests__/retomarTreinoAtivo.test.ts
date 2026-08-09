import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Retomar o treino em andamento — ago/2026, varredura no simulador.
 *
 * O card do treino ativo dizia "INICIAR TREINO" mesmo com a sessão aberta e o
 * descanso correndo no rodapé. Quem voltava ao dashboard não tinha indicação de
 * onde retomar, e o único sinal vinha DEPOIS do toque: um diálogo oferecendo
 * descartar o treino.
 *
 * O risco real não é o rótulo: é a combinação. Ao trocar o texto para
 * "CONTINUAR TREINO" sem desviar o fluxo, o usuário tocaria em continuar,
 * receberia uma confirmação com cara de "sim, continue", e `setActiveSession`
 * recriaria a sessão com `logs: {}` — perda total e silenciosa das séries.
 *
 * Por isso os dois guards andam juntos: o rótulo e a porta de saída.
 */

const RAIZ = join(__dirname, '..', '..')
const crud = readFileSync(join(RAIZ, 'hooks', 'useWorkoutCrud.ts'), 'utf8')
const card = readFileSync(join(RAIZ, 'components', 'dashboard', 'WorkoutCard.tsx'), 'utf8')
const dash = readFileSync(join(RAIZ, 'components', 'dashboard', 'StudentDashboard.tsx'), 'utf8')

const executavel = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('mesmo treino → retoma, não descarta', () => {
    const codigo = executavel(crud)

    it('compara o id clicado com o da sessão ativa', () => {
        expect(codigo).toMatch(/idClicado && idAtivo && idClicado === idAtivo/)
    })

    it('a retomada acontece ANTES do diálogo de descarte', () => {
        const idxRetoma = codigo.indexOf('idClicado === idAtivo')
        const idxDialogo = codigo.indexOf('Trocar de treino?')
        expect(idxRetoma).toBeGreaterThan(-1)
        expect(idxDialogo).toBeGreaterThan(-1)
        expect(
            idxRetoma,
            'se o diálogo vier primeiro, continuar o treino oferece descartá-lo',
        ).toBeLessThan(idxDialogo)
    })

    it('a retomada sai da função sem recriar a sessão', () => {
        // `setActiveSession` recria com `logs: {}`. Cair nele com o MESMO treino
        // apaga as séries já registradas.
        const bloco = codigo.slice(
            codigo.indexOf('idClicado === idAtivo'),
            codigo.indexOf('Trocar de treino?'),
        )
        expect(bloco).toContain('return')
        expect(bloco, 'retomar não pode passar por setActiveSession')
            .not.toContain('setActiveSession')
    })

    it('treino DIFERENTE continua pedindo confirmação', () => {
        // A porta de saída não pode virar bypass geral: com outro treino há
        // trabalho a perder e a pergunta tem que continuar.
        expect(codigo).toMatch(/if \(activeSession\?\.workout\) \{[\s\S]{0,200}confirm\(/)
    })
})

describe('o card avisa qual treino está rodando', () => {
    it('o rótulo muda para CONTINUAR', () => {
        expect(executavel(card))
            .toContain("isInProgress ? 'CONTINUAR TREINO' : 'INICIAR TREINO'")
    })

    it('a prop entra na comparação do memo', () => {
        // Sem isto o React.memo segura o card no rótulo antigo: iniciar ou
        // encerrar um treino não re-renderizaria a lista.
        expect(executavel(card)).toMatch(/a\.isInProgress === b\.isInProgress/)
    })

    it('o dashboard casa o id do treino ativo com o do card', () => {
        expect(executavel(dash))
            .toMatch(/isInProgress=\{Boolean\(\s*props\.activeWorkoutId && String\(w\?\.id \?\? ''\) === props\.activeWorkoutId/)
    })
})

describe('a pergunta de intenção some durante o treino', () => {
    it('restDayPrompt respeita hasActiveSession', () => {
        // "Vai treinar hoje?" para quem está no meio de uma série é ruído: a
        // resposta está acontecendo na tela.
        expect(executavel(dash))
            .toMatch(/!props\.nutritionActive && !props\.hasActiveSession/)
    })
})
