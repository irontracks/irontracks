/**
 * A tela de fim de descanso ("BORA!") — hierarquia, contraste e alarme.
 *
 * Revisão de design de 05/09/2026 (Dr. Marcus Vane). Três defeitos, os três
 * medidos e não opinados:
 *
 *  1. **Hierarquia invertida.** O maior tipo da tela repetia o que o alarme e a
 *     cor já tinham dito ("BORA!"), e o dado que o atleta precisa de pé na
 *     academia — QUAL CARGA — não estava em lugar nenhum. Num app que CALCULA
 *     esse peso (motor de carga automática), esconder o número no único instante
 *     em que ele decide a ação seguinte é desperdiçar o que se construiu.
 *  2. **Contraste abaixo do AA.** `bg-green-600/90` sobre `#0a0a0a` resolve em
 *     `#159444` (luminância 0,218): 3,92:1 com branco. "PRÓXIMA" em `white/70`
 *     media **2,70:1** e a dica de toque em `white/55`, **2,20:1** — reprovados
 *     (mín. 4,5:1 para texto pequeno). `green-700` sólido mede **5,01:1**, e
 *     sobre ele só o BRANCO PURO passa: `white/90` cai para 4,38:1. Por isso a
 *     hierarquia aqui é feita por TAMANHO e PESO, nunca por opacidade de texto.
 *  3. **A camada nasce sozinha e não se anunciava.** Sem `role="status"`, o
 *     descanso termina em silêncio absoluto para quem usa VoiceOver.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import RestTimerOverlay, { SEGUNDOS_ATE_ALARME_DE_EXCESSO } from '../RestTimerOverlay'

vi.mock('@/lib/sounds', () => ({ playTimerFinishSound: vi.fn(), playTick: vi.fn() }))
vi.mock('@/utils/platform', () => ({ isNativePlatform: () => false }))
vi.mock('@/lib/workout/restEndPush', () => ({ scheduleRestEndPush: vi.fn(), cancelRestEndPush: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarnRemote: vi.fn(), logWarn: vi.fn() }))
vi.mock('@/utils/native/irontracksNative', () => ({
    addWidgetStartSetListener: vi.fn(() => () => {}),
    cancelRestNotification: vi.fn(async () => undefined),
    checkPendingWidgetAction: vi.fn(async () => null),
    endRestLiveActivity: vi.fn(async () => undefined),
    requestNativeNotifications: vi.fn(async () => undefined),
    scheduleRestNotification: vi.fn(async () => ''),
    startRestLiveActivity: vi.fn(async () => ''),
    stopAlarmSound: vi.fn(async () => undefined),
    triggerHaptic: vi.fn(async () => undefined),
    updateRestLiveActivity: vi.fn(async () => undefined),
    updateWorkoutRestCountdown: vi.fn(async () => undefined),
}))

const PROXIMA = {
    exerciseName: 'Chest press máquina',
    setLabel: '2ª série',
    label: '2ª série de Chest press máquina',
    weight: '84 kg',
    reps: '6-10',
    rpe: '8',
}

const montar = (ctx: Record<string, unknown>, segundosDesdeOFim = 1) =>
    render(
        <RestTimerOverlay
            targetTime={Date.now() - segundosDesdeOFim * 1000}
            context={ctx as never}
            settings={{}}
            onClose={vi.fn()}
            onFinish={vi.fn()}
            onStart={vi.fn()}
        />,
    )

const avancar = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(1200) }) }

describe('a tela mostra O QUE FAZER, não só que acabou', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
    afterEach(() => { vi.useRealTimers() })

    it('carga, reps e RPE da próxima série chegam à tela', async () => {
        montar({ kind: 'rest', next: PROXIMA })
        await avancar()
        // A fiação é o ponto: `descreverProximaSerie` passa verde sozinho
        // enquanto ninguém liga o resultado dele à tela.
        expect(screen.getByText('84 kg')).toBeTruthy()
        expect(screen.getByText('6-10')).toBeTruthy()
        expect(screen.getByText('carga')).toBeTruthy()
        expect(screen.getByText('reps')).toBeTruthy()
    })

    it('o exercício é o HERÓI — tipo maior que o do grito', async () => {
        const { container } = montar({ kind: 'rest', next: PROXIMA })
        await avancar()
        const heroi = screen.getByRole('heading', { level: 1 })
        expect(heroi.textContent).toContain('Chest press máquina')
        expect(heroi.className).toContain('text-3xl')
        // "Bora" existe, mas como eyebrow — o menor tipo da tela.
        const grito = Array.from(container.querySelectorAll('p')).find((p) => /bora/i.test(p.textContent || ''))
        expect(grito?.className, 'o grito não pode voltar a ser o maior elemento').toContain('text-xs')
    })

    it('sem peso conhecido, NÃO inventa "0 kg" — o bloco some', async () => {
        montar({ kind: 'rest', next: { ...PROXIMA, weight: '', reps: '', rpe: '' } })
        await avancar()
        expect(screen.queryByText('carga')).toBeNull()
        expect(screen.queryByText(/0 kg/)).toBeNull()
        // O que a pessoa precisa saber continua na tela.
        expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Chest press máquina')
    })

    it('sessão antiga (só `nextSetLabel`) ainda desenha o exercício', async () => {
        // Compatibilidade: uma sessão restaurada de antes desta versão não tem
        // `next`. Cair em tela vazia seria trocar um defeito por outro pior.
        montar({ kind: 'rest', nextSetLabel: '2ª série de Chest press máquina' })
        await avancar()
        expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Chest press')
    })

    it('descanso de LADO não fala de próxima série', async () => {
        montar({ kind: 'side_rest', next: PROXIMA })
        await avancar()
        expect(screen.getByText(/outro lado/i)).toBeTruthy()
        expect(screen.queryByText('84 kg')).toBeNull()
    })

    it('a camada se anuncia para o leitor de tela', async () => {
        // Ela nasce sozinha, sem toque nenhum: sem isto o descanso acaba em
        // silêncio para quem usa VoiceOver.
        montar({ kind: 'rest', next: PROXIMA })
        await avancar()
        const flash = screen.getByRole('status')
        expect(flash.getAttribute('aria-live')).toBe('assertive')
    })
})

describe('o vermelho é alarme, não marcação de zero', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
    afterEach(() => { vi.useRealTimers() })

    const corDoAnel = (container: HTMLElement): string =>
        container.querySelectorAll('circle')[1]?.getAttribute('stroke') ?? ''

    it('no instante em que o descanso acaba, o anel NÃO está vermelho', async () => {
        const { container } = montar({ kind: 'rest', next: PROXIMA }, 1)
        await avancar()
        expect(corDoAnel(container), '+0:00 em vermelho repreende quem não se atrasou').not.toBe('#ef4444')
    })

    it('passado o limiar, aí sim vira alarme', async () => {
        const { container } = montar({ kind: 'rest', next: PROXIMA }, SEGUNDOS_ATE_ALARME_DE_EXCESSO + 5)
        await avancar()
        expect(corDoAnel(container)).toBe('#ef4444')
    })

    it('o limiar é curto o bastante para ainda ser útil', () => {
        expect(SEGUNDOS_ATE_ALARME_DE_EXCESSO).toBeGreaterThan(5)
        expect(SEGUNDOS_ATE_ALARME_DE_EXCESSO).toBeLessThanOrEqual(60)
    })
})

/**
 * ⚠️ Este describe existe porque o resto do arquivo passou VERDE com a fiação
 * cortada. `descreverProximaSerie` (puro) e a tela (render) são as duas PONTAS;
 * quem as liga é o `startTimer` do controller, e apagar o `ctx.next = proxima`
 * de lá deixava tudo verde com a carga sumida da tela — o jeito nº 3 da lista
 * de guards falsos, medido por mutação nesta mesma sessão.
 *
 * O limite, declarado: é source-guard. Montar `useActiveWorkoutController` de
 * verdade exigiria os contextos de diálogo, equipe e os seis sub-hooks — o teste
 * mediria o harness. O comportamento se prova no aparelho.
 */
describe('fiação: o controller entrega a próxima série ao overlay', () => {
    const controller = readFileSync(
        join(process.cwd(), 'src/components/workout/useActiveWorkoutController.ts'),
        'utf8',
    )
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, '')

    const bloco = controller.slice(
        controller.indexOf('const startTimer'),
        controller.indexOf('const startTimer') + 2200,
    )

    it('o bloco do startTimer existe (senão o guard fica cego)', () => {
        expect(bloco).toContain('onStartTimer')
    })

    it('usa a fonte única, e não uma segunda cópia da regra', () => {
        expect(bloco).toContain('descreverProximaSerie(')
    })

    it('lê os logs pela REF, não pelo estado do render', () => {
        // No instante da conclusão o React pode não ter processado a última
        // escrita, e o peso que o motor acabou de sugerir chegaria vazio.
        expect(bloco).toMatch(/logs:\s*logsRef\.current/)
    })

    it('entrega os CAMPOS, não só a frase', () => {
        // `nextSetLabel` sozinho é a tela antiga: nome e nada mais.
        expect(bloco).toMatch(/ctx\.next\s*=/)
    })
})

describe('contraste do flash (guard de forma — o de cor não alcança fundo colorido)', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/components/workout/RestTimerOverlay.tsx'), 'utf8')
    /**
     * ⚠️ Reduzir ao código EXECUTÁVEL antes de casar. Os comentários deste bloco
     * explicam por que `backdrop-blur` e `text-white/55` são proibidos ali — e a
     * primeira versão deste guard reprovou justamente por causa da própria
     * documentação que ele existe para justificar. É o jeito nº 2 da lista de
     * guards falsos do CLAUDE.md, cometido no mesmo arquivo que o descreve.
     */
    const semComentarios = (s: string) =>
        s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
    // Só o bloco do flash: a barra inferior é preta e tem outras regras.
    const bloco = semComentarios(
        fonte.slice(fonte.indexOf('{isFinished && !isTransition'), fonte.indexOf('perf: fundo sólido')),
    )

    it('o bloco existe (senão este guard fica cego)', () => {
        expect(bloco.length).toBeGreaterThan(500)
    })

    it('fundo SÓLIDO nos tons medidos — nada de opacidade nem blur', () => {
        // `green-700` = 5,01:1 com branco; `green-600` = 3,92:1 (reprova AA).
        // E o blur cobrava o efeito mais caro do WKWebView para deixar passar 10%.
        expect(bloco).toContain('bg-green-700')
        expect(bloco).toContain('bg-amber-700')
        expect(bloco).not.toMatch(/bg-(green|amber)-\d00\/\d/)
        expect(bloco).not.toContain('backdrop-blur')
    })

    it('texto do flash é branco PURO — nem alpha na cor, nem `opacity`', () => {
        /**
         * ⚠️ Medido no navegador, com o markup real e `getComputedStyle`, DEPOIS
         * de a primeira correção parecer pronta: trocar `text-white/70` por
         * `opacity-90` não muda nada opticamente. Os números sobre `green-700`:
         *
         *   branco puro ............ 5,02:1  ✓
         *   com `opacity-90` ....... 4,39:1  ✗
         *   com `opacity-80` ....... 3,81:1  ✗
         *
         * As duas sintaxes ficam proibidas no bloco. A hierarquia aqui se faz
         * por TAMANHO e PESO (12px/500 → 30px/900 → 36px/900), que é o que a
         * tela precisava desde o começo.
         */
        expect(bloco).not.toMatch(/text-white\/\d/)
        expect(bloco).not.toMatch(/\bopacity-\d/)
    })

    it('a hierarquia dos números tem UM destaque', () => {
        // A carga é a única que exige ação física; reps e RPE são alvo. Três
        // números do mesmo tamanho é o mesmo defeito da tela antiga, um degrau
        // abaixo (docs/DESIGN_HIERARCHY.md).
        const grandes = bloco.match(/text-4xl/g) || []
        expect(grandes.length, 'só a carga pode ser o maior número do bloco').toBe(1)
    })
})
