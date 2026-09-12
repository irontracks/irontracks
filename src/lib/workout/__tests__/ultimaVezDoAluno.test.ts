/**
 * "Da última vez" — o número que o professor passou a ver no painel de controle,
 * e que precisa ser O MESMO que o aluno tem na tela dele.
 *
 * ⚠️ A regra parece trivial e não é: o watermark é `setWeights[setIdx]`, POR
 * SÉRIE, e só cai para `topWeight`/`avgWeight` quando a sessão antiga não
 * guardou detalhe por série. Uma implementação "óbvia" usando a média mostraria
 * ao coach um peso diferente do que está no aparelho do aluno, na mesma sessão,
 * para a mesma série — e os dois lados pareceriam certos isoladamente.
 *
 * Também se trava aqui a fiação (o servidor e o hook usarem a MESMA fonte):
 * duas cópias do conversor divergiriam em silêncio, que é a família de defeito
 * que este repo já pagou com os 14 renderers.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ultimaVezPorSerie, sessaoMaisRecente } from '@/lib/workout/ultimaVezDoAluno'

const item = (over: Record<string, unknown> = {}) => ({
    ts: 1_700_000_000_000,
    setWeights: [80, 82.5, 85],
    setReps: [10, 9, 8],
    setRpes: [7, 8, 9],
    topWeight: 85,
    avgWeight: 82.5,
    avgReps: 9,
    ...over,
}) as never

describe('o peso é POR SÉRIE', () => {
    it('cada série recebe o peso daquela série, não a média', () => {
        const mapa = ultimaVezPorSerie([item()], 3)
        expect(mapa[0]?.weight).toBe(80)
        expect(mapa[1]?.weight).toBe(82.5)
        expect(mapa[2]?.weight).toBe(85)
    })

    it('reps e RPE acompanham a série', () => {
        const mapa = ultimaVezPorSerie([item()], 3)
        expect(mapa[0]?.reps).toBe(10)
        expect(mapa[2]?.rpe).toBe(9)
    })

    it('sessão antiga sem detalhe por série cai no topWeight', () => {
        const mapa = ultimaVezPorSerie([item({ setWeights: [], setReps: [], setRpes: [] })], 2)
        expect(mapa[0]?.weight).toBe(85)
        expect(mapa[1]?.weight).toBe(85)
        expect(mapa[0]?.reps).toBe(9)
    })

    it('série sem peso utilizável fica FORA do mapa', () => {
        // "Não sei" não pode virar um traço na tela: o professor leria como
        // "ele não levantou nada".
        const mapa = ultimaVezPorSerie([item({ setWeights: [80, 0, null], topWeight: null, avgWeight: null })], 3)
        expect(mapa[0]?.weight).toBe(80)
        expect(mapa[1]).toBeUndefined()
        expect(mapa[2]).toBeUndefined()
    })

    it('sem histórico devolve mapa vazio', () => {
        expect(ultimaVezPorSerie([], 3)).toEqual({})
        expect(ultimaVezPorSerie(null, 3)).toEqual({})
    })

    it('só devolve as séries pedidas', () => {
        expect(Object.keys(ultimaVezPorSerie([item()], 2))).toEqual(['0', '1'])
    })
})

describe('a sessão de referência é a MAIS RECENTE', () => {
    it('escolhe pelo maior ts, não pela ordem do array', () => {
        const antiga = item({ ts: 1_600_000_000_000, setWeights: [50, 50, 50] })
        const recente = item({ ts: 1_700_000_000_000, setWeights: [90, 90, 90] })
        expect(ultimaVezPorSerie([antiga, recente], 1)[0]?.weight).toBe(90)
        expect(ultimaVezPorSerie([recente, antiga], 1)[0]?.weight).toBe(90)
        expect(sessaoMaisRecente([antiga, recente])?.ts).toBe(1_700_000_000_000)
    })
})

describe('fiação: uma fonte, dois consumidores', () => {
    const ler = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

    it('o hook do aluno importa o conversor — não reimplementa', () => {
        // Ele tinha 257 linhas de conversão presas como useCallback; a extração
        // é o que torna possível o servidor devolver o MESMO número.
        const hook = ler('src/components/workout/hooks/useWorkoutDeload.ts')
        expect(hook).toMatch(/from '@\/lib\/workout\/reportHistoryFromWorkouts'/)
        expect(
            hook,
            'o conversor voltou para dentro do hook: a partir daqui o painel do professor ' +
            'e a tela do aluno podem divergir sem ninguém perceber.',
        ).not.toMatch(/const buildReportHistoryFromWorkouts\s*=/)
    })

    it('a rota do professor usa a mesma fonte e o mesmo teto de sessões', () => {
        const rota = ler('src/app/api/teacher/student-history/[userId]/route.ts')
        expect(rota).toMatch(/buildReportHistoryFromWorkouts/)
        expect(rota).toMatch(/ultimaVezPorSerie/)
        expect(rota, 'ler mais sessões que o app faria o professor ver um "última vez" que o aluno não tem')
            .toMatch(/limit\(REPORT_HISTORY_LIMIT\)/)
    })

    it('⚠️ a rota NÃO devolve o `notes` cru', () => {
        // 1,9 MB no aluno mais antigo, dentro de um modal aberto durante o treino.
        const rota = ler('src/app/api/teacher/student-history/[userId]/route.ts')
        const retorno = rota.slice(rota.indexOf('return NextResponse.json({ ok: true'))
        expect(retorno).not.toMatch(/notes/)
    })

    it('a rota confere o vínculo professor↔aluno antes de ler qualquer coisa', () => {
        const rota = ler('src/app/api/teacher/student-history/[userId]/route.ts')
        const iAcesso = rota.indexOf('const acesso = await verificarAcesso(')
        const iLeitura = rota.indexOf(".from('workouts')")
        expect(iAcesso).toBeGreaterThan(0)
        expect(iLeitura, 'a leitura precisa vir DEPOIS da checagem de acesso').toBeGreaterThan(iAcesso)
        expect(rota).toMatch(/\.eq\('teacher_id', auth\.user\.id\)/)
    })
})
