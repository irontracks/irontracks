import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DialogProvider } from '@/contexts/DialogContext'
import GlobalDialog from '@/components/GlobalDialog'
import { instalarFetch, remedio, tomada } from '@/components/medications/__tests__/fixtures'
import { StudentMedicationsTab } from '../StudentMedicationsTab'

/**
 * Aba "Remédios" do aluno no painel do professor.
 *
 * O que ela promete e o que trava aqui: a lista e a adesão de 7 dias em TEXTO, a
 * escrita SEMPRE com `studentId`, erro por código (nunca texto do servidor), e o
 * professor NÃO marca "Tomei". E a fronteira que um teste de unidade da aba não vê:
 * quem a monta passa o id de AUTH do aluno (`user_id`), não o da linha.
 */

vi.mock('../AdminPanelContext', () => ({
  useAdminPanel: () => ({ getAdminAuthHeaders: async () => ({}) }),
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logWarnRemote: vi.fn() }))

const UID = '11111111-1111-4111-8111-111111111111'
const GET = `GET /api/teacher/medications?studentId=${UID}`
const ROTA = '/api/teacher/medications'

/** Sábado, 03/10/2026, 12:00 em BRT. Sem relógio fixo o "hoje" muda o resultado. */
const AGORA = new Date('2026-10-03T15:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const lista = (over: Record<string, unknown> = {}) => ({
  status: 200,
  body: { ok: true, medications: [remedio()], intakes: [], ...over },
})

const abrir = async () => {
  render(
    <DialogProvider>
      <StudentMedicationsTab studentId={UID} />
      <GlobalDialog />
    </DialogProvider>,
  )
  await waitFor(() => expect(screen.queryByText('Carregando remédios...')).toBeNull())
}

const corpoDa = (f: ReturnType<typeof instalarFetch>, metodo: string) => {
  const chamada = f.mock.calls.find((c) => (c[1] as { method?: string })?.method === metodo)
  return chamada ? JSON.parse(String((chamada[1] as { body?: string }).body)) : undefined
}

describe('StudentMedicationsTab', () => {
  it('carrega pela rota do professor com o studentId e lista os remédios', async () => {
    const f = instalarFetch({ [GET]: lista() })
    await abrir()
    expect(f).toHaveBeenCalledWith(GET.replace('GET ', ''), expect.objectContaining({ method: 'GET' }))
    expect(screen.getByText('Losartana', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('50 mg')).toBeInTheDocument()
    expect(screen.getByText(/O aluno é avisado quando você altera esta lista\./)).toBeInTheDocument()
  })

  it('adesão dos últimos 7 dias em texto: "tomado às" (hora BRT) e "pendente", mais recente primeiro', async () => {
    instalarFetch({
      [GET]: lista({
        // 11:03Z = 08:03 BRT. Ontem não tem tomada.
        intakes: [tomada({ date: '2026-10-03', scheduled_time: '08:00', taken_at: '2026-10-03T11:03:00Z' })],
      }),
    })
    await abrir()
    const secao = screen.getByRole('region', { name: 'Últimos 7 dias' })
    const itens = within(secao).getAllByRole('listitem').map((li) => li.textContent)
    expect(itens).toHaveLength(7) // uma dose por dia, remédio diário
    expect(itens[0]).toBe('Sáb 03/10 · 08:00 Losartana — tomado às 08:03')
    expect(itens[1]).toBe('Sex 02/10 · 08:00 Losartana — pendente')
    expect(itens[6]).toBe('Dom 27/09 · 08:00 Losartana — pendente')
  })

  it('a hora da tomada é BRT mesmo quando o instante cruza a meia-noite em UTC', async () => {
    instalarFetch({
      [GET]: lista({
        medications: [remedio({ times: ['23:30'] })],
        // 02:40Z de 03/10 = 23:40 BRT de 02/10.
        intakes: [tomada({ date: '2026-10-02', scheduled_time: '23:30', taken_at: '2026-10-03T02:40:00Z' })],
      }),
    })
    await abrir()
    const secao = screen.getByRole('region', { name: 'Últimos 7 dias' })
    expect(within(secao).getByText(/Sex 02\/10 · 23:30 Losartana/).textContent).toBe(
      'Sex 02/10 · 23:30 Losartana — tomado às 23:40',
    )
  })

  it('Adicionar → POST com o studentId e o que foi digitado', async () => {
    const f = instalarFetch({
      [GET]: lista(),
      [`POST ${ROTA}`]: { status: 200, body: { ok: true, medication: remedio({ id: 'm2', name: 'Metformina' }) } },
    })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Metformina' } })
    fireEvent.change(screen.getByLabelText('Dose'), { target: { value: '850 mg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(corpoDa(f, 'POST')).toBeDefined())
    expect(corpoDa(f, 'POST')).toMatchObject({ studentId: UID, name: 'Metformina', dose: '850 mg' })
    // Gravou → o formulário fecha e a lista é relida.
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Novo medicamento' })).toBeNull())
  })

  it('Editar → PATCH com studentId e id do remédio', async () => {
    const f = instalarFetch({
      [GET]: lista(),
      [`PATCH ${ROTA}`]: { status: 200, body: { ok: true, medication: remedio({ dose: '100 mg' }) } },
    })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Editar Losartana' }))
    fireEvent.change(screen.getByLabelText('Dose'), { target: { value: '100 mg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(corpoDa(f, 'PATCH')).toBeDefined())
    expect(corpoDa(f, 'PATCH')).toMatchObject({ studentId: UID, id: 'm1', dose: '100 mg' })
  })

  it('Pausar é PATCH active:false com studentId', async () => {
    const f = instalarFetch({
      [GET]: lista(),
      [`PATCH ${ROTA}`]: { status: 200, body: { ok: true, medication: remedio({ active: false }) } },
    })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Pausar Losartana' }))
    await waitFor(() => expect(corpoDa(f, 'PATCH')).toBeDefined())
    expect(corpoDa(f, 'PATCH')).toEqual({ studentId: UID, id: 'm1', active: false })
  })

  it('Excluir pergunta antes e só então manda DELETE com studentId', async () => {
    const f = instalarFetch({ [GET]: lista(), [`DELETE ${ROTA}`]: { status: 200, body: { ok: true } } })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Losartana' }))
    const pergunta = await screen.findByRole('dialog', { name: 'Excluir medicamento' })
    expect(corpoDa(f, 'DELETE')).toBeUndefined()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(corpoDa(f, 'DELETE')).toBeDefined())
    expect(corpoDa(f, 'DELETE')).toEqual({ studentId: UID, id: 'm1' })
  })

  it('sem remédios: uma linha de estado vazio', async () => {
    instalarFetch({ [GET]: lista({ medications: [] }) })
    await abrir()
    expect(screen.getByText('Nenhum medicamento cadastrado para este aluno.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Últimos 7 dias' })).toBeNull()
  })

  it('erro de carga: mensagem genérica, nunca o texto do servidor', async () => {
    instalarFetch({
      [GET]: { status: 500, body: { ok: false, error: 'database_error', message: 'relation "medications" does not exist' } },
    })
    await abrir()
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('Não consegui concluir. Tente de novo.')
    expect(document.body.textContent).not.toMatch(/relation|database_error/)
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('erro de escrita sai por código e o formulário NÃO fecha', async () => {
    instalarFetch({
      [GET]: lista({ medications: [] }),
      [`POST ${ROTA}`]: { status: 409, body: { ok: false, error: 'limite_atingido' } },
    })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Metformina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Este aluno já tem o máximo de 30 medicamentos.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Metformina')
  })

  it('o professor NÃO marca "Tomei" nem desfaz tomada', async () => {
    instalarFetch({
      [GET]: lista({ intakes: [tomada({ date: '2026-10-03' })] }),
    })
    await abrir()
    expect(screen.queryByRole('button', { name: /tomei/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /desfazer/i })).toBeNull()
    expect(screen.queryByText(/^Tomei$/)).toBeNull()
  })

  it('aluno sem conta (sem user_id): explica e não chama a rota', () => {
    const f = instalarFetch({})
    render(
      <DialogProvider>
        <StudentMedicationsTab studentId="" />
      </DialogProvider>,
    )
    expect(screen.getByText(/ainda não tem conta no app/)).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })
})

describe('StudentDetailPanel monta a aba com o id de AUTH do aluno', () => {
  const fonte = readFileSync(join(process.cwd(), 'src/components/admin-panel/StudentDetailPanel.tsx'), 'utf8')

  /** O elemento `<StudentMedicationsTab … />` inteiro, para olhar só as props dele. */
  const elemento = (() => {
    const ini = fonte.indexOf('<StudentMedicationsTab')
    return ini < 0 ? '' : fonte.slice(ini, fonte.indexOf('/>', ini) + 2)
  })()

  it('a aba é montada na sub-aba "medications"', () => {
    expect(elemento).not.toBe('')
    expect(fonte).toMatch(/subTab === 'medications'/)
    expect(fonte).toMatch(/setSubTab\('medications'\)/)
  })

  it('studentId é selectedStudent.user_id — nunca o id da linha de `students`', () => {
    expect(elemento).toMatch(/studentId=\{String\(selectedStudent\?\.user_id/)
    // `.id` (e `?.id`) é o da LINHA; o `user_id` contém "id" mas não casa com `\.id\b`.
    expect(elemento).not.toMatch(/selectedStudent\??\.id\b/)
  })

  it('a pílula "Remédios" vem logo depois de "Nutrição"', () => {
    const nutricao = fonte.indexOf("setSubTab('nutrition')")
    const remedios = fonte.indexOf("setSubTab('medications')")
    const evolucao = fonte.indexOf("setSubTab('evolution')")
    expect(nutricao).toBeGreaterThan(0)
    expect(remedios).toBeGreaterThan(nutricao)
    expect(remedios).toBeLessThan(evolucao)
  })
})
