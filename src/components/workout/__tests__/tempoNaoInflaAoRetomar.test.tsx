import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { WorkoutTimerProvider, useWorkoutTimer } from '../WorkoutTimerContext'

/**
 * O cronômetro inflava ao RETOMAR um treino esquecido.
 *
 * Visto no aparelho em 30/08/2026: sessão aberta 17 h antes, o app avisou
 * "o tempo parado não entra na conta" — e o contador marcava **1038:28**, que
 * é a idade total da sessão, sem desconto nenhum.
 *
 * A causa é de ORDEM, não de cálculo. `computeRecoveryPauseMs` já existia e
 * está certo; o que falhava era quando ele rodava:
 *
 *   1. `useLocalPersistence` faz `setView('active')` de forma SÍNCRONA, sem
 *      hidratar a sessão — ele só consulta o portão de restauração;
 *   2. `ActiveWorkout` renderiza com `session = null`, logo `lastActiveAtMs = 0`;
 *   3. o provider monta e o inicializador do `useState` calcula pausa = 0;
 *   4. `useSessionSync` hidrata depois, já com o carimbo antigo;
 *   5. **nada recalculava** — o inicializador do `useState` roda uma vez só.
 *
 * O `visibilitychange` não cobre este caso: o app foi RELANÇADO, não voltou de
 * background, então não há transição hidden→visible para medir.
 *
 * E a duração não é cosmética — ela alimenta `getEpocFactor` na estimativa de
 * calorias, que vai para o relatório, o PDF e a aba Nutrição.
 */

const Mostrador = () => {
    const { elapsedSeconds } = useWorkoutTimer()
    return <span data-testid="s">{elapsedSeconds}</span>
}

const AGORA = 1_700_000_000_000
const HORAS_17 = 17 * 60 * 60 * 1000

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AGORA)
})
afterEach(() => {
    vi.useRealTimers()
})

describe('tempo decorrido ao retomar', () => {
    it('desconta o gap quando o carimbo já existe no mount', () => {
        // Caminho que já funcionava: a sessão chegou antes do provider montar.
        render(
            <WorkoutTimerProvider startedAtMs={AGORA - HORAS_17} lastActiveAtMs={AGORA - HORAS_17 + 60_000}>
                <Mostrador />
            </WorkoutTimerProvider>,
        )
        // 17 h de idade, 1 min de atividade real: o resto é pausa.
        expect(Number(screen.getByTestId('s').textContent)).toBeLessThan(120)
    })

    it('⚠️ desconta TAMBÉM quando o carimbo chega DEPOIS do mount', () => {
        // É o caso real: a view vira "active" antes de a sessão ser hidratada,
        // então o provider monta com lastActiveAtMs = 0.
        const { rerender } = render(
            <WorkoutTimerProvider startedAtMs={AGORA - HORAS_17} lastActiveAtMs={0}>
                <Mostrador />
            </WorkoutTimerProvider>,
        )
        expect(Number(screen.getByTestId('s').textContent)).toBeGreaterThan(60_000)

        act(() => {
            rerender(
                <WorkoutTimerProvider startedAtMs={AGORA - HORAS_17} lastActiveAtMs={AGORA - HORAS_17 + 60_000}>
                    <Mostrador />
                </WorkoutTimerProvider>,
            )
        })
        expect(
            Number(screen.getByTestId('s').textContent),
            'o gap tem que ser descontado quando o carimbo enfim chega',
        ).toBeLessThan(120)
    })

    it('não desconta duas vezes quando o carimbo é ATUALIZADO', () => {
        // O `_savedAt` é reescrito a cada persistência. Recalcular a cada
        // mudança somaria gaps repetidamente e zeraria o cronômetro de quem
        // está treinando normalmente.
        const { rerender } = render(
            <WorkoutTimerProvider startedAtMs={AGORA - HORAS_17} lastActiveAtMs={0}>
                <Mostrador />
            </WorkoutTimerProvider>,
        )
        act(() => {
            rerender(
                <WorkoutTimerProvider startedAtMs={AGORA - HORAS_17} lastActiveAtMs={AGORA - HORAS_17 + 60_000}>
                    <Mostrador />
                </WorkoutTimerProvider>,
            )
        })
        const depoisDoPrimeiro = Number(screen.getByTestId('s').textContent)

        // A segunda atualização traz um gap que TAMBÉM passaria de LONG_GAP_MS
        // (2 h). Com um valor recente aqui, o gap seria 0 e o caso passaria
        // verde mesmo sem a guarda — foi o guard falso da primeira versão,
        // pego por mutação.
        act(() => {
            rerender(
                <WorkoutTimerProvider startedAtMs={AGORA - HORAS_17} lastActiveAtMs={AGORA - 2 * 60 * 60 * 1000}>
                    <Mostrador />
                </WorkoutTimerProvider>,
            )
        })
        expect(Number(screen.getByTestId('s').textContent)).toBe(depoisDoPrimeiro)
    })

    it('carimbo presente no mount NÃO é descontado duas vezes', () => {
        // O inicializador do `useState` já desconta quando a sessão chegou
        // antes. Se o efeito semeasse de novo, o mesmo gap valeria em dobro e
        // o cronômetro iria a zero — foi o que a primeira versão desta
        // correção fez, e quem pegou foi a suíte que já existia.
        render(
            <WorkoutTimerProvider startedAtMs={AGORA - 5 * 60 * 60 * 1000} lastActiveAtMs={AGORA - 4 * 60 * 60 * 1000}>
                <Mostrador />
            </WorkoutTimerProvider>,
        )
        const s = Number(screen.getByTestId('s').textContent)
        expect(s).toBeGreaterThan(59 * 60)
        expect(s).toBeLessThan(61 * 60)
    })

    it('sessão nova (sem gap) não é penalizada', () => {
        render(
            <WorkoutTimerProvider startedAtMs={AGORA - 300_000} lastActiveAtMs={AGORA - 5_000}>
                <Mostrador />
            </WorkoutTimerProvider>,
        )
        // 5 min de treino, atividade há 5 s: nada a descontar.
        expect(Number(screen.getByTestId('s').textContent)).toBeGreaterThan(280)
        expect(Number(screen.getByTestId('s').textContent)).toBeLessThan(320)
    })
})
