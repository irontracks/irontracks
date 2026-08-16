/**
 * Regressão do bug relatado por usuário real em 14/08/2026: "quando cê vai lá
 * adicionar treino, daí cê vai editar o nome... toda vez que digito uma letra
 * some a caixa de letras embaixo" — o teclado do iOS fechava a CADA tecla.
 *
 * Causa: a key do card do exercício caía em `${nome}-${index}` quando o
 * exercício não tinha id (exatamente o caso de exercício recém-adicionado).
 * Cada tecla mudava o nome → mudava a key → o React DESMONTAVA o card → o
 * input era destruído e recriado → perdia o foco → teclado fechava.
 *
 * Invariantes:
 *  1. Digitar no nome NÃO destrói o nó do input (mesma referência DOM) nem o
 *     foco — é isso que mantém o teclado aberto no aparelho.
 *  2. Exercício sem id ganha uma chave efêmera (_itx_exKey) na entrada do
 *     editor — é ELA (não o index, que fazia o foco pular ao reordenar; não o
 *     nome, que muda a cada tecla) quem dá identidade ao card.
 *
 * Limite declarado: jsdom não tem teclado de verdade — o que se prova aqui é a
 * identidade do nó e o foco; o comportamento no aparelho foi conferido no
 * simulador.
 */
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/contexts/DialogContext', () => ({
    useDialog: () => ({
        alert: vi.fn(async () => { }),
        confirm: vi.fn(async () => true),
        showLoading: vi.fn(),
        closeDialog: vi.fn(),
    }),
}))
vi.mock('@/utils/supabase/client', () => ({
    createClient: vi.fn(() => ({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
    })),
}))

import ExerciseEditor from '@/components/ExerciseEditor'
import type { Workout } from '@/components/ExerciseEditor/types'

// Exercício exatamente como addExercise cria: SEM id e SEM _itx_exKey.
const novoExercicio = () => ({
    name: '',
    sets: 4,
    reps: '10',
    rpe: '8',
    cadence: '2020',
    restTime: 60,
    method: 'Normal',
    videoUrl: '',
    notes: '',
})

function Harness({ initial, onWorkout }: { initial: Workout; onWorkout?: (w: Workout) => void }) {
    const [w, setW] = React.useState<Workout>(initial)
    const handleChange = (next: Workout) => {
        setW(next)
        onWorkout?.(next)
    }
    return <ExerciseEditor workout={w} onChange={handleChange} />
}

const baseWorkout = (): Workout => ({
    title: 'Treino novo',
    exercises: [novoExercicio()],
} as unknown as Workout)

describe('ExerciseEditor — teclado estável ao renomear exercício', () => {
    it('digitar letra a letra no nome NÃO destrói o input nem derruba o foco', () => {
        render(<Harness initial={baseWorkout()} />)

        const before = screen.getByLabelText('Nome do exercício')
        before.focus()
        expect(document.activeElement).toBe(before)

        // Letra a letra, como no aparelho — cada change re-renderiza o pai.
        for (const parcial of ['S', 'Su', 'Sup', 'Supi', 'Supin', 'Supino']) {
            fireEvent.change(screen.getByLabelText('Nome do exercício'), { target: { value: parcial } })
        }

        const after = screen.getByLabelText('Nome do exercício')
        // MESMO nó DOM: se a key derivasse do nome, o React teria desmontado o
        // card a cada tecla e `after` seria um elemento novo (teclado fechado).
        expect(after).toBe(before)
        expect(document.activeElement).toBe(after)
        expect((after as HTMLInputElement).value).toBe('Supino')
    })

    it('exercício ADICIONADO recebe a chave antes do primeiro caractere', () => {
        let last: Workout | null = null
        render(
            <Harness
                initial={{ title: 'Treino vazio', exercises: [] } as unknown as Workout}
                onWorkout={(w) => { last = w }}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: /Adicionar Exercício/i }))
        const before = screen.getByLabelText('Nome do exercício')
        before.focus()
        fireEvent.change(before, { target: { value: 'S' } })

        const after = screen.getByLabelText('Nome do exercício')
        expect(after).toBe(before)
        expect(document.activeElement).toBe(after)
        expect(((last as Workout | null)?.exercises?.[0] as Record<string, unknown>)?._itx_exKey)
            .toBeTruthy()
    })

    it('exercício sem id ganha _itx_exKey na entrada (a identidade não vem do nome nem do index)', () => {
        let last: Workout | null = null
        render(<Harness initial={baseWorkout()} onWorkout={(w) => { last = w }} />)

        const exercises = (last as Workout | null)?.exercises as Array<Record<string, unknown>> | undefined
        expect(exercises?.[0]?._itx_exKey).toBeTruthy()
    })

    it('dois exercícios novos com o MESMO nome vazio recebem chaves distintas', () => {
        let last: Workout | null = null
        render(
            <Harness
                initial={{ title: 'T', exercises: [novoExercicio(), novoExercicio()] } as unknown as Workout}
                onWorkout={(w) => { last = w }}
            />,
        )
        const exercises = (last as Workout | null)?.exercises as Array<Record<string, unknown>> | undefined
        expect(exercises?.[0]?._itx_exKey).toBeTruthy()
        expect(exercises?.[1]?._itx_exKey).toBeTruthy()
        expect(exercises?.[0]?._itx_exKey).not.toBe(exercises?.[1]?._itx_exKey)
    })
})
