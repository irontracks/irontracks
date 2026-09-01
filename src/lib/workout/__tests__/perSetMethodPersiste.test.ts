/**
 * O método por série sobrevive a QUALQUER caminho que salve o treino.
 *
 * `save_workout_atomic` apaga e reinsere as séries. Ou seja: um builder que não
 * copia `per_set_method` não deixa de gravá-lo — ele APAGA o que já estava lá.
 * O método salvo para a 3ª série sumiria na primeira vez que o treino fosse
 * salvo por outro caminho (editor completo, ação de servidor, sync
 * professor→aluno), sem erro nenhum e sem ninguém perceber. É a mesma armadilha
 * que custou o `unilateralPersistFields` — e a mesma do `planDays` da nutrição:
 * quem reconstrói campo a campo descarta o que não declara.
 *
 * Por isso o guard é de CLASSE: builder novo reprova aqui, não em produção.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { perSetMethodField } from '@/lib/workout/perSetMethodField'

describe('perSetMethodField — fonte única', () => {
    it('camelCase (estado do app) vence snake_case (linha do banco)', () => {
        expect(perSetMethodField({ perSetMethod: 'Cluster', per_set_method: 'Drop-Set' }))
            .toEqual({ per_set_method: 'Cluster' })
    })

    it('lê a linha do banco quando é só o que existe', () => {
        expect(perSetMethodField({ per_set_method: 'Drop-Set' })).toEqual({ per_set_method: 'Drop-Set' })
    })

    it('vazio vira null — string vazia cairia de volta na inferência e desfaria a escolha', () => {
        expect(perSetMethodField({ per_set_method: '   ' })).toEqual({ per_set_method: null })
        expect(perSetMethodField({})).toEqual({ per_set_method: null })
        expect(perSetMethodField(null)).toEqual({ per_set_method: null })
    })
})

// ── Guard de CLASSE ──────────────────────────────────────────────────────────
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

const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

describe('guard de classe — quem monta linha de SÉRIE passa pela fonte única', () => {
    /**
     * Um builder de série é quem grava `advanced_config` numa linha montada à
     * mão: é o campo irmão, presente exatamente nos payloads que representam a
     * série do PLANO. Mirar em `set_number` sozinho acusaria leitura e tipos —
     * guard largo demais é afrouxado na primeira semana (jeito nº 8).
     */
    const builders = walk(SRC).filter((f) => {
        const rel = path.relative(SRC, f)
        if (rel === 'lib/workout/perSetMethodField.ts') return false
        if (rel === 'types/supabase.ts') return false // tipos gerados, não persistem nada
        const src = stripComments(readFileSync(f, 'utf8'))
        if (!/advanced_config\s*:/.test(src)) return false
        // Só quem RECRIA a linha: o payload da RPC de save, o insert direto em
        // `sets` e o corpo do PATCH da rota de update. Leitura (mapWorkoutRow),
        // tipos e rascunho em memória não apagam nada — e um `.update()` de UM
        // campo (a progressão da IA) também não: ele não recria a série.
        const recria = /save_workout_atomic|\/api\/workouts\/update/.test(src)
            || /\.from\(\s*['"]sets['"]\s*\)[\s\S]{0,400}?\.insert\(/.test(src)
        return recria
    })

    it('a varredura encontra os builders conhecidos (autoteste do detector)', () => {
        const nomes = builders.map((f) => path.relative(SRC, f))
        expect(nomes).toEqual(expect.arrayContaining([
            'app/api/workouts/update/route.ts',
            'actions/workout-crud-actions.ts',
            'hooks/useExerciseEditorLogic.ts',
            'lib/workoutSync.ts',
        ]))
    })

    it('builder que monta série sem perSetMethodField reprova', () => {
        // Exige a CHAMADA, não a presença do nome: import órfão deixaria o
        // guard verde com o campo já removido do payload.
        const faltando = builders
            .filter((f) => !/perSetMethodField\s*\(/.test(stripComments(readFileSync(f, 'utf8'))))
            .map((f) => path.relative(SRC, f))
        expect(faltando, 'use perSetMethodField — a RPC recria as séries e apaga o que não vier no payload').toEqual([])
    })
})
