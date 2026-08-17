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

    it('o rodapé mostra o tempo de TREINO (ou o do exercício em execução)', () => {
        expect(footer).toMatch(/'Exercício'\s*:\s*'Treino'/)
        expect(footer).toMatch(/elapsedSeconds/)
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
