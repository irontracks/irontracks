import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { somarKcalDasSessoes, selecionarSessoesDoDia } from '../kcalDeTreinoDoDia'

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
 * A fronteira do dia é a de BRASÍLIA, não a de Londres.
 *
 * `completed_at` é `timestamptz` e o Postgrest resolve string sem offset no
 * fuso da SESSÃO (UTC). Mandar `2026-08-31T00:00:00` fazia o "hoje" ir das
 * 21:00 do dia anterior às 20:59 — 37 de 658 sessões em produção (5,6%) caíam
 * no dia errado.
 */
describe('selecionarSessoesDoDia — fronteira BRT', () => {
    /** Espiona a janela que a query pede, sem ir à rede. */
    const janelaPedida = (dateKey: string) => {
        const capturado: Record<string, string> = {}
        const cadeia = {
            select: () => cadeia,
            eq: () => cadeia,
            gte: (coluna: string, valor: string) => { capturado[`gte:${coluna}`] = valor; return cadeia },
            lt: (coluna: string, valor: string) => { capturado[`lt:${coluna}`] = valor; return cadeia },
            lte: (coluna: string, valor: string) => { capturado[`lte:${coluna}`] = valor; return cadeia },
        }
        selecionarSessoesDoDia({ from: () => cadeia } as never, 'u1', dateKey)
        return capturado
    }

    it('começa à meia-noite de Brasília — 03:00 UTC, não 00:00 UTC', () => {
        const j = janelaPedida('2026-08-31')
        expect(
            j['gte:completed_at'],
            'com 00:00Z o dia começaria às 21h do dia anterior em São Paulo',
        ).toBe('2026-08-31T03:00:00.000Z')
    })

    it('termina na meia-noite BRT seguinte, e o fim é EXCLUSIVO', () => {
        const j = janelaPedida('2026-08-31')
        expect(j['lt:completed_at']).toBe('2026-09-01T03:00:00.000Z')
        // `lte ...T23:59:59` perdia a sessão terminada em 23:59:59.5.
        expect(j['lte:completed_at'], 'o teto inclusivo perde o último meio segundo').toBeUndefined()
    })

    it('o treino das 21h30 BRT pertence ao dia em que a pessoa treinou', () => {
        // 2026-08-31 21:30 BRT === 2026-09-01T00:30:00Z — o caso real medido.
        const instante = new Date('2026-09-01T00:30:00.000Z').toISOString()
        const j = janelaPedida('2026-08-31')
        expect(instante >= j['gte:completed_at'] && instante < j['lt:completed_at']).toBe(true)

        // ...e NÃO ao dia seguinte, onde o app o mostrava antes.
        const amanha = janelaPedida('2026-09-01')
        expect(instante >= amanha['gte:completed_at']).toBe(false)
    })

    it('a virada do mês não escapa', () => {
        const j = janelaPedida('2026-08-31')
        expect(j['lt:completed_at']).toBe('2026-09-01T03:00:00.000Z')
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
