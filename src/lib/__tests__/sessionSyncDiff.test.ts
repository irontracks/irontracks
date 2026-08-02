/**
 * Guard do sync incremental da sessão ativa (perf, ago/2026).
 *
 * O que protege: o diff NUNCA pode escolher 'patch' quando algo além dos logs
 * mudou — patch com estrutura desatualizada = série adicionada que "some" em
 * outro device (família do bug "séries sumindo", já corrigido 1x no heartbeat).
 * Na dúvida, o plano tem que ser 'full'.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { diffSessionForSync } from '@/lib/sessionSyncDiff'

const base = () => ({
    workoutTitle: 'Treino A',
    startedAt: 1754000000000,
    workout: { id: 'w1', exercises: [{ name: 'Supino', sets: 3 }] },
    logs: { '0-0': { weight: 100, reps: 8, done: true } },
    _savedAt: 111,
    _deviceId: 'dev-a',
})

describe('diffSessionForSync', () => {
    it('sem base sincronizada → full (primeiro envio)', () => {
        expect(diffSessionForSync(null, base()).mode).toBe('full')
        expect(diffSessionForSync(undefined, base()).mode).toBe('full')
    })

    it('nada mudou → skip (metadados _savedAt/_deviceId não contam)', () => {
        const next = { ...base(), _savedAt: 999, _deviceId: 'dev-a' }
        expect(diffSessionForSync(base(), next).mode).toBe('skip')
    })

    it('só um log novo → patch com apenas a chave nova', () => {
        const next = { ...base(), logs: { ...base().logs, '0-1': { weight: 100, reps: 6, done: true } } }
        const plan = diffSessionForSync(base(), next)
        expect(plan).toEqual({ mode: 'patch', set: { '0-1': { weight: 100, reps: 6, done: true } }, del: [] })
    })

    it('log alterado → patch só com a chave alterada', () => {
        const next = { ...base(), logs: { '0-0': { weight: 102.5, reps: 8, done: true } } }
        const plan = diffSessionForSync(base(), next)
        expect(plan).toEqual({ mode: 'patch', set: { '0-0': { weight: 102.5, reps: 8, done: true } }, del: [] })
    })

    it('log removido → patch com del', () => {
        const next = { ...base(), logs: {} }
        const plan = diffSessionForSync(base(), next)
        expect(plan).toEqual({ mode: 'patch', set: {}, del: ['0-0'] })
    })

    it('ESTRUTURA mudou (exercício adicionado) → full, mesmo com logs iguais', () => {
        const next = {
            ...base(),
            workout: { id: 'w1', exercises: [{ name: 'Supino', sets: 3 }, { name: 'Crucifixo', sets: 3 }] },
        }
        expect(diffSessionForSync(base(), next).mode).toBe('full')
    })

    it('timer/check-in/qualquer campo fora de logs mudou → full', () => {
        expect(diffSessionForSync(base(), { ...base(), timerTargetTime: 123 }).mode).toBe('full')
        expect(diffSessionForSync(base(), { ...base(), workoutTitle: 'Treino B' }).mode).toBe('full')
    })

    it('estrutura E logs mudaram juntos → full (nunca patch parcial)', () => {
        const next = {
            ...base(),
            workout: { id: 'w1', exercises: [{ name: 'Supino', sets: 4 }] },
            logs: { ...base().logs, '0-3': { weight: 90, reps: 10, done: true } },
        }
        expect(diffSessionForSync(base(), next).mode).toBe('full')
    })
})

describe('source-guard: fiação no useSessionSync', () => {
    const hook = readFileSync(path.resolve(__dirname, '../../hooks/useSessionSync.ts'), 'utf8')

    it('debounce usa o diff e a RPC de patch com fallback pro upsert cheio', () => {
        expect(hook).toContain('diffSessionForSync')
        expect(hook).toContain("rpc('patch_active_session_logs'")
    })

    it('heartbeat de 30s continua snapshot CHEIO (rede de segurança anti-drift)', () => {
        const heartbeat = hook.slice(hook.indexOf('const heartbeat = async'), hook.indexOf('const intervalId = setInterval(heartbeat'))
        expect(heartbeat).toContain('.upsert(')
        expect(heartbeat).not.toContain("rpc('patch_active_session_logs'")
    })
})
