/**
 * O descanso tem UM dono na tela.
 *
 * Relato do dono (17/08/2026), com print das duas barras empilhadas: em cima
 * "RECUPERAÇÃO 0:14" + anel colorido; embaixo "0:13 DESC" + anel + START. O
 * mesmo descanso, dois relógios — e **discordando em 1 segundo**, porque cada
 * um arredondava por conta própria (`Math.ceil` no rodapé).
 *
 * A duplicação não nasceu ali: sempre existiu, escondida, porque as duas
 * barras se cobriam. O #856 (que fez a de cima subir para o timer do
 * Rest-Pause ficar alcançável) pôs as duas na mesma tela e revelou.
 *
 * Regra da casa (docs/DESIGN_HIERARCHY.md): um fato aparece UMA vez, e no
 * lugar mais próximo da ação. Tempo restante fica na barra de baixo, colada no
 * START — que é o botão que encerra o descanso. O rodapé principal volta ao
 * papel dele: o tempo de TREINO, que antes sumia justamente durante o descanso.
 *
 * ⚠️ Este guard NÃO impede um cronômetro novo em qualquer lugar do app: ele
 * cobra que o RODAPÉ PRINCIPAL não derive tempo do alvo do descanso. É o ponto
 * exato onde a duplicação nasceu, e onde ela voltaria por "conveniência".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const stripComments = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const footer = stripComments(readFileSync('src/components/workout/WorkoutFooter.tsx', 'utf8'))
const barra = stripComments(readFileSync('src/components/workout/RestTimerOverlay.tsx', 'utf8'))

describe('cronômetro do descanso × rodapé do treino', () => {
    it('o rodapé NÃO lê o alvo do descanso', () => {
        // `timerTargetTime` é o instante em que o descanso acaba: quem o lê
        // está desenhando o descanso.
        expect(footer, 'o descanso é da barra de baixo — aqui vira relógio duplicado')
            .not.toMatch(/timerTargetTime/)
    })

    it('o rodapé não escreve RECUPERAÇÃO', () => {
        expect(footer).not.toMatch(/Recupera[çc][ãa]o/i)
    })

    /**
     * 18/08/2026: o dono apontou que o tempo de treino aparecia no rodapé E no
     * topo — o MESMO `elapsedSeconds` desenhado duas vezes. O rodapé perdeu o
     * cronômetro (e a pausa foi junto, para acompanhar o número que controla).
     * Hoje ele tem uma ação só: Finalizar.
     */
    it('o rodapé não desenha cronômetro nenhum', () => {
        expect(footer, 'o tempo de treino mora no cabeçalho').not.toMatch(/formatElapsed\(/)
        expect(footer).not.toMatch(/'Exercício'\s*:\s*'Treino'/)
    })

    it('o tempo de treino é desenhado no cabeçalho', () => {
        const header = stripComments(readFileSync('src/components/workout/WorkoutHeader.tsx', 'utf8'))
        expect(header).toMatch(/formatElapsed\(elapsedSeconds\)/)
    })

    /**
     * `elapsedSeconds` continua sendo LIDO aqui — é o número que o histórico
     * grava ao finalizar, e ele tem que ser o mesmo que o usuário viu no topo.
     */
    it('o rodapé ainda finaliza com o tempo que o usuário viu', () => {
        expect(footer).toMatch(/finishWorkout\(elapsedSeconds\)/)
    })

    /**
     * A outra ponta: se a barra de baixo parar de mostrar o tempo, o usuário
     * fica SEM cronômetro nenhum — o rodapé não cobre mais esse buraco.
     */
    it('a barra do descanso continua sendo quem mostra o tempo restante', () => {
        expect(barra).toMatch(/timeLeft/)
        // O rótulo do anel ('desc' — sobe para DESC via uppercase no CSS) e o
        // número que ele mostra.
        expect(barra).toMatch(/'desc'/)
        expect(barra).toMatch(/formatDuration\(baseSeconds\)/)
    })

    it('o "+extra" também tem um dono só', () => {
        expect(footer, 'o tempo além do planejado é da barra do descanso').not.toMatch(/recoveryExtra/)
        expect(barra).toMatch(/além do planejado/)
    })
})

/**
 * O rodapé do treino tem UMA ação.
 *
 * Relato do dono (18/08/2026), com print: "o card com o tempo do treino, o
 * botão finalizar e o X estão redundantes — o tempo total temos lá no topo, e
 * dois botões no mesmo card que fazem a mesma coisa pra quê?".
 *
 * Metade da premissa estava certa e metade não, e as duas levaram ao mesmo
 * corte: o TEMPO era mesmo o `elapsedSeconds` desenhado duas vezes; já o X e o
 * Finalizar faziam coisas OPOSTAS (descartar × salvar) — e é justamente por
 * parecerem iguais que o arranjo era perigoso, com o destrutivo sendo o mudo.
 *
 * Descartar foi para o menu "…"; ação rara e irreversível não mora ao lado da
 * ação primária.
 */
describe('rodapé do treino — uma ação', () => {
    it('não sobrou botão destrutivo no rodapé', () => {
        expect(footer, 'descartar mora no menu "…", com rótulo por extenso')
            .not.toMatch(/cancelWorkout/)
    })

    it('a única ação do rodapé é finalizar', () => {
        const botoes = [...footer.matchAll(/<button/g)].length
        expect(botoes, 'rodapé com mais de um botão volta a competir com o Finalizar').toBe(1)
    })

    it('descartar existe no menu do cabeçalho, escrito por extenso', () => {
        const header = stripComments(readFileSync('src/components/workout/WorkoutHeader.tsx', 'utf8'))
        expect(header).toMatch(/Descartar treino/)
        expect(header).toMatch(/cancelWorkout/)
    })

    /**
     * Mirar o NOME (`togglePause`) não bastava: ele continua na desestruturação
     * do hook mesmo se ninguém chamar. A primeira versão deste caso passou
     * verde com a chamada amputada — procure a CHAMADA, não o identificador.
     */
    it('a pausa acompanhou o cronômetro para o cabeçalho', () => {
        const header = stripComments(readFileSync('src/components/workout/WorkoutHeader.tsx', 'utf8'))
        expect(header, 'o botão precisa CHAMAR togglePause, não só importá-lo')
            .toMatch(/togglePause\(\)/)
        expect(header).toMatch(/aria-label=\{isPaused \? 'Retomar treino' : 'Pausar treino'\}/)
        expect(footer, 'pausa sem cronômetro ao lado é botão órfão').not.toMatch(/togglePause/)
    })
})

/**
 * A forma do CTA que sobrou.
 *
 * Depois que o rodapé ficou com uma ação só, o botão herdou o `justify-end` da
 * época em que era um de quatro — e virou um retângulo pequeno encostado na
 * quina de uma barra de borda a borda. O dono viu na hora: "todo torto,
 * sozinho ali no card".
 *
 * Uma superfície inteira que hospeda um elemento ocupando um terço dela não lê
 * como decisão; lê como sobra. O CTA ocupa a barra — mesma anatomia do START
 * do descanso logo abaixo —, e a hierarquia entre os dois continua vindo da
 * COR (neutro com série pendente, dourado quando fecha), não da largura.
 */
describe('forma do Finalizar', () => {
    it('ocupa a barra inteira', () => {
        const bloco = footer.slice(footer.indexOf('finishWorkout(elapsedSeconds)'))
        expect(bloco).toMatch(/w-full inline-flex items-center justify-center/)
    })

    it('não sobrou alinhamento de fileira no contêiner', () => {
        expect(footer, 'justify-end era para quando havia quatro elementos')
            .not.toMatch(/max-w-6xl mx-auto flex items-center justify-end/)
    })

    it('o peso continua na cor, não no tamanho', () => {
        // Dourado sólido só quando o treino fecha; antes disso, neutro.
        expect(footer).toMatch(/allDone[\s\S]{0,200}from-yellow-400 to-amber-400/)
        expect(footer).toMatch(/bg-neutral-900 border border-neutral-700/)
    })
})
