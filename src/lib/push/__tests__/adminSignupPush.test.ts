import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * O push de "nova solicitação de acesso" é o mais urgente do app — do outro
 * lado tem uma pessoa parada na tela de espera. Ele falhou de DUAS formas ao
 * mesmo tempo, e cada uma some sozinha num refactor:
 *
 *  1. chegava com ~13 min de atraso (promessa órfã em função serverless);
 *  2. chegava mudo, sem acender a tela bloqueada (tipo fora da whitelist).
 *
 * Medido em 01/08: solicitação criada 16:52, push no aparelho 17:05.
 */

const APNS = readFileSync('src/lib/push/apns.ts', 'utf8')
const SWIFT = readFileSync('ios/App/NotificationService/NotificationService.swift', 'utf8')
const ADMIN_NOTIFS = readFileSync('src/lib/admin/adminNotifications.ts', 'utf8')

/** Extrai os tipos entre aspas de um bloco de whitelist. */
function typesIn(source: string, startMarker: string): Set<string> {
    const from = source.indexOf(startMarker)
    if (from < 0) throw new Error(`marcador não encontrado: ${startMarker}`)
    const open = source.indexOf('[', from)
    const close = source.indexOf(']', open)
    const body = source.slice(open + 1, close)
    return new Set([...body.matchAll(/['"]([a-z_]+)['"]/g)].map((m) => m[1]))
}

const wakeTs = typesIn(APNS, 'const WAKE_SCREEN_TYPES')
const wakeSwift = typesIn(SWIFT, 'wakeScreenTypes')

describe('whitelist de Communication Notification', () => {
    it('as listas do servidor e do app iOS são IDÊNTICAS', () => {
        // Elas moram em repositórios de linguagem diferente e só um comentário
        // ("KEEP IN SYNC") as ligava. A do Swift é compilada no app instalado:
        // divergir aqui significa mandar `mutable-content` que o aparelho ignora,
        // ou deixar de mandar para um tipo que o app saberia tratar.
        const soTs = [...wakeTs].filter((t) => !wakeSwift.has(t)).sort()
        const soSwift = [...wakeSwift].filter((t) => !wakeTs.has(t)).sort()
        expect({ soTs, soSwift }).toEqual({ soTs: [], soSwift: [] })
    })

    it('a varredura achou as duas listas de verdade', () => {
        // Guard do guard: regex que para de casar transformaria o teste acima
        // em dois conjuntos vazios, sempre verdes.
        expect(wakeTs.size).toBeGreaterThan(15)
        expect(wakeSwift.size).toBe(wakeTs.size)
    })
})

describe('tipo do push de nova solicitação', () => {
    /** O tipo que `notifyAdminNewSignup` realmente emite. */
    const emitted = ADMIN_NOTIFS
        .slice(ADMIN_NOTIFS.indexOf('notifyAdminNewSignup'))
        .match(/type: '([a-z_]+)'/)?.[1]

    it('acorda a tela bloqueada — tem gente esperando aprovação do outro lado', () => {
        expect(emitted).toBeTruthy()
        expect(wakeTs.has(emitted!)).toBe(true)
        // e o app INSTALADO precisa conhecer o tipo, senão o upgrade não acontece
        expect(wakeSwift.has(emitted!)).toBe(true)
    })

    it('continua listando no sino do admin', () => {
        // Trocar o tipo não pode sumir com a notificação da UI.
        const listRoute = readFileSync('src/app/api/admin/notifications/list/route.ts', 'utf8')
        const bell = readFileSync('src/components/admin-panel/AdminNotificationBell.tsx', 'utf8')
        expect(listRoute).toContain(emitted!)
        expect(bell).toContain(emitted!)
    })
})

describe('entrega imediata: promessa não pode ficar órfã', () => {
    // Numa função serverless a Vercel devolve a resposta e CONGELA a instância.
    // Um `.catch(() => {})` solto deixa o trabalho pendurado até outra
    // requisição reaquecer o Lambda — foi o que atrasou o push em 13 minutos.
    const ROTAS = [
        'src/app/api/access-request/create/route.ts',
        'src/app/api/auth/apple/request-access/route.ts',
    ]

    it.each(ROTAS)('%s envolve a notificação em waitUntil', (file) => {
        const src = readFileSync(file, 'utf8')
        expect(src).toContain("from '@vercel/functions'")
        // a chamada precisa estar DENTRO do waitUntil, não solta ao lado dele
        expect(src).toMatch(/waitUntil\(\s*\n?\s*notifyAdminNewSignup\(/)
        expect(src).not.toMatch(/^\s*notifyAdminNewSignup\([\s\S]*?\)\.catch\([^)]*\)\s*$/m)
    })
})
