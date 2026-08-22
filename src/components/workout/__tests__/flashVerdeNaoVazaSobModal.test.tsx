/**
 * O flash verde "BORA!" não nasce com um modal de método aberto.
 *
 * Sintoma (print do dono, 22/08/2026): preenchendo as etapas de um Drop-Set, o
 * descanso terminou e a tela ficou VERDE ESCURA atrás do modal. O flash é
 * `fixed inset-0 z-[2000] bg-green-600/90`; o modal é `z-[2350]` com backdrop
 * `bg-black/80` — 80% de preto sobre verde dá aquele verde escuro. O flash
 * ficava embaixo, sem comunicar nada e sujando a tela de quem digitava.
 *
 * Os dois casos que importam, e o segundo é o que um teste ingênuo perde: o
 * modal já aberto quando o descanso acaba, e o modal aberto DEPOIS (o usuário
 * toca em "preencher" com o verde na tela).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import RestTimerOverlay from '../RestTimerOverlay'
import { shouldSuppressFinishedFlash, hasOpenModalDialog } from '../helpers/flashSuppression'

vi.mock('@/lib/sounds', () => ({ playTimerFinishSound: vi.fn(), playTick: vi.fn() }))
vi.mock('@/utils/platform', () => ({ isNativePlatform: () => false }))
vi.mock('@/lib/workout/restEndPush', () => ({ scheduleRestEndPush: vi.fn(), cancelRestEndPush: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarnRemote: vi.fn(), logWarn: vi.fn() }))
// Tudo async: o overlay encadeia `.catch()` em várias dessas chamadas, e um
// mock síncrono derruba o componente com "cannot read properties of undefined".
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

const FLASH = /BORA!/i

const montarDescansoTerminando = () =>
    render(
        <RestTimerOverlay
            // 1s à frente: o efeito interno cruza o zero e marca `isFinished`.
            targetTime={Date.now() + 1000}
            context={{ kind: 'rest' } as never}
            settings={{}}
            onClose={vi.fn()}
            onFinish={vi.fn()}
            onStart={vi.fn()}
        />
    )

const abrirModal = () => {
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('data-teste', 'modal-metodo')
    document.body.appendChild(modal)
    return modal
}

describe('shouldSuppressFinishedFlash (regra pura)', () => {
    it('suprime só quando há diálogo modal aberto', () => {
        const semModal = { querySelector: () => null } as unknown as Document
        const comModal = { querySelector: () => ({}) } as unknown as Document
        expect(shouldSuppressFinishedFlash({ isFinished: true, alreadyDismissed: false, doc: semModal })).toBe(false)
        expect(shouldSuppressFinishedFlash({ isFinished: true, alreadyDismissed: false, doc: comModal })).toBe(true)
    })

    it('não repete o trabalho: flash já dispensado ou descanso correndo não suprimem', () => {
        const comModal = { querySelector: () => ({}) } as unknown as Document
        expect(shouldSuppressFinishedFlash({ isFinished: false, alreadyDismissed: false, doc: comModal })).toBe(false)
        expect(shouldSuppressFinishedFlash({ isFinished: true, alreadyDismissed: true, doc: comModal })).toBe(false)
    })

    it('documento ausente (SSR) não quebra', () => {
        expect(hasOpenModalDialog(null)).toBe(false)
        expect(hasOpenModalDialog(undefined)).toBe(false)
    })
})

describe('RestTimerOverlay — fiação', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
    afterEach(() => {
        vi.useRealTimers()
        document.querySelectorAll('[data-teste="modal-metodo"]').forEach((n) => n.remove())
    })

    it('sem modal, o flash APARECE (senão o teste abaixo não prova nada)', async () => {
        montarDescansoTerminando()
        await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
        await waitFor(() => expect(screen.getByText(FLASH)).toBeTruthy())
    })

    it('com modal já aberto, o flash NÃO aparece', async () => {
        abrirModal()
        montarDescansoTerminando()
        await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
        expect(screen.queryByText(FLASH)).toBeNull()
    })

    it('modal aberto DEPOIS do flash derruba o flash', async () => {
        montarDescansoTerminando()
        await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
        await waitFor(() => expect(screen.getByText(FLASH)).toBeTruthy())

        await act(async () => { abrirModal(); await vi.advanceTimersByTimeAsync(50) })
        await waitFor(() => expect(screen.queryByText(FLASH)).toBeNull())
    })

    it('a barra do descanso continua na tela — o aviso não foi calado', async () => {
        abrirModal()
        montarDescansoTerminando()
        await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
        expect(screen.getByText(/START/i)).toBeTruthy()
    })
})

describe('guard de classe: modal de método tem aria-modal', () => {
    it('todo backdrop de modal do treino carrega a marca que o flash procura', () => {
        // A supressão lê `aria-modal="true"` — a mesma marca do leitor de tela.
        // Modal novo que a esqueça volta a vazar verde, e é isto que reprova aqui
        // (o ratchet de a11y cobre a semântica; este cobra a CONTAGEM contra os
        // backdrops, que é o que liga uma coisa à outra).
        const arquivos = ['ModalsSimpleMethods.tsx', 'ModalsComplexMethods.tsx', 'Modals.tsx']
        for (const nome of arquivos) {
            const code = readFileSync(join(process.cwd(), 'src/components/workout', nome), 'utf8')
            const backdrops = (code.match(/fixed inset-0 z-\[2\d{3}\]/g) || []).length
            // `dialogProps(` gera role+aria-modal; alguns arquivos escrevem à mão.
            const marcas = (code.match(/aria-modal/g) || []).length + (code.match(/dialogProps\(/g) || []).length
            expect(marcas, `${nome}: ${backdrops} backdrops × ${marcas} diálogos marcados`).toBeGreaterThanOrEqual(backdrops)
        }
    })
})
