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
        /**
         * Antes este caso mirava na frase "além do planejado" — que era a
         * SEGUNDA exibição do mesmo número, removida em 27/08/2026 por
         * duplicar o anel e ainda contradizê-lo na cor (vermelho no anel,
         * verde no texto).
         *
         * O invariante não mudou: quem mostra o tempo extra é a barra do
         * descanso, e só ela. O que mudou foi a âncora — agora aponta para o
         * contador que ficou, no anel, em vez de para a cópia que saiu.
         */
        expect(barra).toMatch(/formatDuration\(extraSeconds\)/)
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
 * A forma do CTA que sobrou — segunda revisão (18/08/2026).
 *
 * Primeiro ele era um retângulo pequeno na quina de uma barra de borda a borda
 * ("todo torto, sozinho ali no card"). Virou largura total — e aí o rodapé
 * ficou com DUAS barras empilhadas, ~220px de preto no pé da tela para uma
 * ação tocada uma vez por sessão ("muito grosso e muita área preta sobrando").
 *
 * As duas críticas apontam para a mesma regra: **peso de superfície tem que
 * ser proporcional à frequência de uso.** O descanso é permanente e ganha
 * barra; o Finalizar é terminal e ganha um pill — altura de um alvo de toque,
 * largura do conteúdo, sem faixa.
 */
describe('forma do Finalizar', () => {
    it('não tem faixa: nada de fundo sólido ou borda de topo no contêiner', () => {
        const contêiner = footer.slice(footer.indexOf('fixed left-0 right-0'), footer.indexOf('max-w-6xl'))
        expect(contêiner, 'a segunda barra dobrava a altura do rodapé').not.toMatch(/bg-neutral-950|border-t/)
    })

    it('a faixa transparente não rouba o toque do conteúdo atrás', () => {
        const contêiner = footer.slice(footer.indexOf('fixed left-0 right-0'), footer.indexOf('max-w-6xl'))
        expect(contêiner).toMatch(/pointer-events-none/)
        expect(footer, 'o botão precisa voltar a receber toque').toMatch(/pointer-events-auto/)
    })

    it('é um pill fino, com alvo de 44pt garantido pelo tap-44', () => {
        const bloco = footer.slice(footer.indexOf('disabled={finishing}'), footer.indexOf('<Save size='))
        expect(bloco, '36px de altura visual').toMatch(/\bh-9\b/)
        expect(bloco, 'a área de toque não pode encolher junto').toMatch(/tap-44/)
        expect(bloco).toMatch(/rounded-full/)
        expect(bloco, 'largura total era a barra que acabou de sair').not.toMatch(/\bw-full\b/)
    })

    /**
     * `pb-safe` num elemento ELEVADO (o rodapé sobe a altura da barra do
     * descanso) vira ~34px de preto só embaixo — foi o que fez o botão parecer
     * descentralizado no #861. Safe-area é para quem encosta no chão da tela.
     */
    it('não aplica safe-area num rodapé que não toca o chão', () => {
        const contêiner = footer.slice(footer.indexOf('fixed left-0 right-0'), footer.indexOf('max-w-6xl'))
        expect(contêiner).not.toMatch(/pb-safe/)
    })

    it('a sombra separa o pill da lista que passa por baixo', () => {
        const bloco = footer.slice(footer.indexOf('disabled={finishing}'), footer.indexOf('<Save size='))
        expect(bloco, 'sem faixa, é a sombra que impede texto sobre texto').toMatch(/shadow-lg/)
    })

    it('o peso continua na cor, não no tamanho', () => {
        expect(footer).toMatch(/allDone[\s\S]{0,200}from-yellow-400 to-amber-400/)
        expect(footer).toMatch(/bg-neutral-900\/90 border border-neutral-700/)
    })

    it('a lista reserva espaço para o rodapé que existe HOJE', () => {
        const lista = readFileSync('src/components/workout/ExerciseList.tsx', 'utf8')
        // 160px reservavam duas barras. Com o pill, sobrava vazio no fim.
        expect(lista).toMatch(/paddingBottom:\s*'calc\(env\(safe-area-inset-bottom, 0px\) \+ 112px\)'/)
    })
})
