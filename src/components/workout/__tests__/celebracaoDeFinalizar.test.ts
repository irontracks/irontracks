import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A celebração de finalizar o treino.
 *
 * ⚠️ O caso mais importante deste arquivo é o do GATILHO. O app já teve uma tela
 * de vitória e ela foi REMOVIDA em 03/09/2026 (#1061) porque nascia
 * `useState(true)`: comemorava toda vez que qualquer relatório era aberto,
 * inclusive um treino de duas semanas atrás no histórico. Recriar a celebração
 * sem travar isso seria repor o mesmo defeito com outra roupa.
 */
const SRC = join(__dirname, '..', '..', '..')
const celebra = readFileSync(join(SRC, 'components/workout/WorkoutFinishCelebration.tsx'), 'utf8')
const report = readFileSync(join(SRC, 'components/WorkoutReport.tsx'), 'utf8')
const client = readFileSync(join(SRC, 'app/(app)/dashboard/IronTracksAppClientImpl.tsx'), 'utf8')

describe('só comemora finalização DE VERDADE', () => {
    it('o relatório não decide sozinho — recebe o sinal de fora', () => {
        expect(report).toMatch(/justFinished\?: boolean/)
        // O defeito antigo: `useState(true)`. Hoje o estado nasce do sinal.
        expect(report).toMatch(/useState\(\(\) => justFinished === true\)/)
    })

    it('não sobrou o padrão que causou o defeito de 03/09/2026', () => {
        expect(report, 'celebração ligada por padrão comemora histórico').not.toMatch(/useState\(true\)/)
    })

    it('o sinal vem do carimbo da finalização, não de "abriu o relatório"', () => {
        expect(client).toMatch(/justFinished=\{Date\.now\(\) - justFinishedAtRef\.current < FINISH_CELEBRATION_MS\}/)
    })

    /**
     * Janela PRÓPRIA, separada da de navegação (30 s). Reusar acoplaria duas
     * decisões sem relação: um dia alguém mexe no prazo da navegação e muda,
     * sem querer, quando o app comemora.
     */
    it('a janela da celebração é curta e independente da navegação', () => {
        const ms = Number(client.match(/FINISH_CELEBRATION_MS = ([\d_]+)/)?.[1]?.replace(/_/g, ''))
        expect(ms, 'a constante da celebração sumiu').toBeGreaterThan(0)
        expect(ms).toBeLessThanOrEqual(10_000)
        expect(client).toMatch(/FINISH_NAV_GRACE_MS = 30_000/)
    })
})

describe('o som respeita o usuário e o aparelho', () => {
    it('usa a fanfarra que já existia sem consumidor', () => {
        expect(celebra).toMatch(/playFinishSound/)
    })

    /**
     * Web Audio TRANSITÓRIO, não player nativo: segurar a sessão de áudio já
     * quebrou a notificação de tela bloqueada e roubou o foco do Spotify aqui.
     */
    it('não usa o caminho nativo, que segura a sessão de áudio', () => {
        expect(celebra).not.toMatch(/playAlarmSound|AVAudio/)
    })

    it('quem desligou o som do app não é surpreendido', () => {
        expect(celebra).toMatch(/soundEnabled/)
        expect(report).toMatch(/enableSounds !== false/)
    })

    it('falha de áudio não derruba a celebração', () => {
        // Em iOS o AudioContext pode estar interrompido (ligação, Siri).
        expect(celebra).toMatch(/catch \{ \/\* som é acessório \*\/ \}/)
    })
})

/**
 * ⚠️ Estes casos medem VALOR com limiar, não casam a string do dia.
 *
 * A primeira versão fixava `scale(0.35)` e a curva de overshoot literal — e as
 * duas eram exatamente o que o pedido do dono de 05/09/2026 apagou. Guard
 * ancorado no que a próxima mudança faz DESAPARECER fica sem alvo e vira ruído
 * a ser deletado (jeito nº 6 da lista de guards falsos). O que precisa
 * sobreviver a qualquer ajuste de gosto é o INVARIANTE: nasce quase em ponto,
 * cresce devagar, sobre fundo sem transparência.
 */
describe('a frase NASCE no centro e vem crescendo', () => {
    const numeroDe = (re: RegExp) => Number(celebra.match(re)?.[1])

    it('nasce quase em ponto — não é um zoom curto disfarçado', () => {
        const escala = numeroDe(/ESCALA_INICIAL = ([\d.]+)/)
        expect(escala, 'a escala inicial sumiu do módulo').toBeGreaterThan(0)
        // Em 0,35 a frase já entrava legível e o efeito lia como "apareceu
        // maior", que foi o que o dono recusou.
        expect(escala, 'começar grande demais mata a leitura de profundidade').toBeLessThanOrEqual(0.1)
        expect(celebra).toMatch(/transform: scale\(\$\{ESCALA_INICIAL\}\)/)
    })

    it('a entrada é LENTA — é o tempo que compra a impressão de profundidade', () => {
        const ms = numeroDe(/MS_ENTRADA = (\d+)/)
        expect(ms, 'a entrada voltou a ser curta demais para ler como emergência').toBeGreaterThanOrEqual(1200)
    })

    it('parte devagar e desacelera no fim — sem overshoot', () => {
        const curva = celebra.match(/celebra-nasce \$\{MS_ENTRADA\}ms cubic-bezier\(([\d., ]+)\)/)?.[1]
        expect(curva, 'a curva da entrada sumiu').toBeTruthy()
        const [x1, y1, , y2] = (curva ?? '').split(',').map((n) => Number(n.trim()))
        // Partida lenta: no primeiro terço do tempo a frase mal muda de tamanho,
        // que é como um objeto distante se comporta.
        expect(y1, 'a curva está puxando o começo — vira pop, não emergência').toBeLessThanOrEqual(0.15)
        expect(x1).toBeGreaterThan(0)
        // Overshoot passa de 1 no controle final. O repique é vocabulário de
        // "pipocou"; aqui a frase POUSA no tamanho normal.
        expect(y2, 'overshoot voltou — a frase bate no tamanho em vez de pousar').toBeLessThanOrEqual(1)
    })

    it('o fundo é INFINITO: opaco, sem borda que denuncie a camada', () => {
        expect(celebra).toMatch(/background: '#0a0a0a'/)
        expect(celebra, 'fundo com alpha deixa o relatório transparecer por trás').not.toMatch(/background: 'rgba\(/)
    })

    /**
     * "Só a frase" (pedido do dono). O nome do treino era um terceiro bloco em
     * outro corpo e outra cor: com ele, o que cresce na tela são três coisas, e
     * a leitura deixa de ser uma frase nascendo.
     */
    it('mostra só a frase — nada de nome do treino junto', () => {
        expect(celebra).not.toMatch(/workoutTitle/)
        expect(report).not.toMatch(/workoutTitle=\{workoutTitleMain\}/)
    })

    /**
     * ⚠️ O defeito que o dono viu no iPhone: a frase encostada no RODAPÉ.
     * `.tap-44` é `position: relative` e vence o `absolute` do Tailwind (mesma
     * especificidade, declarada depois no globals.css), então o botão de
     * dispensar virava item de flex com `h-full` e comia a coluna inteira.
     */
    it('o botão de dispensar não rouba o centro da tela', () => {
        const botao = celebra.match(/<button[\s\S]*?\/>/)?.[0] ?? ''
        expect(botao, 'o botão de dispensar sumiu').toContain('inset-0')
        expect(botao, 'tap-44 é position:relative e empurra a frase para o rodapé').not.toContain('tap-44')
    })

    it('usa a tipografia e a cor do app', () => {
        expect(celebra).toMatch(/font-black uppercase/)
        expect(celebra).toMatch(/text-yellow-500|text-yellow-400/)
    })

    it('sai sozinha e também no toque — não prende o usuário', () => {
        expect(celebra).toMatch(/onClick=\{encerrarAgora\}/)
        expect(celebra).toMatch(/setTimeout/)
    })

    /**
     * Quem atende movimento reduzido aqui é o JS (`reduzMovimento`) mais o reset
     * global do `globals.css`. A media query que vivia neste arquivo mirava em
     * `[class*="celebra"]` e não casava com elemento nenhum — as animações são
     * inline. CSS morto com cara de proteção engana quem passa depois.
     */
    it('respeita movimento reduzido', () => {
        expect(celebra).toMatch(/reduzMovimento/)
        expect(celebra).toMatch(/prefers-reduced-motion: reduce/)
        const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
        expect(css, 'o reset global de movimento reduzido sumiu').toMatch(/prefers-reduced-motion:\s*reduce/)
    })
})
