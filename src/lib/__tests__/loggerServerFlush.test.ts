import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Gap "o Sentry não recebe erros de rota server" (CLAUDE.md, sofrido a sessão
 * inteira de 01/08): em serverless, `captureException` só ENFILEIRA e a Vercel
 * congela a instância assim que a resposta sai — o evento morre no buffer.
 * Mesma classe da promessa órfã que atrasou o push de aprovação em 13 minutos.
 */
const SRC = readFileSync('src/lib/logger.ts', 'utf8')

describe('logger: flush em serverless', () => {
    it('logError agenda o flush — capturar sem enviar é não capturar', () => {
        const body = SRC.slice(SRC.indexOf('export function logError'), SRC.indexOf('export function logDebug'))
        expect(body).toContain('scheduleServerFlush()')
    })

    it('logWarnRemote também — o flight recorder depende dele', () => {
        const body = SRC.slice(SRC.indexOf('export function logWarnRemote'))
        expect(body).toContain('scheduleServerFlush()')
    })

    it('o flush segura a instância viva via waitUntil', () => {
        expect(SRC).toMatch(/Sentry\.flush\(2000\)/)
        expect(SRC).toMatch(/waitUntil\?\.\(flushing\)/)
    })

    it('no browser é no-op — lá o SDK envia sozinho', () => {
        const helper = SRC.slice(SRC.indexOf('function scheduleServerFlush'))
        expect(helper).toMatch(/if \(typeof window !== 'undefined'\) return/)
    })
})
