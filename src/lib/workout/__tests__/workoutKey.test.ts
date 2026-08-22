/**
 * A chave do treino em curso precisa casar com a que o histórico grava.
 *
 * Bug encontrado em 22/08/2026 pela pergunta do dono ("Descarga do treino: para
 * que serve e por que não dá para ligar?"). O botão ficava travado em DESLIGADA.
 *
 * O que fechou o diagnóstico foi o BANCO, não a leitura de código: as duas
 * contas tinham `autoLoadDeloadOffWorkouts: []`. Com a lista vazia e uma chave
 * válida, `workoutDeloadEnabled = !!key && !off.has(key)` daria LIGADA. Só há um
 * jeito de dar DESLIGADA — `key` vazia. E aí `toggleWorkoutDeload`, que começa
 * com `if (!key) return`, é um no-op: o botão não tinha como ligar.
 *
 * A causa: `mapWorkoutRow` grava o nome do treino em **`title`**
 * (`title: String(workout.name)`), e os dois consumidores liam **`name`**.
 *
 * O segundo efeito é maior que o botão: `useWorkoutAutoload` recebia o mesmo
 * `''`, e `pickUsableHistory` só prioriza `if (wanted)` — ou seja, a
 * priorização do histórico POR TREINO nunca rodou, e o motor ancorava a
 * sugestão em sessão de outro treino.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveWorkoutKey } from '../workoutKey'
import { pickUsableHistory } from '@/components/workout/hooks/useWorkoutAutoload'

const SRC = join(process.cwd(), 'src')

describe('resolveWorkoutKey', () => {
    it('lê `title` — o campo que a sessão de fato carrega', () => {
        // `mapWorkoutRow`: title: String(workout.name ?? '')
        expect(resolveWorkoutKey({ title: 'TER · Lower A - Quadríceps + Glúteo' }))
            .toBe('ter · lower a - quadriceps + gluteo')
    })

    it('aceita `name` (linha crua do banco / caminho legado)', () => {
        expect(resolveWorkoutKey({ name: 'Lower A' })).toBe('lower a')
    })

    it('cai para a sessão quando o treino não traz nome', () => {
        expect(resolveWorkoutKey(null, { title: 'Upper B' })).toBe('upper b')
        expect(resolveWorkoutKey({}, { workout: { title: 'Upper B' } })).toBe('upper b')
    })

    it('normaliza igual ao histórico — senão as duas pontas nunca casam', () => {
        // `useWorkoutDeload` grava com `normalizeExerciseKey` sobre a coluna `name`.
        expect(resolveWorkoutKey({ title: '  SEG · Upper B ' })).toBe(resolveWorkoutKey({ name: 'SEG · Upper B' }))
    })

    it('sem nome nenhum devolve vazio (o chamador decide)', () => {
        expect(resolveWorkoutKey(null, null)).toBe('')
        expect(resolveWorkoutKey({ exercises: [] }, {})).toBe('')
    })
})

describe('o efeito da chave vazia — por que isso não era cosmético', () => {
    const hist = [
        { ts: 200, workoutKey: 'upper b', setWeights: [50], setReps: [10] },
        { ts: 300, workoutKey: 'lower a', setWeights: [110], setReps: [10] },
    ] as unknown as Parameters<typeof pickUsableHistory>[0]

    it('com a chave certa, o motor ancora no MESMO treino', () => {
        const r = pickUsableHistory(hist, resolveWorkoutKey({ title: 'Upper B' }))
        expect(r[0]?.weight).toBe(50)
    })

    it('com a chave vazia (o bug), ancora na sessão mais recente de QUALQUER treino', () => {
        // 110 kg é de outro treino — a carga "incomparável" que o código descreve.
        const r = pickUsableHistory(hist, '')
        expect(r[0]?.weight).toBe(110)
    })
})

describe('guard: ninguém volta a ler `name` da sessão para montar a chave', () => {
    it('o controller usa a fonte única', () => {
        const code = readFileSync(join(SRC, 'components/workout/useActiveWorkoutController.ts'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^[ \t]*\/\/.*$/gm, '')
        expect(code).toMatch(/resolveWorkoutKey\(/)
        // O padrão exato que estava errado nos dois pontos.
        expect(code).not.toMatch(/workout as Record<string, unknown>\)\?\.name\s*\n?\s*\?\?/)
        expect(code).not.toMatch(/\?\.name\s*\?\?\s*\(session as Record<string, unknown>\)\?\.name/)
    })

    it('autoload e descarga bebem da MESMA chave', () => {
        const code = readFileSync(join(SRC, 'components/workout/useActiveWorkoutController.ts'), 'utf8')
        // Divergir aqui é o bug de origem: uma ponta escopa por treino e a outra não.
        expect(code).toMatch(/workoutName:\s*workoutDeloadKey/)
    })
})
