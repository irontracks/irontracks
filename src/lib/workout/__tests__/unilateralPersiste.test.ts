/**
 * Guards do bug "Exercício Unilateral não salva" (relato de usuário real,
 * 14/08/2026 — "no Cross é sempre unilateral e toda vez que eu vou lá e salvo,
 * ele não salva").
 *
 * O banco e a RPC save_workout_atomic SEMPRE souberam gravar is_unilateral/
 * side_rest_time/transition_time/is_alternating. O que perdia o dado eram os
 * BUILDERS de payload: a rota /api/workouts/update e o save direto do editor
 * completo mapeavam só name/notes/video_url/rest_time/cadence/method/sets — e
 * como a RPC apaga e reinsere os exercícios, cada save dessas rotas REGRAVAVA
 * o exercício como bilateral, desfazendo inclusive o que outro caminho tivesse
 * persistido. O sync professor→aluno e o clone de template de admin tinham o
 * mesmo furo.
 *
 * Invariantes:
 *  1. `unilateralPersistFields` é a fonte única (precedência camel > snake,
 *     números em string aceitos, zero/vazio vira null).
 *  2. GUARD DE CLASSE: todo arquivo que persiste exercício (chama
 *     save_workout_atomic ou insere em `exercises`) passa pelo helper — builder
 *     novo que esquecer o campo reprova aqui, não em produção.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { unilateralPersistFields } from '@/lib/workout/unilateralPersistFields'

describe('unilateralPersistFields — fonte única dos campos', () => {
    it('camelCase (estado do app) vence snake_case (linha do banco)', () => {
        expect(unilateralPersistFields({ isUnilateral: true, is_unilateral: false }).is_unilateral).toBe(true)
        expect(unilateralPersistFields({ isUnilateral: false, is_unilateral: true }).is_unilateral).toBe(false)
    })

    it('lê snake_case quando só a linha do banco existe (sync/clone)', () => {
        const out = unilateralPersistFields({ is_unilateral: true, side_rest_time: 15, transition_time: 5, is_alternating: true })
        expect(out).toEqual({ is_unilateral: true, side_rest_time: 15, transition_time: 5, is_alternating: true })
    })

    it('aceita número em STRING (o draft do modal guarda "15") e zero/vazio vira null', () => {
        expect(unilateralPersistFields({ sideRestTime: '15' }).side_rest_time).toBe(15)
        expect(unilateralPersistFields({ transitionTime: '0' }).transition_time).toBeNull()
        expect(unilateralPersistFields({ sideRestTime: '' }).side_rest_time).toBeNull()
        expect(unilateralPersistFields({}).side_rest_time).toBeNull()
    })

    it('exercício sem os campos sai bilateral explícito (defaults da RPC)', () => {
        expect(unilateralPersistFields({ name: 'Supino' })).toEqual({
            is_unilateral: false,
            side_rest_time: null,
            transition_time: null,
            is_alternating: false,
        })
    })
})

// ── Guard de CLASSE ──────────────────────────────────────────────────────────
// Varre src/ atrás de arquivos que persistem exercício e exige o helper em
// cada um. Foi assim que o bug viveu: 4 builders certos conviviam com 3 furados
// e ninguém via — a lista abaixo é calculada, não mantida à mão.
const SRC = path.join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue
        const full = path.join(dir, entry)
        const st = statSync(full)
        if (st.isDirectory()) walk(full, out)
        else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full)
    }
    return out
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

describe('guard de classe — quem persiste exercício passa pela fonte única', () => {
    const GERADOS = new Set(['types/supabase.ts']) // tipos gerados citam a RPC, não persistem nada
    const persisters = walk(SRC).filter((f) => {
        if (GERADOS.has(path.relative(SRC, f))) return false
        const src = stripComments(readFileSync(f, 'utf8'))
        const usesRpc = src.includes('save_workout_atomic')
        const insertsExercises = /\.from\(\s*['"]exercises['"]\s*\)[\s\S]{0,200}?\.insert\(/.test(src)
        return usesRpc || insertsExercises
    })

    it('a varredura encontra os persistidores conhecidos (autoteste do detector)', () => {
        const names = persisters.map((f) => path.relative(SRC, f))
        // Se este caso falhou, o detector quebrou — e o guard de baixo estaria
        // passando por não olhar nada (guard falso nº 5 do CLAUDE.md).
        expect(names).toEqual(expect.arrayContaining([
            'app/api/workouts/update/route.ts',
            'hooks/useExerciseEditorLogic.ts',
            'lib/workoutSync.ts',
            'actions/workout-crud-actions.ts',
        ]))
        expect(persisters.length).toBeGreaterThanOrEqual(6)
    })

    it.each([['builder persiste exercício sem unilateralPersistFields']])('%s → reprova', () => {
        // Exige a CHAMADA `unilateralPersistFields(`, não a mera presença do
        // nome: um import órfão sobrevivendo à remoção do spread deixava esta
        // varredura verde com o bug reposto (pego na prova por mutação).
        const faltando = persisters.filter((f) => !/unilateralPersistFields\s*\(/.test(stripComments(readFileSync(f, 'utf8'))))
        const nomes = faltando.map((f) => path.relative(SRC, f))
        // Builder novo que montar payload de exercício sem a fonte única cai
        // aqui — é o pedido de revisão, não um falso positivo.
        expect(nomes).toEqual([])
    })
})
