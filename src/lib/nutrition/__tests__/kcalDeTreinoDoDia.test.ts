import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { somarKcalDasSessoes } from '../kcalDeTreinoDoDia'

/**
 * As duas superfícies de nutrição contam as calorias de treino do MESMO jeito.
 *
 * A página `/dashboard/nutrition` lia `workout_session_logs` — 1 linha em toda
 * a produção, a última de 02/04/2026, e nenhum escritor no código — e estimava
 * `minutos × 7`. O overlay sempre leu `workouts.notes` com o modelo MET. As
 * duas alimentam o MESMO card ("Treino hoje: ~X kcal").
 */

/**
 * Sessão de força com peso declarado no check-in embutido.
 *
 * ⚠️ A duração é `totalTime` em SEGUNDOS — foi onde a primeira versão deste
 * arquivo errou: com outro nome de campo o modelo devolve 0 e o teste "prova"
 * que a soma é zero nos dois lados.
 */
const sessao = (min: number) => ({
    totalTime: min * 60,
    preCheckin: { body_weight_kg: 90 },
    exercises: [{ name: 'Supino reto com barra' }],
    logs: { '0-0': { done: true, weight: '80', reps: '10' } },
})

describe('somarKcalDasSessoes', () => {
    it('soma as sessões do dia — mais treino, mais kcal', () => {
        const uma = somarKcalDasSessoes([{ notes: sessao(40) }])
        expect(uma, 'uma sessão de 40 min tem que gastar caloria').toBeGreaterThan(0)
        expect(somarKcalDasSessoes([{ notes: sessao(40) }, { notes: sessao(40) }])).toBeCloseTo(uma * 2, 0)
    })

    it('aceita o `notes` como STRING — é assim que o Postgrest devolve a coluna', () => {
        const objeto = somarKcalDasSessoes([{ notes: sessao(40) }])
        const texto = somarKcalDasSessoes([{ notes: JSON.stringify(sessao(40)) }])
        expect(texto).toBe(objeto)
        expect(texto).toBeGreaterThan(0)
    })

    it('linha com JSON quebrado é ignorada, sem derrubar as outras', () => {
        const so = somarKcalDasSessoes([{ notes: sessao(40) }])
        expect(somarKcalDasSessoes([{ notes: '{quebrado' }, { notes: sessao(40) }])).toBe(so)
    })

    it('sem sessão devolve 0 — e o card só aparece acima de zero', () => {
        expect(somarKcalDasSessoes([])).toBe(0)
        expect(somarKcalDasSessoes(null)).toBe(0)
        expect(somarKcalDasSessoes(undefined)).toBe(0)
    })

    it('o perfil entra na conta: mais peso, mais gasto', () => {
        const semCheckin = () => { const s = { ...sessao(40) } as Record<string, unknown>; delete s.preCheckin; return s }
        const magro = somarKcalDasSessoes([{ notes: semCheckin() }], { bodyWeightKg: 60 })
        const pesado = somarKcalDasSessoes([{ notes: semCheckin() }], { bodyWeightKg: 110 })
        expect(pesado).toBeGreaterThan(magro)
    })
})

/**
 * Guard de CLASSE: ninguém volta a ler a tabela morta.
 *
 * ⚠️ Casa só no código EXECUTÁVEL. Este repo já teve guard que reprovava o
 * próprio comentário explicando por que o padrão é proibido (jeito nº 2 da
 * lista de guards falsos do CLAUDE.md) — e os dois arquivos corrigidos aqui
 * CITAM a tabela em comentário de propósito, para o próximo não repetir.
 */
const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/** Leem a tabela por obrigação, não por escolha — e a decisão está no arquivo. */
const PODEM_CITAR = new Set([
    'src/types/supabase.ts',                 // gerado do schema
    'src/lib/account/userDataCatalog.ts',    // LGPD: precisa exportar e apagar
])

const varrer = (dir: string, achados: string[] = []): string[] => {
    for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome)
        if (statSync(caminho).isDirectory()) {
            if (nome === '__tests__' || nome === 'node_modules') continue
            varrer(caminho, achados)
        } else if (/\.tsx?$/.test(nome)) {
            achados.push(caminho)
        }
    }
    return achados
}

describe('a tabela de sessões morta não tem leitor', () => {
    it('nenhum código de produto consulta `workout_session_logs`', () => {
        const culpados = varrer('src')
            .filter((f) => !PODEM_CITAR.has(f))
            .filter((f) => /from\(\s*['"]workout_session_logs['"]/.test(semComentarios(readFileSync(f, 'utf8'))))

        expect(
            culpados,
            'essa tabela tem 1 linha em produção e nenhum escritor — use `kcalDeTreinoDoDia`',
        ).toEqual([])
    })

    it('a página e o overlay chegam ao número pela MESMA função', () => {
        // Guard de FIAÇÃO: as duas passaram verdes isoladamente enquanto uma
        // delas somava sobre uma tabela vazia.
        for (const f of [
            'src/app/(app)/dashboard/nutrition/page.tsx',
            'src/components/dashboard/nutrition/NutritionOverlay.tsx',
        ]) {
            const src = semComentarios(readFileSync(f, 'utf8'))
            expect(src, `${f} deixou de usar a fonte única`).toMatch(/somarKcalDasSessoes\s*\(/)
            expect(src, `${f} monta a própria query de sessões do dia`).toMatch(/selecionarSessoesDoDia\s*\(/)
        }
    })
})
