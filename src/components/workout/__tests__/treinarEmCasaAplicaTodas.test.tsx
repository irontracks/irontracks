/**
 * "Treinar em casa" aplica TODAS as trocas — não só a última.
 *
 * Defeito reproduzido no simulador em 26/09/2026 (conta de teste): a janela
 * listava 4 trocas e o botão "Trocar 4 exercícios" mudava só o ÚLTIMO
 * exercício. O modal chamava a troca individual num laço, e cada chamada
 * montava a lista a partir do `exercises` do MESMO render — a segunda apagava
 * a primeira, a terceira apagava a segunda, e só a última sobrevivia.
 *
 * Por que este teste monta as peças REAIS (modal + hook + uma sessão com
 * estado que mescla como o `IronTracksAppClientImpl`): o laço estava certo
 * isoladamente e a troca individual também. O defeito só existe no CONTRATO
 * entre as duas — o mesmo motivo de o guard de fiação antigo, que só lia o
 * texto do JSX, ter passado verde com o bug no ar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { useWorkoutExerciseCrud } from '@/components/workout/hooks/useWorkoutExerciseCrud'
import AdaptarAmbienteModal from '@/components/workout/AdaptarAmbienteModal'
import type { PlanoDeAdaptacao } from '@/lib/workout/adaptarAmbiente'

const planoMock = vi.hoisted(() => ({ atual: null as PlanoDeAdaptacao | null }))

vi.mock('@/lib/workout/adaptarAmbiente', () => ({
    planejarAdaptacao: vi.fn(async () => planoMock.atual),
    resumoDaAdaptacao: () => 'resumo',
}))
vi.mock('@/utils/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/telemetry/userActivity', () => ({ trackUserEvent: vi.fn() }))

type Deps = Parameters<typeof useWorkoutExerciseCrud>[0]
type Ex = { name: string; notes?: string; sets?: number }
type Sessao = { workout: { id: string; exercises: Ex[] }; logs: Record<string, unknown> }

const TREINO: Ex[] = [
    { name: 'Supino inclinado com barra', notes: 'pés firmes no chão', sets: 3 },
    { name: 'Puxada aberta', sets: 3 },
    { name: 'Face pull', notes: 'Cotovelos altos. Drop-set na última série.', sets: 3 },
    { name: 'Tríceps na polia', sets: 3 },
    { name: 'Agachamento livre', sets: 3 },
]

const PLANO: PlanoDeAdaptacao = {
    trocas: [
        { indice: 0, de: 'Supino inclinado com barra', para: 'Flexão de braços', similaridade: 80, equipamento: 'peso corporal' },
        { indice: 1, de: 'Puxada aberta', para: 'Puxada na barra fixa neutra', similaridade: 75, equipamento: 'barra fixa' },
        { indice: 2, de: 'Face pull', para: 'Crucifixo invertido', similaridade: 70, equipamento: 'halteres' },
        { indice: 3, de: 'Tríceps na polia', para: 'Tríceps com elástico', similaridade: 72, equipamento: 'elastico' },
    ],
    mantidos: ['Agachamento livre'],
    semAlternativa: [],
}

let sessaoFinal: Sessao | null = null
let chamadasDeUpdate = 0

/** Sessão com estado próprio, mesclando o update como o app faz (`{ ...prev, ...u }`). */
function Harness() {
    const [sessao, setSessao] = useState<Sessao>({ workout: { id: 'w1', exercises: TREINO }, logs: {} })
    sessaoFinal = sessao
    const onUpdateSession = useCallback((u: Record<string, unknown>) => {
        chamadasDeUpdate += 1
        setSessao((prev) => ({ ...prev, ...(u as Partial<Sessao>) }))
    }, [])
    const crud = useWorkoutExerciseCrud({
        workout: sessao.workout,
        exercises: sessao.workout.exercises,
        logs: sessao.logs,
        getLog: () => ({}),
        updateLog: vi.fn(),
        collapsed: new Set<number>(),
        setCollapsed: vi.fn(),
        linkedWeightExercises: new Set<number>(),
        setLinkedWeightExercises: vi.fn(),
        onUpdateSession,
        alert: vi.fn(async () => {}),
        confirm: vi.fn(async () => true),
    } as unknown as Deps)
    return (
        <AdaptarAmbienteModal
            open
            onClose={() => {}}
            exercicios={sessao.workout.exercises.map((e) => e.name)}
            aoAplicar={(trocas) => crud.swapExerciseNames(trocas)}
        />
    )
}

const nomes = () => (sessaoFinal?.workout.exercises ?? []).map((e) => e.name)

async function aplicarPlano() {
    render(<Harness />)
    const botao = await screen.findByRole('button', { name: /Trocar 4 exercícios/ })
    await act(async () => { fireEvent.click(botao) })
}

beforeEach(() => {
    planoMock.atual = PLANO
    sessaoFinal = null
    chamadasDeUpdate = 0
})

describe('Treinar em casa — um toque aplica o plano inteiro', () => {
    it('as QUATRO trocas chegam à sessão, não só a última', async () => {
        await aplicarPlano()
        await waitFor(() => {
            expect(nomes()).toEqual([
                'Flexão de braços',
                'Puxada na barra fixa neutra',
                'Crucifixo invertido',
                'Tríceps com elástico',
                'Agachamento livre',
            ])
        })
    })

    it('o exercício sem troca fica intacto, e cada trocado perde a nota do aparelho velho', async () => {
        await aplicarPlano()
        await waitFor(() => expect(nomes()[0]).toBe('Flexão de braços'))
        const ex = sessaoFinal!.workout.exercises
        // Técnica do aparelho anterior sai; marcação de método (drop-set) fica.
        expect(ex[0].notes).toBe('')
        expect(ex[2].notes).toMatch(/^Drop-set/)
        expect(ex[4]).toEqual(TREINO[4])
    })

    it('o plano entra numa ÚNICA atualização da sessão', async () => {
        // N escritas parciais seguidas é exatamente a forma do defeito: cada uma
        // parte da lista do mesmo render. Uma escrita só não tem como se perder.
        await aplicarPlano()
        await waitFor(() => expect(nomes()[3]).toBe('Tríceps com elástico'))
        expect(chamadasDeUpdate).toBe(1)
    })
})
