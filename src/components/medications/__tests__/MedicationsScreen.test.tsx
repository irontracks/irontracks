import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DialogProvider } from '@/contexts/DialogContext'
import GlobalDialog from '@/components/GlobalDialog'
import MedicationsScreen from '../MedicationsScreen'
import { instalarFetch, listaDe, remedio, tomada } from './fixtures'

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logWarnRemote: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const abrir = async (onClose = vi.fn()) => {
  render(
    <DialogProvider>
      <MedicationsScreen onClose={onClose} />
      <GlobalDialog />
    </DialogProvider>,
  )
  await waitFor(() => expect(screen.queryByText('Carregando…')).toBeNull())
  return onClose
}

describe('MedicationsScreen', () => {
  it('é uma janela acessível: dialog modal com nome, X "Fechar" com alvo 44 e Esc fecha', async () => {
    instalarFetch({ 'GET /api/medications': listaDe() })
    const onClose = await abrir()
    const janela = screen.getByRole('dialog', { name: 'Medicamentos' })
    expect(janela).toHaveAttribute('aria-modal', 'true')
    const x = screen.getByRole('button', { name: 'Fechar' })
    expect(x.className).toContain('tap-44')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    fireEvent.click(x)
    expect(onClose.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('mostra o aviso de que não substitui a orientação médica', async () => {
    instalarFetch({ 'GET /api/medications': listaDe() })
    await abrir()
    expect(
      screen.getByText('Lembrete de organização. Não substitui a orientação do seu médico.'),
    ).toBeInTheDocument()
  })

  it('a linha do professor só aparece quando há vínculo', async () => {
    instalarFetch({ 'GET /api/medications': listaDe({ hasCoach: false }) })
    const { unmount } = render(
      <DialogProvider><MedicationsScreen onClose={vi.fn()} /></DialogProvider>,
    )
    await waitFor(() => expect(screen.queryByText('Carregando…')).toBeNull())
    expect(screen.queryByText('Seu professor pode ver e editar esta lista.')).toBeNull()
    unmount()

    instalarFetch({ 'GET /api/medications': listaDe({ hasCoach: true }) })
    await abrir()
    expect(screen.getByText('Seu professor pode ver e editar esta lista.')).toBeInTheDocument()
  })

  it('estado vazio: UMA linha e o botão Adicionar — sem as seções vazias', async () => {
    instalarFetch({ 'GET /api/medications': listaDe({ medications: [] }) })
    await abrir()
    expect(screen.getByText('Nenhum medicamento cadastrado.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Adicionar' })).toHaveLength(1)
    expect(screen.queryByText('Hoje')).toBeNull()
    expect(screen.queryByText('Nenhuma dose hoje.')).toBeNull()
  })

  it('"Tomei" grava e passa a mostrar "Tomado às"', async () => {
    const f = instalarFetch({
      'GET /api/medications': listaDe(),
      'POST /api/medications/intakes': { status: 200, body: { ok: true, intake: tomada() } },
    })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /Tomei/ }))
    expect(await screen.findByText('Tomado às 08:03')).toBeInTheDocument()
    expect(f.mock.calls.some((c) => c[0] === '/api/medications/intakes' && c[1]?.method === 'POST')).toBe(true)
  })

  it('"Tomei" que falha volta ao botão e avisa', async () => {
    instalarFetch({
      'GET /api/medications': listaDe(),
      'POST /api/medications/intakes': { status: 500, body: { ok: false } },
    })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /Tomei/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/Tomado às/)).toBeNull()
    expect(screen.getByRole('button', { name: /Tomei/ })).toBeInTheDocument()
  })

  it('Excluir PERGUNTA antes, com o texto do histórico, e só apaga depois do sim', async () => {
    const f = instalarFetch({
      'GET /api/medications': listaDe(),
      'DELETE /api/medications': { status: 200, body: { ok: true } },
    })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Losartana' }))

    const pergunta = await screen.findByRole('dialog', { name: 'Excluir medicamento' })
    expect(pergunta).toHaveTextContent(
      'Excluir este medicamento? O histórico de doses tomadas também será apagado. Se quiser guardar o histórico, use Pausar.',
    )
    expect(f.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false) // ainda não apagou

    fireEvent.click(within(pergunta).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true))
    expect(await screen.findByText('Nenhum medicamento cadastrado.')).toBeInTheDocument()
  })

  it('cancelar a pergunta não apaga nada', async () => {
    const f = instalarFetch({ 'GET /api/medications': listaDe() })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Losartana' }))
    const pergunta = await screen.findByRole('dialog', { name: 'Excluir medicamento' })
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Excluir medicamento' })).toBeNull())
    expect(f.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false)
    expect(screen.getByText('Losartana', { selector: 'p' })).toBeInTheDocument()
  })

  it('Pausar manda active:false e o cartão passa a dizer "Pausado"', async () => {
    const f = instalarFetch({
      'GET /api/medications': listaDe(),
      'PATCH /api/medications': { status: 200, body: { ok: true, medication: remedio({ active: false }) } },
    })
    await abrir()
    expect(screen.getByText('Ativo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pausar Losartana' }))
    expect(await screen.findByText('Pausado')).toBeInTheDocument()
    const patch = f.mock.calls.find((c) => c[1]?.method === 'PATCH') as unknown as [string, { body: string }]
    expect(JSON.parse(patch[1].body)).toEqual({ id: 'm1', active: false })
  })

  it('adiciona um remédio pelo formulário e volta para a lista', async () => {
    const novo = remedio({ id: 'm2', name: 'Metformina', times: ['12:00'] })
    instalarFetch({
      'GET /api/medications': listaDe({ medications: [] }),
      'POST /api/medications': { status: 200, body: { ok: true, medication: novo } },
    })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Metformina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Seus medicamentos')).toBeInTheDocument()
    expect(screen.getByText('Metformina', { selector: 'p' })).toBeInTheDocument()
  })

  it('formulário que falha ao salvar fica aberto, com o que foi digitado', async () => {
    instalarFetch({
      'GET /api/medications': listaDe({ medications: [] }),
      'POST /api/medications': { status: 500, body: { ok: false } },
    })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Metformina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByLabelText('Nome')).toHaveValue('Metformina')
  })
})
