import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { ReportSummaryCards } from '../ReportSummaryCards'

/**
 * Guard de COMPORTAMENTO, não de forma — a lição registrada no CLAUDE.md deste
 * repo é que "guard de forma não substitui teste de comportamento" (o caso da
 * semana em cinco arquivos que passava com "data − 1 dia"). Os casos em
 * `motionDeEntrada.test.ts` provam que o código CHAMA `useInViewOnce` e passa
 * `emVista`; este arquivo prova que a CONSEQUÊNCIA acontece: o valor fica
 * parado em 0 até a interseção disparar, e só sobe depois.
 *
 * Achado do dono no aparelho, 03/09/2026: sem isso, `ReportSummaryCards` — o
 * 8º bloco da tela — animava na montagem, e o scroll chegava lá com a
 * contagem de 900ms já terminada havia muito.
 */

// jsdom não implementa IntersectionObserver. O mock guarda o callback que o
// hook registrou, para o teste disparar a interseção manualmente — é a
// simulação de "o usuário rolou até aqui".
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
    ultimoCallback = null
    observados = []
    desconectado = false
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
})

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

const dispararIntersecao = (isIntersecting: boolean) => {
    act(() => {
        ultimoCallback?.(
            [{ isIntersecting } as IntersectionObserverEntry],
            {} as IntersectionObserver,
        )
    })
}

describe('ReportSummaryCards: count-up só conta quando o card entra na tela', () => {
    it('fica em 0 antes da interseção, mesmo com volume e calorias reais', () => {
        const { getByText, queryByText } = render(
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
        // O observer foi registrado (o hook rodou) mas ainda não disparou.
        expect(observados.length).toBeGreaterThan(0)
        expect(queryByText('4.820')).toBeNull()
        expect(getByText('0')).toBeTruthy() // volume em 0
        expect(getByText('~0')).toBeTruthy() // calorias em 0
    })

    it('começa a contar só depois que a interseção dispara — e desconecta (uma vez só)', () => {
        const { getByText } = render(
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
        expect(desconectado).toBe(false)

        dispararIntersecao(true)
        expect(desconectado).toBe(true) // é UMA vez só — não segue observando
        // A rampa de easeOutCubic e o valor final já são cobertos pelos casos
        // unitários de `useCountUp` (com `requestAnimationFrame` real, sob
        // fake timers próprios) — este teste prova só a FIAÇÃO até aqui: o
        // gatilho dispara e o observer se desliga.
    })

    it('interseção que NÃO intersecta (saiu de vista antes de entrar) não dispara nada', () => {
        render(
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
        dispararIntersecao(false)
        expect(desconectado).toBe(false)
    })
})
