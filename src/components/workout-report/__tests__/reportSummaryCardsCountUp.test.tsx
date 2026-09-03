import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { ReportSummaryCards } from '../ReportSummaryCards'

/**
 * Guard de COMPORTAMENTO do gatilho de scroll do count-up.
 *
 * ⚠️ A PRIMEIRA versão deste arquivo era GUARD FALSO e passou verde com o bug
 * inteiro reposto (os dois `useCountUp` sem gatilho, contando desde a
 * montagem). O motivo: ela afirmava `getByText('0')` logo após o render, e em
 * jsdom o `requestAnimationFrame` não tinha tickado ainda — o valor era 0 com
 * ou sem a correção. O teste media o relógio do harness, não o app.
 *
 * Por isso aqui o relógio e o rAF são CONTROLADOS: `avancarFrames()` empurra o
 * tempo e executa a fila. Só assim "ficou parado em 0" significa alguma coisa —
 * significa que ninguém agendou animação, que é exatamente o invariante.
 */

// ── Relógio e fila de frames controlados ──────────────────────────────────
let agora = 0
let filaRaf: FrameRequestCallback[] = []

// ── IntersectionObserver: jsdom não implementa ────────────────────────────
let ultimoCallback: IntersectionObserverCallback | null = null
let observados: Element[] = []
let desconectado = false

class IntersectionObserverMock {
    constructor(cb: IntersectionObserverCallback) { ultimoCallback = cb }
    observe(el: Element) { observados.push(el) }
    disconnect() { desconectado = true }
    unobserve() { /* não usado pelo hook */ }
}

beforeEach(() => {
    agora = 0
    filaRaf = []
    ultimoCallback = null
    observados = []
    desconectado = false
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
    vi.stubGlobal('performance', { now: () => agora })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { filaRaf.push(cb); return filaRaf.length })
    vi.stubGlobal('cancelAnimationFrame', () => { /* a fila é descartada por bloco */ })
})

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

/** Empurra o relógio e executa a fila de frames pendente, em rodadas. */
const avancarFrames = (ms: number, rodadas = 4) => {
    for (let i = 0; i < rodadas; i++) {
        agora += ms / rodadas
        const fila = filaRaf
        filaRaf = []
        act(() => { fila.forEach((cb) => cb(agora)) })
    }
}

const dispararIntersecao = (isIntersecting: boolean) => {
    act(() => {
        ultimoCallback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)
    })
}

const montar = () => render(
    <ReportSummaryCards
        session={{ totalTime: 3000 }}
        currentVolume={4820}
        volumeDelta={5.2}
        calories={612}
        outdoorBike={null}
        cardioGps={null}
        hasPreviousSession={true}
    />,
)

describe('ReportSummaryCards: count-up só conta quando o card entra na tela', () => {
    it('mesmo com o tempo correndo, não conta nada antes da interseção', () => {
        const { queryByText, getByText } = montar()
        expect(observados.length).toBeGreaterThan(0) // o observer foi registrado

        // ESTE é o passo que faltava na versão falsa: o tempo passa de verdade.
        avancarFrames(5000)

        expect(getByText('0')).toBeTruthy()   // volume parado
        expect(getByText('~0')).toBeTruthy()  // calorias paradas
        expect(queryByText('4.820')).toBeNull()
        expect(queryByText('~612')).toBeNull()
    })

    it('depois da interseção, os dois números sobem até o valor final', () => {
        const { getByText } = montar()
        dispararIntersecao(true)
        expect(desconectado).toBe(true) // dispara UMA vez só

        avancarFrames(5000) // além dos 2200ms de duração

        expect(getByText('4.820')).toBeTruthy()
        expect(getByText('~612')).toBeTruthy()
    })

    it('interseção que não intersecta não libera a contagem', () => {
        const { getByText } = montar()
        dispararIntersecao(false)
        avancarFrames(5000)

        expect(desconectado).toBe(false)
        expect(getByText('0')).toBeTruthy()
        expect(getByText('~0')).toBeTruthy()
    })
})
