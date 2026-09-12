/**
 * O professor consegue DESFAZER um pedido de controle.
 *
 * Pedido do dono (12/09/2026): "o professor pode clicar sem querer, aí ele fica
 * sem ferramenta para cancelar".
 *
 * ⚠️ Era pior do que só faltar um botão. Com o pedido pendente o "Assumir"
 * sumia e sobrava o X — que apenas ESCONDE o banner do lado do professor. O
 * `control_status` seguia `requested` no servidor e o aluno continuava com o
 * convite ocupando a tela do treino, sem ninguém capaz de retirá-lo. Era um
 * estado órfão criado por um toque acidental.
 *
 * A capacidade já existia na rota (`action: 'release'`); faltava o caminho do
 * AUTOR — a mesma classe da observação por refeição, que saiu com o lado que
 * exibe pronto e sem quem escrevesse.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import StudentWorkoutStartBanner from '../StudentWorkoutStartBanner'

const dismiss = vi.fn()
let alerts: Array<{ userId: string; name: string }> = []

vi.mock('@/hooks/useStudentWorkoutStartAlerts', () => ({
  useStudentWorkoutStartAlerts: () => ({ alerts, dismiss }),
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

/** Corpos das chamadas a /api/teacher/control/<id>. */
const chamadas: Array<{ url: string; action: string }> = []
let respostaOk = true

beforeEach(() => {
  chamadas.length = 0
  respostaOk = true
  dismiss.mockReset()
  alerts = [{ userId: 'aluno-1', name: 'Fran' }]
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const action = JSON.parse(String(init?.body ?? '{}')).action
    chamadas.push({ url: String(url), action })
    return {
      ok: respostaOk,
      status: respostaOk ? 200 : 500,
      json: async () => ({ ok: respostaOk }),
    } as unknown as Response
  }))
})

const pedirControle = async () => {
  render(<StudentWorkoutStartBanner teacherUserId="prof-1" supabase={null} />)
  fireEvent.click(screen.getByRole('button', { name: /assumir/i }))
  await waitFor(() => expect(screen.getByText(/aguardando o aluno aceitar/i)).toBeTruthy())
}

describe('pedido de controle pendente', () => {
  it('oferece CANCELAR — sem isso um toque acidental não tem volta', async () => {
    await pedirControle()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeTruthy()
  })

  it('cancelar chama a rota com `release`, não só esconde o banner', async () => {
    await pedirControle()
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    await waitFor(() => {
      const release = chamadas.filter((c) => c.action === 'release')
      expect(release).toHaveLength(1)
      expect(release[0].url).toContain('/api/teacher/control/aluno-1')
    })
    // E o `dismiss` local NÃO substitui o cancelamento: ele deixaria o pedido
    // vivo no servidor, que é exatamente o defeito.
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('depois de cancelar, dá para pedir de novo', async () => {
    await pedirControle()
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /assumir/i })).toBeTruthy())
    expect(screen.getByText(/deseja assumir o treino/i)).toBeTruthy()
  })

  it('⚠️ o X de dispensar SOME enquanto o pedido está no ar', async () => {
    // Dispensar só limpa a tela do professor. Sair daqui com o pedido vivo
    // deixa o aluno com um convite que ninguém mais consegue retirar.
    expect(screen.queryByRole('button', { name: /dispensar/i })).toBeNull()
    await pedirControle()
    expect(screen.queryByRole('button', { name: /dispensar/i })).toBeNull()
  })

  it('sem pedido no ar, o X continua disponível (ele nunca foi o problema)', () => {
    render(<StudentWorkoutStartBanner teacherUserId="prof-1" supabase={null} />)
    fireEvent.click(screen.getByRole('button', { name: /dispensar/i }))
    expect(dismiss).toHaveBeenCalledWith('aluno-1')
  })

  it('falha ao cancelar mantém o botão — o pedido continua vivo e precisa de saída', async () => {
    await pedirControle()
    respostaOk = false
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    await waitFor(() => expect(screen.getByText(/não foi possível cancelar/i)).toBeTruthy())
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeTruthy()
  })
})
