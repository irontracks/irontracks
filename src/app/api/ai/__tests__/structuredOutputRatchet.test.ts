import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * CATRACA do structured output nas rotas de IA.
 *
 * Auditoria de 02/08/2026: 27 rotas de IA, e as que exigem JSON pediam o
 * formato só no TEXTO do prompt. É a classe de falha do `protocol_failed` dos
 * exames — o modelo trunca/quebra o JSON, o parse falha, e cada retry é uma
 * chamada PAGA desperdiçada (o dono viu isso na cara, tocando "Gerar
 * protocolo" repetidas vezes).
 *
 * O padrão correto existe e está provado 4×: `bodyPhoto/aiContract.ts`,
 * `labExam/protocolContract.ts`, `exerciseMuscleMapShared.ts`.
 *
 * COMO A CATRACA FUNCIONA: a lista abaixo é o débito CONHECIDO, congelado.
 * - Migrou uma rota? Remova daqui (o teste FALHA se ela ficar na lista à toa).
 * - Rota nova com Gemini + parse de JSON sem `responseSchema`? O teste FALHA.
 * - ⛔ ADICIONAR rota à lista é proibido — é regressão de auditoria. A lista
 *   só encolhe.
 */
const DEBITO_CONHECIDO = [
    'assessment-report',
    'bia-extract',
    'exercise-swap',
    'lab-exam-extract',
    'meal-plan',
    'muscle-map-day',
    'muscle-map-week',
    'nutrition-weekly-report',
    'parse-exercise-voice',
    'post-workout-insights',
    'post-workout-meal',
    'scan-nutrition-label',
    'student-workout',
    'weekly-report',
    'workout-wizard',
].sort()

const AI_DIR = 'src/app/api/ai'

function routesSemContrato(): string[] {
    const out: string[] = []
    for (const dir of readdirSync(AI_DIR)) {
        const route = join(AI_DIR, dir, 'route.ts')
        try { statSync(route) } catch { continue }
        const src = readFileSync(route, 'utf8')
        const usaGemini = src.includes('getGeminiModel')
        // Só quem PRECISA de JSON entra: chat de texto livre (coach-chat etc.)
        // não tem schema a impor.
        const exigeJson = /extractJson|safeParse/.test(src)
        const temContrato = /responseSchema|GenerationConfig/.test(src)
        if (usaGemini && exigeJson && !temContrato) out.push(dir)
    }
    return out.sort()
}

describe('rotas de IA: structured output (catraca)', () => {
    it('nenhuma rota NOVA sem contrato, e a lista de débito só encolhe', () => {
        // Igualdade EXATA nos dois sentidos:
        // - rota a mais no real → rota nova sem contrato (ou regressão);
        // - rota a mais na lista → foi migrada, tire-a daqui para travar o ganho.
        expect(routesSemContrato()).toEqual(DEBITO_CONHECIDO)
    })

    it('a varredura enxerga as rotas de verdade (guard do guard)', () => {
        // Se o diretório mudar de lugar, a lista viraria vazia e o teste acima
        // "passaria" com a catraca morta.
        const dirs = readdirSync(AI_DIR)
        expect(dirs.length).toBeGreaterThan(20)
    })

    it('as rotas migradas passam o contrato NA CHAMADA', () => {
        for (const rota of ['lab-exam-protocol', 'exercise-muscle-map', 'exercise-muscle-map-backfill', 'body-composition-photo', 'body-composition-correlation']) {
            const src = readFileSync(join(AI_DIR, rota, 'route.ts'), 'utf8')
            expect(src, rota).toMatch(/getGeminiModel\([^)]*GenerationConfig\(\)|generationConfig|GenerationConfig\(/)
        }
    })
})
