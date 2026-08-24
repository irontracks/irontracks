import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NutritionHistoryModal from '@/components/dashboard/nutrition/NutritionHistoryModal'

/**
 * Exportar o histórico de nutrição em PDF (pedido do dono, 24/08/2026:
 * "às vezes ele quer os 3 últimos meses para enviar para o nutricionista").
 *
 * Este arquivo cobre a FIAÇÃO, não o algoritmo. O construtor do HTML e o
 * resolvedor de período têm testes próprios e **passam verdes com o botão
 * morto** — foi exatamente assim que o "Baixar PDF" do relatório de período do
 * treino ficou inerte no iPhone por um mês, com um `catch {}` engolindo a
 * falha. O que se mede aqui é o caminho inteiro: toque → HTML com os dias
 * certos → `exportHtmlAsPdf`.
 */

const selectSpy = vi.fn()
const resposta = {
  data: [
    { date: '2026-08-24', calories: 3075, protein: 216, carbs: 299, fat: 115 },
    { date: '2026-08-22', calories: 580, protein: 28, carbs: 70, fat: 20 },
    { date: '2026-08-21', calories: 1495, protein: 146, carbs: 153, fat: 32 },
  ] as unknown[],
  error: null as unknown,
}

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: (...args: unknown[]) => {
        selectSpy(...args)
        return { eq: () => ({ gte: (_c: string, ini: string) => ({ lte: (_c2: string, fim: string) => { intervalos.push([ini, fim]); return Promise.resolve(resposta) } }) }) }
      },
    }),
  }),
}))

const exportSpy = vi.fn(async () => ({ ok: true as const, via: 'native' as const }))
vi.mock('@/utils/report/exportHtmlAsPdf', () => ({
  exportHtmlAsPdf: (opts: unknown) => exportSpy(opts as never),
}))

let intervalos: Array<[string, string]> = []
const HOJE = '2026-08-24'

const abrir = (props: Partial<React.ComponentProps<typeof NutritionHistoryModal>> = {}) =>
  render(
    <NutritionHistoryModal
      open
      userId="u1"
      todayDate={HOJE}
      goals={{ calories: 2600 }}
      onPickDate={() => { }}
      onClose={() => { }}
      {...props}
    />,
  )

beforeEach(() => {
  intervalos = []
  selectSpy.mockClear()
  exportSpy.mockClear()
})

/** Espera a lista hidratar — antes disso o botão está desabilitado por não ter dado. */
const esperarLista = () => waitFor(() => expect(screen.getByText(/3 de 30 dias com lançamento/)).toBeInTheDocument())

describe('Salvar PDF do histórico de nutrição', () => {
  it('o botão existe e chega ao exportador com o HTML dos dias', async () => {
    abrir()
    await esperarLista()

    fireEvent.click(screen.getByRole('button', { name: /salvar pdf/i }))

    await waitFor(() => expect(exportSpy).toHaveBeenCalledTimes(1))
    const arg = exportSpy.mock.calls[0][0] as { html: string; title: string; baseFileName: string }

    // Os três dias vieram do banco e chegaram ao arquivo.
    expect(arg.html).toContain('3.075')
    expect(arg.html).toContain('1.495')
    // A cobertura viaja junto: sem ela, "média 1.717 kcal" de quem lançou 3
    // dias em 30 lê como a média do mês.
    expect(arg.html).toMatch(/3<\/strong>|3 de 30/)
    expect(arg.baseFileName).toBe('IronTracks_Nutricao_2026-07-26_2026-08-24')
    expect(arg.title).toMatch(/Nutrição/)
  })

  it('a meta do usuário entra no relatório quando existe', async () => {
    abrir()
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /salvar pdf/i }))
    await waitFor(() => expect(exportSpy).toHaveBeenCalled())
    const { html } = exportSpy.mock.calls[0][0] as { html: string }
    expect(html).toContain('2.600')
  })

  it('sem dia lançado o botão fica desabilitado — relatório de "0 kcal" seria falso', async () => {
    const original = resposta.data
    resposta.data = []
    try {
      abrir()
      await waitFor(() => expect(screen.getByText(/0 de 30 dias com lançamento/)).toBeInTheDocument())
      expect(screen.getByRole('button', { name: /salvar pdf/i })).toBeDisabled()
    } finally {
      resposta.data = original
    }
  })

  it('falha do exportador aparece na tela em vez de sumir num catch vazio', async () => {
    exportSpy.mockResolvedValueOnce({ ok: false, via: 'none', error: 'deu ruim' } as never)
    abrir()
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /salvar pdf/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('deu ruim'))
  })
})

describe('período personalizado', () => {
  it('consulta o intervalo digitado, não os últimos N dias', async () => {
    abrir()
    await esperarLista()
    expect(intervalos.at(-1)).toEqual(['2026-07-26', HOJE])

    fireEvent.click(screen.getByRole('button', { name: /período personalizado/i }))
    fireEvent.change(screen.getByLabelText(/data inicial/i), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText(/data final/i), { target: { value: '2026-07-31' } })

    await waitFor(() => expect(intervalos.at(-1)).toEqual(['2026-05-01', '2026-07-31']))
  })

  it('intervalo invertido não consulta nada e DIZ o motivo', async () => {
    abrir()
    await esperarLista()
    const antes = intervalos.length

    fireEvent.click(screen.getByRole('button', { name: /período personalizado/i }))
    fireEvent.change(screen.getByLabelText(/data inicial/i), { target: { value: '2026-07-31' } })
    fireEvent.change(screen.getByLabelText(/data final/i), { target: { value: '2026-05-01' } })

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/antes/i))
    expect(intervalos.length, 'não pode consultar com intervalo inválido').toBe(antes)
  })

  it('o PDF do período personalizado nomeia o arquivo pelas datas escolhidas', async () => {
    abrir()
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /período personalizado/i }))
    fireEvent.change(screen.getByLabelText(/data inicial/i), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText(/data final/i), { target: { value: '2026-07-31' } })
    await waitFor(() => expect(intervalos.at(-1)).toEqual(['2026-05-01', '2026-07-31']))

    fireEvent.click(screen.getByRole('button', { name: /salvar pdf/i }))
    await waitFor(() => expect(exportSpy).toHaveBeenCalled())
    const arg = exportSpy.mock.calls[0][0] as { baseFileName: string; html: string }
    expect(arg.baseFileName).toBe('IronTracks_Nutricao_2026-05-01_2026-07-31')
    // O cabeçalho mostra as datas, não "92 dias" — é o que o nutricionista lê.
    expect(arg.html).toContain('01/05/2026 a 31/07/2026')
  })
})

describe('o documento não repete o mesmo fato', () => {
  it('no período personalizado o intervalo aparece UMA vez', async () => {
    // Pego ao olhar o documento renderizado, não por teste: o título já é o
    // intervalo (`rotuloPeriodo` devolve as datas) e a linha de baixo repetia
    // "01/05/2026 a 31/07/2026" logo abaixo dele. Hoje o subtítulo acrescenta
    // o TAMANHO do período. Ver `docs/DESIGN_HIERARCHY.md`.
    abrir()
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /período personalizado/i }))
    fireEvent.change(screen.getByLabelText(/data inicial/i), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText(/data final/i), { target: { value: '2026-07-31' } })
    await waitFor(() => expect(intervalos.at(-1)).toEqual(['2026-05-01', '2026-07-31']))

    fireEvent.click(screen.getByRole('button', { name: /salvar pdf/i }))
    await waitFor(() => expect(exportSpy).toHaveBeenCalled())
    const { html } = exportSpy.mock.calls[0][0] as { html: string }

    // Só o CORPO: o `<title>` do documento repete o mesmo texto de propósito
    // (é o nome da aba e do arquivo, não conteúdo visível). Contar no HTML
    // inteiro daria 2 mesmo com a hierarquia certa — falso positivo que este
    // teste teve na primeira escrita.
    const corpo = html.slice(html.indexOf('<body'))
    expect(corpo.match(/01\/05\/2026 a 31\/07\/2026/g) ?? []).toHaveLength(1)
    expect(corpo).toContain('92 dias')
  })

  it('na janela fixa as datas ACRESCENTAM ao título, que fala em dias', async () => {
    abrir()
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /salvar pdf/i }))
    await waitFor(() => expect(exportSpy).toHaveBeenCalled())
    const { html } = exportSpy.mock.calls[0][0] as { html: string }
    expect(html).toContain('Últimos 30 dias')
    expect(html).toContain('26/07/2026 a 24/08/2026')
  })
})

describe('a busca não pode entrar em laço', () => {
  it('uma janela = uma consulta', async () => {
    // `periodo` é objeto derivado e entra nas dependências do efeito. Sem
    // `useMemo`, cada `setResultado` cria um objeto novo, o efeito dispara de
    // novo e o modal metralha o Supabase enquanto estiver aberto. Medido ao
    // escrever esta tela — o ESLint não acusa, porque a dependência está
    // declarada corretamente.
    abrir()
    await esperarLista()
    await new Promise((r) => setTimeout(r, 60))
    expect(intervalos.length).toBe(1)
  })
})
