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

describe('a animação', () => {
    it('entra em ZOOM a partir do centro, com overshoot', () => {
        expect(celebra).toMatch(/@keyframes celebra-zoom/)
        expect(celebra).toMatch(/transform: scale\(0\.35\)/)
        // O `back` na curva é o que faz a frase CHEGAR, não só ficar maior.
        expect(celebra).toMatch(/cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/)
    })

    it('usa a tipografia e a cor do app', () => {
        expect(celebra).toMatch(/font-black uppercase/)
        expect(celebra).toMatch(/text-yellow-500|text-yellow-400/)
    })

    it('sai sozinha e também no toque — não prende o usuário', () => {
        expect(celebra).toMatch(/onClick=\{encerrarAgora\}/)
        expect(celebra).toMatch(/setTimeout/)
    })

    it('respeita movimento reduzido', () => {
        expect(celebra).toMatch(/prefers-reduced-motion: reduce/)
        expect(celebra).toMatch(/reduzMovimento/)
    })
})
