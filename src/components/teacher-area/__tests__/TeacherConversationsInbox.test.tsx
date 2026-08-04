import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TeacherConversationsInbox } from '../TeacherConversationsInbox'
import { OPEN_TEACHER_CHAT_EVENT } from '../TeacherChatHost'

function mockFetchOnce(payload: unknown, ok = true) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => payload })))
}

describe('TeacherConversationsInbox', () => {
    beforeEach(() => { vi.restoreAllMocks() })
    afterEach(() => { vi.unstubAllGlobals() })

    it('lista as conversas com última mensagem e badge de não-lidas', async () => {
        mockFetchOnce({ ok: true, conversations: [
            { userId: 'u1', name: 'Ana', channelId: 'c1', lastMessage: 'oi prof', lastMessageAt: new Date().toISOString(), unreadCount: 2, photo: null, isOnline: true },
        ] })
        render(<TeacherConversationsInbox />)
        await waitFor(() => expect(screen.getByText('Ana')).toBeTruthy())
        expect(screen.getByText('oi prof')).toBeTruthy()
        expect(screen.getByText('2')).toBeTruthy()
    })

    it('aluno sem conversa mostra "Toque para conversar"', async () => {
        mockFetchOnce({ ok: true, conversations: [
            { userId: 'u2', name: 'Bruno', channelId: null, lastMessage: null, lastMessageAt: null, unreadCount: 0, photo: null, isOnline: false },
        ] })
        render(<TeacherConversationsInbox />)
        await waitFor(() => expect(screen.getByText('Bruno')).toBeTruthy())
        expect(screen.getByText(/Toque para conversar/i)).toBeTruthy()
    })

    it('lista vazia oferece cadastrar aluno — nao manda "abrir um aluno"', async () => {
        // A rota devolve TODOS os alunos do professor, com ou sem mensagem: a lista
        // so chega vazia quando ele nao tem aluno nenhum. O texto antigo ("Nenhuma
        // conversa ainda / abra um aluno e toque em Conversar") mandava procurar um
        // aluno que nao existe.
        const onGoToStudents = vi.fn()
        mockFetchOnce({ ok: true, conversations: [] })
        render(<TeacherConversationsInbox onGoToStudents={onGoToStudents} />)
        await waitFor(() => expect(screen.getByText(/Nenhum aluno vinculado/i)).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /Cadastrar aluno/i }))
        expect(onGoToStudents).toHaveBeenCalledTimes(1)
    })

    it('sem a acao de navegacao, nao renderiza botao quebrado', async () => {
        mockFetchOnce({ ok: true, conversations: [] })
        render(<TeacherConversationsInbox />)
        await waitFor(() => expect(screen.getByText(/Nenhum aluno vinculado/i)).toBeTruthy())
        expect(screen.queryByRole('button', { name: /Cadastrar aluno/i })).toBeNull()
    })

    it('erro do servidor mostra estado de erro', async () => {
        mockFetchOnce({ ok: false, error: 'boom' }, false)
        render(<TeacherConversationsInbox />)
        await waitFor(() => expect(screen.getByText(/Não foi possível carregar/i)).toBeTruthy())
    })

    it('clicar numa conversa dispara o evento de abrir o chat com o aluno', async () => {
        mockFetchOnce({ ok: true, conversations: [
            { userId: 'u1', name: 'Ana', channelId: 'c1', lastMessage: 'oi', lastMessageAt: null, unreadCount: 0, photo: null, isOnline: false },
        ] })
        const handler = vi.fn()
        window.addEventListener(OPEN_TEACHER_CHAT_EVENT, handler)
        render(<TeacherConversationsInbox />)
        await waitFor(() => expect(screen.getByText('Ana')).toBeTruthy())
        fireEvent.click(screen.getByText('Ana'))
        expect(handler).toHaveBeenCalled()
        const detail = (handler.mock.calls[0][0] as CustomEvent).detail
        expect(detail.userId).toBe('u1')
        window.removeEventListener(OPEN_TEACHER_CHAT_EVENT, handler)
    })
})
