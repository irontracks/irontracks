/**
 * Guard do histórico magro (perf, ago/2026).
 *
 * Sintoma que motivou: a lista de histórico baixava `workouts.notes` (a sessão
 * inteira, todas as séries) para 50-200 treinos — o maior payload do app em 4G.
 * Causa: a rota repassava as linhas cruas do banco.
 *
 * O guard trava dois invariantes:
 * 1. `buildSlimHistoryRow` NUNCA devolve `notes` (nem os logs) — só o resumo;
 * 2. o volume resumido é IGUAL ao da fonte única `sessionVolumeKg` — se
 *    divergirem, a lista mostraria número diferente do relatório.
 * E um source-guard: a rota precisa continuar mapeando por buildSlimHistoryRow.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { buildSlimHistoryRow } from '@/utils/history/slimHistoryRow'
import { sessionVolumeKg } from '@/utils/report/setVolume'

const sessao = {
    workoutTitle: 'Treino A — Peito',
    date: '2026-08-01T10:00:00.000Z',
    totalTime: 3600,
    exercises: [{ name: 'Supino', sets: 2 }, { name: 'Crucifixo', sets: 1 }],
    logs: {
        '0-0': { weight: 100, reps: 8, done: true },
        '0-1': { weight: 100, reps: 6, done: true },
        '1-0': { weight: 20, reps: 12, done: true },
    },
    ai: { insights: ['x'] },
}

const linhaDoBanco = {
    id: 'w1',
    name: 'Treino A',
    user_id: 'u1',
    date: '2026-08-01',
    created_at: '2026-08-01T10:00:00Z',
    completed_at: '2026-08-01T11:00:00Z',
    is_template: false,
    notes: JSON.stringify(sessao),
}

describe('buildSlimHistoryRow', () => {
    it('não vaza notes nem logs — só o resumo', () => {
        const slim = buildSlimHistoryRow(linhaDoBanco) as unknown as Record<string, unknown>
        expect(slim).not.toHaveProperty('notes')
        expect(JSON.stringify(slim)).not.toContain('logs')
        expect(JSON.stringify(slim).length).toBeLessThan(400)
    })

    it('volume idêntico à fonte única sessionVolumeKg', () => {
        const slim = buildSlimHistoryRow(linhaDoBanco)
        expect(slim.volume_kg).toBe(sessionVolumeKg(sessao.logs))
        expect(slim.volume_kg).toBeGreaterThan(0)
    })

    it('extrai título/tempo/exercícios/has_ai/session_date', () => {
        const slim = buildSlimHistoryRow(linhaDoBanco)
        expect(slim.workout_title).toBe('Treino A — Peito')
        expect(slim.total_time).toBe(3600)
        expect(slim.ex_count).toBe(2)
        expect(slim.has_ai).toBe(true)
        expect(slim.session_date).toBe('2026-08-01T10:00:00.000Z')
    })

    it('notes corrompido/vazio não derruba a linha', () => {
        const slim = buildSlimHistoryRow({ ...linhaDoBanco, notes: '{quebrado' })
        expect(slim.id).toBe('w1')
        expect(slim.volume_kg).toBe(0)
        expect(slim.total_time).toBe(0)
        expect(slim.has_ai).toBe(false)
        expect(slim.workout_title).toBeNull()
    })
})

describe('source-guard: rota do histórico usa a linha magra', () => {
    const rota = readFileSync(
        path.resolve(__dirname, '../../../app/api/workouts/history/route.ts'), 'utf8')

    it('mapeia os workouts por buildSlimHistoryRow (não repassa linha crua)', () => {
        expect(rota).toContain('buildSlimHistoryRow')
        expect(rota).toMatch(/workoutsResult\.data\s*\?\?\s*\[\]\)\.map/)
    })

    it('cache key versionada (payload v1 tinha notes; não pode ser servido)', () => {
        expect(rota).toContain('workouts:history:v2:')
    })
})
