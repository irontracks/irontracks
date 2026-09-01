/**
 * Aviso ao aluno quando o coach mexe no treino ou na dieta (01/09/2026).
 *
 * O que estes casos protegem é a JANELA DE AGRUPAMENTO — a decisão do dono ao
 * pedir a feature. Coach não ajusta uma coisa: ele abre o treino e mexe em
 * cinco exercícios em dois minutos. Um push por save vira cinco pushes, e
 * notificação que metralha é notificação que o usuário desliga (levando junto
 * a que importava).
 *
 * O outro invariante é o inverso e igualmente importante: falha na LEITURA da
 * janela não pode silenciar o aviso. Perder a notificação é pior que mandar uma
 * a mais.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// `vi.mock` é içado para o topo do arquivo: a fábrica não pode fechar sobre
// uma const declarada aqui embaixo (ReferenceError na importação do módulo).
const { insertNotifications } = vi.hoisted(() => ({
    insertNotifications: vi.fn(async () => ({ ok: true, inserted: 1 })),
}))
const notificacoesRecentes: Array<Record<string, unknown>> = []
let erroDeLeitura: unknown = null

vi.mock('@/lib/social/notifyFollowers', () => ({ insertNotifications }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({
    createAdminClient: () => ({
        from: () => {
            const chain: Record<string, unknown> = {}
            const self = () => chain
            chain.select = self
            chain.eq = self
            chain.gte = self
            chain.limit = async () => ({ data: erroDeLeitura ? null : notificacoesRecentes, error: erroDeLeitura })
            return chain
        },
    }),
}))

import {
    notifyCoachChange,
    textoDoAviso,
    destinoDoAviso,
    JANELA_DE_AGRUPAMENTO_MIN,
} from '../coachChangeNotice'

const ALUNO = '6cb619ba-1484-41f2-b60c-b67aaea06307'

beforeEach(() => {
    insertNotifications.mockClear()
    notificacoesRecentes.length = 0
    erroDeLeitura = null
})

describe('janela de agrupamento', () => {
    it('o primeiro aviso passa', async () => {
        const r = await notifyCoachChange({ studentUserId: ALUNO, kind: 'workout_updated' })
        expect(r.notified).toBe(true)
        expect(insertNotifications).toHaveBeenCalledTimes(1)
    })

    it('o segundo aviso do mesmo tipo, dentro da janela, é ENGOLIDO', async () => {
        notificacoesRecentes.push({ id: 'n1' })
        const r = await notifyCoachChange({ studentUserId: ALUNO, kind: 'workout_updated' })
        expect(r.notified).toBe(false)
        expect(r.motivo).toBe('agrupado')
        expect(insertNotifications, 'nada gravado — senão o sino enche igual').not.toHaveBeenCalled()
    })

    it('a janela é de meia hora — o suficiente para uma rodada de ajustes', () => {
        expect(JANELA_DE_AGRUPAMENTO_MIN).toBeGreaterThanOrEqual(15)
        expect(JANELA_DE_AGRUPAMENTO_MIN).toBeLessThanOrEqual(60)
    })

    it('falha ao LER a janela não silencia o aviso — perder é pior que repetir', async () => {
        erroDeLeitura = { message: 'timeout' }
        const r = await notifyCoachChange({ studentUserId: ALUNO, kind: 'diet_updated' })
        expect(r.notified).toBe(true)
    })

    it('sem destinatário não grava nada', async () => {
        const r = await notifyCoachChange({ studentUserId: '  ', kind: 'workout_updated' })
        expect(r.notified).toBe(false)
        expect(r.motivo).toBe('sem_destinatario')
        expect(insertNotifications).not.toHaveBeenCalled()
    })
})

describe('o que chega ao aluno', () => {
    it('grava o tipo que o toggle das Configurações conhece', async () => {
        await notifyCoachChange({ studentUserId: ALUNO, kind: 'diet_updated', nome: 'Cutting 2600' })
        const linha = (insertNotifications.mock.calls[0][0] as Array<Record<string, unknown>>)[0]
        expect(linha.type).toBe('diet_updated')
        expect(linha.user_id).toBe(ALUNO)
    })

    it('o toque leva para onde a mudança aconteceu', async () => {
        expect(destinoDoAviso('workout_updated')).toBe('/dashboard')
        expect(destinoDoAviso('diet_updated')).toBe('/dashboard/nutrition')

        await notifyCoachChange({ studentUserId: ALUNO, kind: 'diet_updated' })
        const linha = (insertNotifications.mock.calls[0][0] as Array<Record<string, unknown>>)[0]
        expect((linha.metadata as Record<string, unknown>).link).toBe('/dashboard/nutrition')
    })

    it('o nome do treino/plano entra na mensagem quando existe, e nunca vira "undefined"', () => {
        expect(textoDoAviso('workout_updated', 'Upper B').message).toContain('Upper B')
        expect(textoDoAviso('workout_updated').message).not.toMatch(/undefined|null|""/)
        expect(textoDoAviso('diet_updated', '   ').message).not.toMatch(/undefined|null/)
    })

    it('treino e dieta dizem coisas DIFERENTES — o aluno precisa saber o que abrir', () => {
        expect(textoDoAviso('workout_updated').title).not.toBe(textoDoAviso('diet_updated').title)
    })
})
