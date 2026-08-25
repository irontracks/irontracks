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

// O mock precisa distinguir a TABELA: `nutrition_day_flags` e
// `nutrition_meal_entries` têm a mesma cadeia de chamadas
// (select→eq→gte→lte), então um mock que ignora o nome devolve as refeições
// como se fossem marcas de "dia incompleto" — e todos os dias somem da média.
vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    from: (tabela: string) => ({
      select: (...args: unknown[]) => {
        selectSpy(...args)
        return {
          eq: () => ({
            gte: (_c: string, ini: string) => ({
              lte: (_c2: string, fim: string) => {
                if (tabela === 'nutrition_day_flags') return Promise.resolve(marcasResposta)
                // O DETALHE por refeição sai da mesma tabela dos agregados —
                // só o select distingue os dois. Ignorar isso faria a lista de
                // dias receber refeições (e vice-versa) sem erro nenhum.
                if (String(args[0] ?? '').includes('food_name')) return Promise.resolve(refeicoesResposta)
                intervalos.push([ini, fim])
                return Promise.resolve(resposta)
              },
            }),
            eq: () => Promise.resolve(refeicoesResposta),
          }),
        }
      },
      insert: (linha: unknown) => { escritas.push(['insert', linha]); return Promise.resolve({ error: falharEscrita ? { message: 'recusado' } : null }) },
      delete: () => ({ eq: () => ({ eq: (_c: string, date: string) => { escritas.push(['delete', date]); return Promise.resolve({ error: falharEscrita ? { message: 'recusado' } : null }) } }) }),
    }),
  }),
}))

const exportSpy = vi.fn(async () => ({ ok: true as const, via: 'native' as const }))
vi.mock('@/utils/report/exportHtmlAsPdf', () => ({
  exportHtmlAsPdf: (opts: unknown) => exportSpy(opts as never),
}))

let intervalos: Array<[string, string]> = []
/** As refeições que o PDF detalha. */
let refeicoesResposta: { data: unknown[]; error: unknown } = { data: [], error: null }
/** O que o hook de marcas encontra no banco. Vazio por padrão. */
let marcasResposta: { data: unknown[]; error: unknown } = { data: [], error: null }
/** Escritas em `nutrition_day_flags`, para provar marcar/desmarcar. */
let escritas: Array<[string, unknown]> = []
/** Liga a recusa do banco na próxima escrita, para provar o desfazer. */
let falharEscrita = false
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
  refeicoesResposta = {
    data: [
      { id: 'm1', date: '2026-08-22', created_at: '2026-08-22T12:15:00Z', food_name: 'Almoço', calories: 580, protein: 28, carbs: 70, fat: 20, items: [{ label: '150g arroz', grams: 150 }] },
      { id: 'm2', date: '2026-08-21', created_at: '2026-08-21T23:40:00Z', food_name: 'Ceia', calories: 300, protein: 30, carbs: 10, fat: 8, items: [] },
    ],
    error: null,
  }
  marcasResposta = { data: [], error: null }
  escritas = []
  falharEscrita = false
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

  it('ao abrir o personalizado NÃO acende alarme vermelho — campo vazio não é erro', async () => {
    // Visto no simulador: "Escolha as duas datas." aparecia em vermelho antes
    // de o usuário poder digitar. Vermelho neste app é erro e estouro de meta;
    // gastá-lo numa instrução é o mesmo defeito que já tirou o vermelho
    // decorativo de Configurações e do card de pendências com zero.
    abrir()
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /período personalizado/i }))
    expect(screen.queryByRole('alert')).toBeNull()
    // Quem orienta é o corpo da lista, sem competir por atenção.
    expect(screen.getByText(/escolha as duas datas para ver o período/i)).toBeInTheDocument()
  })

  it('preenchida só UMA data, ainda não é erro', async () => {
    abrir()
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /período personalizado/i }))
    fireEvent.change(screen.getByLabelText(/data inicial/i), { target: { value: '2026-05-01' } })
    expect(screen.queryByRole('alert')).toBeNull()
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

describe('dia marcado como registro incompleto', () => {
  /**
   * O caso real que originou a feature: 22/08 tem 580 kcal e UMA refeição, e
   * entrava na média como se fosse um dia inteiro. Na base do dono eram 11 dos
   * 68 dias, e a média ia de 2.199 para 2.493.
   */
  it('marcar tira o dia da média e a tela DIZ que tirou', async () => {
    abrir()
    await esperarLista()
    // (3075 + 580 + 1495) / 3 = 1717
    expect(screen.getByText('1717')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Tirar .*22 de ago.* da média/i }))

    // (3075 + 1495) / 2 = 2285 — e o denominador cai para 2.
    await waitFor(() => expect(screen.getByText('2285')).toBeInTheDocument())
    expect(screen.getByText(/2 de 30 dias com lançamento · 1 fora da média/)).toBeInTheDocument()
  })

  it('grava a marca no banco, e desmarcar apaga', async () => {
    abrir()
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /Tirar .*22 de ago.* da média/i }))
    await waitFor(() => expect(escritas).toHaveLength(1))
    expect(escritas[0][0]).toBe('insert')

    fireEvent.click(screen.getByRole('button', { name: /Voltar .*22 de ago.* para a média/i }))
    await waitFor(() => expect(escritas).toHaveLength(2))
    expect(escritas[1]).toEqual(['delete', '2026-08-22'])
  })

  it('o dia marcado no banco já nasce fora da média ao abrir', async () => {
    marcasResposta = { data: [{ date: '2026-08-22' }], error: null }
    abrir()
    await waitFor(() => expect(screen.getByText(/2 de 30 dias com lançamento · 1 fora da média/)).toBeInTheDocument())
    expect(screen.getByText('2285')).toBeInTheDocument()
  })

  it('o PDF mostra o dia na tabela mas fora do total, e EXPLICA', async () => {
    // Sumir com a linha esconderia do profissional que houve lançamento; deixar
    // sem aviso faria a soma da coluna não bater com o rodapé.
    marcasResposta = { data: [{ date: '2026-08-22' }], error: null }
    abrir()
    await waitFor(() => expect(screen.getByText(/1 fora da média/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /salvar pdf/i }))
    await waitFor(() => expect(exportSpy).toHaveBeenCalled())
    const { html } = exportSpy.mock.calls[0][0] as { html: string }

    expect(html).toContain('580')                       // a linha continua lá
    expect(html).toContain('fora da média')             // rotulada
    expect(html).toMatch(/não entram<\/strong> nas médias/) // e explicada
    expect(html).toContain('4.570')                     // total = 3075 + 1495
  })

  it('falha ao gravar DESFAZ a marca — média nunca fica sobre algo não salvo', async () => {
    abrir()
    await esperarLista()
    falharEscrita = true
    fireEvent.click(screen.getByRole('button', { name: /Tirar .*22 de ago.* da média/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/não consegui salvar/i))
    // Voltou para os 3 dias: a média é de novo 1717.
    expect(screen.getByText('1717')).toBeInTheDocument()
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

/**
 * O detalhe por refeição no relatório (pedido do dono, 25/08/2026).
 *
 * Antes o nutricionista lia "5 refeições" e não via QUAIS — a contagem de um
 * dado que ele precisa por inteiro. Estes casos medem a FIAÇÃO: o modal busca,
 * agrupa e entrega ao gerador. `buildNutritionPeriodHtml` passa verde sozinho
 * com o botão entregando `null`.
 */
describe('refeições no relatório', () => {
  const htmlExportado = () => String((exportSpy.mock.calls.at(-1)?.[0] as { html?: string } | undefined)?.html ?? '')

  it('o PDF lista as refeições de cada dia, com hora em BRT', async () => {
    abrir()
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /salvar pdf/i }))
    await waitFor(() => expect(exportSpy).toHaveBeenCalled())
    const html = htmlExportado()
    expect(html).toContain('Refeições, dia a dia')
    expect(html).toContain('Almoço')
    expect(html).toContain('150g arroz')
    // 23:40Z do dia 21 é 20:40 em São Paulo — e o dia continua sendo o 21.
    expect(html).toContain('20:40')
  })

  it('janela longa sai sem o detalhe e DIZ o motivo, no papel e na tela', async () => {
    abrir()
    await esperarLista()
    fireEvent.click(screen.getByRole('button', { name: /^90 dias$/i }))
    await waitFor(() => expect(screen.getByText(/PDF sem detalhe por refeição/i)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/3 de 90 dias com lançamento/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /salvar pdf/i }))
    await waitFor(() => expect(exportSpy).toHaveBeenCalled())
    const html = htmlExportado()
    expect(html).toContain('Refeições, dia a dia')
    expect(html, 'omitir em silêncio faria o profissional ler ausência de refeição como ausência de registro')
      .toMatch(/até 31 dias/)
    expect(html).not.toContain('Almoço')
  })

  it('falha ao ler o detalhe não vira "não comeu nada"', async () => {
    abrir()
    await esperarLista()
    refeicoesResposta = { data: [], error: { message: 'boom' } }
    fireEvent.click(screen.getByRole('button', { name: /salvar pdf/i }))
    await waitFor(() => expect(exportSpy).toHaveBeenCalled())
    const html = htmlExportado()
    expect(html).toMatch(/Não consegui carregar o detalhe por refeição/i)
    // Os totais diários continuam íntegros — só o detalhe faltou.
    expect(html).toContain('3.075')
  })
})
