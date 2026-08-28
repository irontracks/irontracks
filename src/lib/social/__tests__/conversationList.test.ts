import { describe, it, expect } from 'vitest'
import {
    buildConversationList,
    formatarQuandoDaConversa,
    outroLadoDoCanal,
    rotuloNaoLidas,
    type CanalDireto,
    type MensagemDireta,
} from '../conversationList'

/**
 * "Conversas" mostrava contatos: nomes, sem prévia, sem horário, sem não-lidas.
 *
 * O caso que mais importa aqui é o das NÃO LIDAS. Contar errado não quebra
 * nada — só põe um badge vermelho permanente em quem mandou mensagem e não foi
 * respondido, ou esconde a mensagem que chegou. As duas formas de errar são
 * silenciosas.
 */

const EU = 'eu-123'
const OUTRO = 'outro-456'

const canal = (id: string, ultima: string | null = null): CanalDireto =>
    ({ id, user1_id: EU, user2_id: OUTRO, last_message_at: ultima })

const msg = (over: Partial<MensagemDireta> & { created_at: string }): MensagemDireta => ({
    channel_id: 'c1',
    sender_id: OUTRO,
    content: 'oi',
    is_read: true,
    ...over,
})

describe('outroLadoDoCanal', () => {
    it('devolve o outro participante, venha ele de qual coluna vier', () => {
        expect(outroLadoDoCanal({ id: 'c', user1_id: EU, user2_id: OUTRO, last_message_at: null }, EU)).toBe(OUTRO)
        expect(outroLadoDoCanal({ id: 'c', user1_id: OUTRO, user2_id: EU, last_message_at: null }, EU)).toBe(OUTRO)
    })
})

describe('buildConversationList', () => {
    it('usa a mensagem MAIS RECENTE como prévia, independente da ordem que chegou', () => {
        const r = buildConversationList(
            [canal('c1')],
            [
                msg({ created_at: '2026-08-20T10:00:00Z', content: 'primeira' }),
                msg({ created_at: '2026-08-22T10:00:00Z', content: 'última' }),
                msg({ created_at: '2026-08-21T10:00:00Z', content: 'meio' }),
            ],
            EU,
        )
        expect(r[0].previa).toBe('última')
    })

    it('marca "Você:" quando fui eu quem falou por último', () => {
        const r = buildConversationList(
            [canal('c1')],
            [msg({ created_at: '2026-08-22T10:00:00Z', content: 'te mando amanhã', sender_id: EU })],
            EU,
        )
        expect(r[0].previa).toBe('Você: te mando amanhã')
    })

    it('conta como não lida SÓ o que eu recebi — minha mensagem não lida pelo outro não é badge meu', () => {
        const r = buildConversationList(
            [canal('c1')],
            [
                msg({ created_at: '2026-08-22T10:00:00Z', is_read: false, sender_id: OUTRO }),
                msg({ created_at: '2026-08-22T10:01:00Z', is_read: false, sender_id: OUTRO }),
                // minhas, ainda não lidas por ele — não contam para mim
                msg({ created_at: '2026-08-22T10:02:00Z', is_read: false, sender_id: EU }),
                msg({ created_at: '2026-08-22T10:03:00Z', is_read: false, sender_id: EU }),
            ],
            EU,
        )
        expect(r[0].naoLidas).toBe(2)
    })

    it('ordena da conversa mais recente para a mais antiga', () => {
        const r = buildConversationList(
            [canal('antiga'), canal('nova')],
            [
                msg({ channel_id: 'antiga', created_at: '2026-08-10T10:00:00Z' }),
                msg({ channel_id: 'nova', created_at: '2026-08-25T10:00:00Z' }),
            ],
            EU,
        )
        expect(r.map((c) => c.channelId)).toEqual(['nova', 'antiga'])
    })

    it('canal fora da amostra de mensagens não SOME — perder a prévia é aceitável, perder a conversa não', () => {
        const r = buildConversationList([canal('c9', '2026-08-24T10:00:00Z')], [], EU)
        expect(r).toHaveLength(1)
        expect(r[0].previa).toBe('')
        expect(r[0].quandoIso).toBe('2026-08-24T10:00:00Z')
    })

    it('achata quebras de linha — a prévia é uma linha só', () => {
        const r = buildConversationList(
            [canal('c1')],
            [msg({ created_at: '2026-08-22T10:00:00Z', content: 'oi\n\ntudo   bem?' })],
            EU,
        )
        expect(r[0].previa).toBe('oi tudo bem?')
    })
})

describe('formatarQuandoDaConversa', () => {
    // 22:30 em São Paulo = 01:30 UTC do dia seguinte. É aqui que o dia UTC
    // engana — o mesmo defeito que já pegou o heatmap e o streak neste repo.
    const noiteBrt = '2026-08-28T01:30:00Z'

    it('mesmo dia BRT mostra a hora — e não trata a noite como sendo de amanhã', () => {
        const agora = new Date('2026-08-27T23:00:00Z') // 20h de 27/08 em BRT
        expect(formatarQuandoDaConversa(noiteBrt, agora)).toMatch(/^\d{2}:\d{2}$/)
    })

    it('o dia anterior vira "ontem"', () => {
        const agora = new Date('2026-08-28T15:00:00Z') // 12h de 28/08 BRT
        expect(formatarQuandoDaConversa('2026-08-27T18:00:00Z', agora)).toBe('ontem')
    })

    it('na última semana mostra o dia; depois disso, a data', () => {
        const agora = new Date('2026-08-28T15:00:00Z')
        expect(formatarQuandoDaConversa('2026-08-25T15:00:00Z', agora)).toMatch(/^[a-zç]{3}$/i)
        expect(formatarQuandoDaConversa('2026-07-10T15:00:00Z', agora)).toBe('10/07')
    })

    it('sem carimbo, string vazia — não inventa horário', () => {
        expect(formatarQuandoDaConversa(null)).toBe('')
        expect(formatarQuandoDaConversa('não é data')).toBe('')
    })
})

describe('rotuloNaoLidas', () => {
    it('some no zero e satura em 99+ para não esticar a linha', () => {
        expect(rotuloNaoLidas(0)).toBe('')
        expect(rotuloNaoLidas(7)).toBe('7')
        expect(rotuloNaoLidas(250)).toBe('99+')
    })
})
