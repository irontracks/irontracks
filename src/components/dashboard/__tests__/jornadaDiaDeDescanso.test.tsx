/**
 * Jornada: "Vou descansar" apaga o convite para treinar.
 *
 * As pontas já estavam certas isoladamente — o card sabe sumir com
 * `restingToday`, e o prompt sabe gravar a intenção. O que faltava era a
 * FIAÇÃO: os dois são componentes irmãos, sem estado em comum, e sem o evento
 * a tela ficava com "TREINAR AGORA" aceso logo acima da pergunta que o próprio
 * toque acabou de esconder (relato do dono, 16/08/2026).
 *
 * É a lição nº 3 dos guards falsos deste repo: algoritmo e coletor corretos,
 * ninguém ligando os dois.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import RestDayPromptCard from '@/components/dashboard/RestDayPromptCard'
import { QuickStartCard } from '@/components/dashboard/QuickStartCard'
import { useRestDayIntent } from '@/hooks/useRestDayIntent'
import type { DashboardWorkout } from '@/types/dashboard'

const UID = 'user-teste'

// Nenhuma resposta gravada ainda; o upsert sempre dá certo.
const maybeSingle = vi.fn(async () => ({ data: null, error: null }))
const upsert = vi.fn(async () => ({ error: null }))

vi.mock('@/utils/supabase/client', () => ({
    createClient: () => ({
        from: () => ({
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
            upsert,
        }),
    }),
}))

vi.mock('@/lib/workout/trainedToday', () => ({ hasTrainedTodayBrt: vi.fn(async () => false) }))
vi.mock('@/utils/native/irontracksNative', () => ({ triggerHaptic: vi.fn(async () => { }) }))

const treino = (title: string) =>
    ({ id: title, title, exercises: [{ sets: [{}, {}, {}] }] }) as unknown as DashboardWorkout

function Topo() {
    const intent = useRestDayIntent(UID)
    return (
        <QuickStartCard
            workouts={[treino('Treino A')]}
            onStartSession={() => { }}
            restingToday={intent?.willTrain === false}
        />
    )
}

describe('jornada — dia de descanso', () => {
    beforeEach(() => { upsert.mockClear() })

    it('responder "Vou descansar" apaga o convite para treinar no topo', async () => {
        render(<><Topo /><RestDayPromptCard userId={UID} /></>)

        // Estado inicial: o atalho está aceso e a pergunta apareceu.
        expect(screen.getByRole('button', { name: /treinar agora/i })).toBeInTheDocument()
        const descansar = await screen.findByRole('button', { name: /vou descansar/i })

        await act(async () => { fireEvent.click(descansar) })

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /treinar agora/i })).not.toBeInTheDocument()
        })
        expect(screen.getByText(/dia de descanso/i)).toBeInTheDocument()
        expect(upsert, 'a intenção também tem que ser gravada').toHaveBeenCalledTimes(1)
    })

    it('"Vou treinar" NÃO apaga o convite — ele acabou de dizer que vai', async () => {
        render(<><Topo /><RestDayPromptCard userId={UID} /></>)
        const treinar = await screen.findByRole('button', { name: /^vou treinar$/i })

        await act(async () => { fireEvent.click(treinar) })

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /^vou treinar$/i })).not.toBeInTheDocument()
        })
        expect(screen.getByRole('button', { name: /treinar agora/i })).toBeInTheDocument()
    })
})
