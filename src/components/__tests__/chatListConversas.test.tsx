import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

/**
 * A fiação da lista de Conversas.
 *
 * O helper (`lib/social/conversationList`) tem casos próprios. Aqui prova-se o
 * que só aparece montando: a tela BUSCAR os dados, a conversa vir ANTES do
 * catálogo, e quem já tem conversa não aparecer duas vezes.
 *
 * ⚠️ O mock distingue a TABELA. As três consultas desta tela têm cadeias
 * parecidas (`select→…→limit`), e um mock que ignore o nome devolve perfis onde
 * o código espera mensagens — o mesmo erro que já derrubou 8 testes na área de
 * nutrição (ver CLAUDE.md).
 */

const EU = 'eu-1'
const ANA = 'ana-2'
const BRUNO = 'bruno-3'

let porTabela: Record<string, unknown[]> = {}

/**
 * Cadeia do PostgREST: qualquer método encadeia, e o `await` resolve com o dado
 * DA TABELA pedida. Proxy sobre uma Promise real de propósito — um `then`
 * escrito à mão e desamarrado da promise perde o `this` e nunca resolve; a tela
 * fica presa em "Carregando…" e o teste falha por um motivo que não é o do
 * caso.
 */
function consultaFalsa(tabela: string): unknown {
    const promessa = Promise.resolve({ data: porTabela[tabela] ?? [], error: null })
    const cadeia: unknown = new Proxy(promessa, {
        get(alvo, prop) {
            if (prop === 'then' || prop === 'catch' || prop === 'finally') {
                const v = Reflect.get(alvo, prop)
                return typeof v === 'function' ? v.bind(alvo) : v
            }
            return () => cadeia
        },
    })
    return cadeia
}

const supabaseFalso = {
    from: (tabela: string) => consultaFalsa(tabela),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => { },
    rpc: () => Promise.resolve({ data: 'canal-x', error: null }),
}

vi.mock('@/utils/supabase/client', () => ({ createClient: () => supabaseFalso }))
// Objeto ESTÁVEL. O real vem de um context memoizado; devolver um literal novo
// a cada render muda a identidade do `alert`, que está nas deps do `loadUsers`
// — o efeito re-dispara em loop e a tela nunca sai de "Carregando…".
const dialogFalso = { alert: vi.fn() }
vi.mock('@/contexts/DialogContext', () => ({ useDialog: () => dialogFalso }))
vi.mock('next/image', () => ({ default: () => null }))

import ChatListScreen from '../ChatListScreen'

const agora = new Date().toISOString()

beforeEach(() => {
    porTabela = {
        profiles_public: [
            { id: ANA, display_name: 'Ana', photo_url: null, last_seen: agora },
            { id: BRUNO, display_name: 'Bruno', photo_url: null, last_seen: null },
        ],
        direct_channels: [
            { id: 'c-ana', user1_id: EU, user2_id: ANA, last_message_at: agora },
        ],
        direct_messages: [
            { channel_id: 'c-ana', sender_id: ANA, content: 'bora treinar amanhã?', is_read: false, created_at: agora },
            { channel_id: 'c-ana', sender_id: ANA, content: 'anterior', is_read: false, created_at: '2026-08-01T10:00:00Z' },
        ],
    }
})
afterEach(() => cleanup())

const abrir = () =>
    render(<ChatListScreen user={{ id: EU }} onClose={() => { }} />)

describe('ChatListScreen — conversas', () => {
    it('mostra a prévia da última mensagem', async () => {
        abrir()
        expect(await screen.findByText('bora treinar amanhã?')).toBeTruthy()
    })

    it('mostra o badge de não lidas', async () => {
        abrir()
        expect(await screen.findByLabelText(/2 não lidas/i)).toBeTruthy()
    })

    it('quem tem conversa NÃO aparece também no catálogo de contatos', async () => {
        abrir()
        await screen.findByText('bora treinar amanhã?')
        // Ana está em Conversas; Bruno, que nunca trocou mensagem, no catálogo.
        expect(screen.getAllByText('Ana')).toHaveLength(1)
        expect(screen.getByText('Bruno')).toBeTruthy()
    })

    it('a seção Conversas vem ANTES do catálogo', async () => {
        abrir()
        await screen.findByText('bora treinar amanhã?')
        const corpo = document.body.textContent || ''
        expect(corpo.indexOf('Conversas')).toBeGreaterThanOrEqual(0)
        expect(corpo.indexOf('Conversas')).toBeLessThan(corpo.indexOf('Bruno'))
    })

    it('sem conversa nenhuma, a tela segue sendo o catálogo — não fica vazia', async () => {
        porTabela.direct_channels = []
        porTabela.direct_messages = []
        abrir()
        expect(await screen.findByText('Ana')).toBeTruthy()
        expect(screen.getByText('Bruno')).toBeTruthy()
    })

    it('erro ao buscar conversas não derruba o catálogo', async () => {
        const original = supabaseFalso.from
        supabaseFalso.from = (tabela: string) => {
            if (tabela === 'direct_channels') throw new Error('falha de rede')
            return original(tabela)
        }
        abrir()
        await waitFor(() => expect(screen.getByText('Ana')).toBeTruthy())
        expect(screen.getByText('Bruno')).toBeTruthy()
        supabaseFalso.from = original
    })
})
