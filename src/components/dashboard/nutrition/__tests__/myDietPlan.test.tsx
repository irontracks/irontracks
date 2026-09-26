import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * A tela da dieta salva — onde o cardápio vira algo pra SEGUIR.
 *
 * Plano de dia e de semana usam o MESMO render (`planDays` devolve sempre uma lista
 * de dias; um dia é a lista de um elemento). Duas telas separadas divergiriam com o
 * tempo, que é o padrão de bug mais caro deste repo.
 */

const applyMealMock = vi.fn(async () => ({ ok: true }))
let confirmaRemocao = true
vi.mock('@/contexts/DialogContext', () => ({
  useDialog: () => ({ confirm: async () => confirmaRemocao, alert: async () => undefined }),
}))

vi.mock('@/app/app/(app)/dashboard/nutrition/actions', () => ({
  applyGeneratedMealAction: (...args: unknown[]) => applyMealMock(...(args as [])),
}))

// O reajuste automático só entra em cena quando ligado — a suíte existente
// testa o comportamento SEM ele (default), então o mock fixa desligado.
// Os testes do reajuste em si (abaixo, neste arquivo) sobrescrevem isto.
let nutritionAutoAdjustMock = false
vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-teste' } } }) } }),
}))
vi.mock('@/hooks/useUserSettings', () => ({
  useUserSettings: () => ({
    settings: { nutritionAutoAdjust: nutritionAutoAdjustMock },
    save: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock('../useCustomFoods', () => ({
  useCustomFoods: () => ({ foods: [] }),
}))

// Controlável por teste: o que "adicionar alimento" resolve. Default: erro
// (nenhum teste que não seja de adicionar deveria bater aqui).
let resolveFoodMock = vi.fn(async () => ({ ok: false, error: 'não usado neste teste' }))
vi.mock('@/lib/nutrition/resolveFoodForEditor', () => ({
  resolveFoodForEditor: (...args: unknown[]) => resolveFoodMock(...(args as [])),
}))

import MyDietPlan from '../MyDietPlan'

const item = (food: string, grams: number, calories: number, protein: number) =>
  ({ food, grams, calories, protein, carbs: 0, fat: 0 })

const DAY_MEALS = [
  { name: 'Café da Manhã', time: '07:00', items: [item('Pão Francês', 100, 270, 9), item('Clara de Ovo', 150, 78, 17)] },
  { name: 'Almoço', items: [item('Frango', 200, 330, 62)] },
]

const dayPlan = { id: 'p1', plan_name: 'Minha dieta', plan_kind: 'day', meals: DAY_MEALS, days: null }

/** Semana com os 7 dias, cada um com o mesmo formato de refeições. */
const weekPlan = {
  id: 'p2',
  plan_name: 'Meu plano da semana',
  plan_kind: 'week',
  meals: [],
  days: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({ weekday, meals: DAY_MEALS })),
}

const mockFetch = (plan: unknown, extra?: (url: string, init?: RequestInit) => unknown) => {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const custom = extra?.(String(url), init)
    if (custom) return custom as Response
    return { ok: true, status: 200, json: async () => ({ ok: true, plan }) } as unknown as Response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('MyDietPlan', () => {
  beforeEach(() => { applyMealMock.mockClear(); nutritionAutoAdjustMock = false })
  afterEach(() => { vi.unstubAllGlobals() })

  it('sem plano salvo não renderiza nada — não polui a tela com card vazio', async () => {
    mockFetch(null)
    const { container } = render(<MyDietPlan dateKey="2026-08-03" canApply />)
    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('plano de UM dia: mostra as refeições e NÃO mostra navegação de dias', async () => {
    mockFetch(dayPlan)
    render(<MyDietPlan dateKey="2026-08-03" canApply />)

    expect(await screen.findByText('Café da Manhã')).toBeTruthy()
    expect(screen.getByText(/Plano de um dia/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Seg' })).toBeNull()
  })

  it('nome padrão do servidor não vira título repetido embaixo do rótulo', async () => {
    // O card já se chama "MINHA DIETA"; com o default "Minha dieta" vindo do
    // servidor, a tela mostrava o mesmo texto duas vezes, uma embaixo da outra.
    mockFetch(dayPlan)
    render(<MyDietPlan dateKey="2026-08-03" canApply />)
    await screen.findByText('Café da Manhã')
    expect(screen.getAllByText(/^Minha dieta$/i)).toHaveLength(1)
  })

  it('nome personalizado APARECE — o corte é só pro texto redundante', async () => {
    mockFetch({ ...dayPlan, plan_name: 'Cardápio da cutting' })
    render(<MyDietPlan dateKey="2026-08-03" canApply />)
    expect(await screen.findByText('Cardápio da cutting')).toBeTruthy()
  })

  it('plano de SEMANA: mostra os 7 dias e diz quantos são', async () => {
    mockFetch(weekPlan)
    render(<MyDietPlan dateKey="2026-08-03" canApply />)

    expect(await screen.findByText(/Plano da semana · 7 dias/i)).toBeTruthy()
    for (const label of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy()
    }
  })

  it('a semana abre no dia de HOJE, não no primeiro da lista', async () => {
    // Data FIXA numa quarta-feira. Sem isso o teste passava por coincidência: a
    // lista começa na segunda, então rodar numa segunda faz o índice 0 acertar
    // sozinho — e a mutação "abre sempre no índice 0" passava despercebida.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-05T12:00:00'))
    try {
      expect(new Date().getDay()).toBe(3) // quarta
      mockFetch(weekPlan)
      render(<MyDietPlan dateKey="2026-08-05" canApply />)

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: /Qua/ }).getAttribute('aria-pressed')).toBe('true')
      })
      expect(screen.getByRole('button', { name: /Seg/ }).getAttribute('aria-pressed')).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * ESTE CASO ERA FLAKY, e a intermitência era um BUG DE PRODUTO — não
   * fragilidade de teste (investigado em 10/08/2026, depois de derrubar o CI).
   *
   * O posicionamento automático ("abre no dia de HOJE") roda no efeito que
   * observa `days`, e os botões de dia JÁ ESTÃO na tela nesse instante. Quem
   * tocasse num dia antes de o efeito rodar era devolvido para hoje em
   * silêncio — e o swap seguia com o índice errado. Sem relógio fixo, o teste
   * pegava isso só quando o dia real não fosse quarta E a ordem desse azar:
   * 62 execuções locais passaram; o runner do CI, mais lento, reprovou.
   *
   * Agora o relógio é FIXO (segunda), e o caso abaixo varre a semana inteira.
   */
  it('trocar alimento manda o DIA selecionado — não sempre o dia 0', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.setSystemTime(new Date('2026-08-03T12:00:00')) // segunda: hoje ≠ quarta
      const fetchMock = mockFetch(weekPlan, (url, init) => {
        if (url.includes('/swap')) {
          return { ok: true, status: 200, json: async () => ({ ok: true, plan: weekPlan, swapped: { food: 'Atum' } }) }
        }
        void init
        return null
      })
      render(<MyDietPlan dateKey="2026-08-03" canApply />)

      // Vai pra quarta (índice 2 na lista que começa na segunda) e abre a refeição.
      fireEvent.click(await screen.findByRole('button', { name: /Qua/ }))
      fireEvent.click(screen.getByRole('button', { name: /Café da Manhã/ }))
      fireEvent.click(await screen.findByRole('button', { name: /Trocar Pão Francês/ }))

      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/swap'))
        expect(call).toBeTruthy()
        const body = JSON.parse(String((call?.[1] as RequestInit)?.body))
        expect(body.dayIndex).toBe(2)
        expect(body.mealIndex).toBe(0)
        expect(body.itemIndex).toBe(0)
      })
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * A CLASSE do bug, não a instância: em QUALQUER dia da semana, tocar num dia
   * encerra o posicionamento automático. Sem varrer os sete, o caso acima
   * passaria sozinho numa quarta-feira — dia em que o automático já acerta o
   * índice 2 e o clique não precisa funcionar.
   */
  describe('a escolha do dia sobrevive ao posicionamento automático', () => {
    // 02/08/2026 é domingo; sete dias seguidos cobrem a semana.
    const SEMANA = ['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08']

    for (const hoje of SEMANA) {
      const diaDaSemana = new Date(`${hoje}T12:00:00`).getDay()
      it(`com hoje = ${hoje} (getDay ${diaDaSemana}), o swap vai para o dia TOCADO`, async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        try {
          vi.setSystemTime(new Date(`${hoje}T12:00:00`))
          const fetchMock = mockFetch(weekPlan, (url) => (
            url.includes('/swap')
              ? { ok: true, status: 200, json: async () => ({ ok: true, plan: weekPlan, swapped: { food: 'Atum' } }) }
              : null
          ))
          render(<MyDietPlan dateKey={hoje} canApply />)

          fireEvent.click(await screen.findByRole('button', { name: /Qua/ }))
          fireEvent.click(screen.getByRole('button', { name: /Café da Manhã/ }))
          fireEvent.click(await screen.findByRole('button', { name: /Trocar Pão Francês/ }))

          await waitFor(() => {
            const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/swap'))
            expect(call).toBeTruthy()
            expect(JSON.parse(String((call?.[1] as RequestInit)?.body)).dayIndex).toBe(2)
          })
        } finally {
          vi.useRealTimers()
        }
      })
    }
  })

  it('depois de trocar um alimento, o usuário CONTINUA no dia que escolheu', async () => {
    /*
     * O reposicionamento "abre no dia de hoje" dependia de `days`, que muda de
     * identidade a cada atualização do plano — e trocar um alimento atualiza o
     * plano. Resultado: o usuário ia para sexta, trocava o pão, e a tela voltava
     * para hoje com a troca aplicada num dia que ele não estava mais vendo.
     *
     * O caso precisa esperar o EFEITO do swap (o alimento novo na tela), não só a
     * chamada: assertar logo após o clique passa verde com o bug presente, porque
     * a resposta ainda não foi processada.
     */
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.setSystemTime(new Date('2026-08-04T12:00:00')) // terça

      // O plano que volta do swap tem o item trocado NA SEXTA (índice 4).
      const trocado = JSON.parse(JSON.stringify(weekPlan))
      trocado.days[4].meals = [
        { name: 'Café da Manhã', time: '07:00', items: [item('Atum', 120, 130, 28), item('Clara de Ovo', 150, 78, 17)] },
        { name: 'Almoço', items: [item('Frango', 200, 330, 62)] },
      ]
      mockFetch(weekPlan, (url) =>
        url.includes('/swap')
          ? { ok: true, status: 200, json: async () => ({ ok: true, plan: trocado, swapped: { food: 'Atum' } }) }
          : null,
      )
      render(<MyDietPlan dateKey="2026-08-04" canApply />)

      // Abre em terça (hoje) e o usuário navega para sexta.
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: /Ter/ }).getAttribute('aria-pressed')).toBe('true')
      })
      fireEvent.click(screen.getByRole('button', { name: /Sex/ }))
      fireEvent.click(screen.getByRole('button', { name: /Café da Manhã/ }))
      fireEvent.click(await screen.findByRole('button', { name: /Trocar Pão Francês/ }))

      // O Atum só existe na SEXTA: vê-lo prova que o swap foi processado E que a
      // tela continua na sexta. Se o dia tivesse voltado para terça, some.
      expect(await screen.findByText(/Atum/)).toBeTruthy()
      expect(screen.getByRole('button', { name: /Sex/ }).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByRole('button', { name: /Ter/ }).getAttribute('aria-pressed')).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  it('o alimento recusado não volta na próxima troca do mesmo item', async () => {
    const fetchMock = mockFetch(dayPlan, (url) =>
      url.includes('/swap')
        ? { ok: true, status: 200, json: async () => ({ ok: true, plan: dayPlan, swapped: { food: 'Atum' } }) }
        : null,
    )
    render(<MyDietPlan dateKey="2026-08-03" canApply />)

    fireEvent.click(await screen.findByRole('button', { name: /Almoço/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Trocar Frango/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/swap'))).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: /Trocar Frango/ }))
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/swap'))
      expect(calls.length).toBe(2)
      expect(JSON.parse(String((calls[1][1] as RequestInit).body)).reject).toContain('Atum')
    })
  })

  it('sem substituto, explica em vez de falhar calado', async () => {
    mockFetch(dayPlan, (url) =>
      url.includes('/swap')
        ? { ok: false, status: 409, json: async () => ({ ok: false, error: 'no_alternative' }) }
        : null,
    )
    render(<MyDietPlan dateKey="2026-08-03" canApply />)

    fireEvent.click(await screen.findByRole('button', { name: /Almoço/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Trocar Frango/ }))
    expect(await screen.findByText(/Não achei outro alimento parecido/i)).toBeTruthy()
  })

  it('lançar refeição só aparece quando é o dia de hoje', async () => {
    mockFetch(dayPlan)
    const { rerender } = render(<MyDietPlan dateKey="2026-08-03" canApply={false} />)
    fireEvent.click(await screen.findByRole('button', { name: /Almoço/ }))
    expect(screen.queryByRole('button', { name: /Lançar refeição/ })).toBeNull()

    rerender(<MyDietPlan dateKey="2026-08-03" canApply />)
    expect(await screen.findByRole('button', { name: /Lançar refeição/ })).toBeTruthy()
  })

  it('remover o plano chama DELETE e some da tela', async () => {
    const fetchMock = mockFetch(dayPlan, (url, init) =>
      (init as RequestInit)?.method === 'DELETE'
        ? { ok: true, status: 200, json: async () => ({ ok: true }) }
        : (void url, null),
    )
    const { container } = render(<MyDietPlan dateKey="2026-08-03" canApply />)

    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(container.textContent).toBe(''))
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'DELETE')).toBe(true)
  })

  /**
   * Apagar o plano era um toque, sem pergunta — enquanto apagar UMA refeição já
   * confirmava. A fricção estava na ação de menor dano.
   */
  it('desistir da confirmação NÃO apaga o plano', async () => {
    confirmaRemocao = false
    try {
      const fetchMock = mockFetch(dayPlan, (url, init) =>
        (init as RequestInit)?.method === 'DELETE'
          ? { ok: true, status: 200, json: async () => ({ ok: true }) }
          : (void url, null),
      )
      const { container } = render(<MyDietPlan dateKey="2026-08-03" canApply />)

      fireEvent.click(await screen.findByRole('button', { name: 'Remover' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Remover' })).toBeTruthy())
      expect(
        fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'DELETE'),
        'o plano foi apagado mesmo com o usuário desistindo',
      ).toBe(false)
      expect(container.textContent).not.toBe('')
    } finally {
      confirmaRemocao = true
    }
  })
})

describe('source-guard: uma tela só, servindo as duas superfícies de nutrição', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const mixer = strip(readFileSync('src/components/dashboard/nutrition/NutritionMixer.tsx', 'utf8'))
  const overlay = strip(readFileSync('src/components/dashboard/nutrition/NutritionOverlay.tsx', 'utf8'))
  const card = strip(readFileSync('src/components/dashboard/nutrition/MyDietPlan.tsx', 'utf8'))

  it('o card mora no NutritionMixer', () => {
    expect(mixer).toMatch(/<MyDietPlan/)
  })

  it('o overlay reusa o Mixer — é isso que faz o card valer nas DUAS superfícies', () => {
    // O CLAUDE.md manda ajustar as duas superfícies de nutrição ao mexer nessa área.
    // Aqui elas compartilham o componente: se o overlay parar de reusar o Mixer,
    // este guard cai e alguém tem de decidir conscientemente o que fazer.
    expect(overlay).toMatch(/import NutritionMixer from '\.\/NutritionMixer'/)
    expect(overlay).toMatch(/<NutritionMixer/)
  })

  it('a leitura usa o helper canônico, não um parser próprio', () => {
    expect(card).toMatch(/planDays\(row\)/)
    expect(card).not.toMatch(/row\.days\s*\?\s*row\.days\s*:/)
  })
})

/**
 * Observação por refeição — o espaço pra dica ("bater no liquidificador",
 * "se não tiver frango, atum").
 *
 * Mora DENTRO do JSON da refeição (`days[].meals[].note`), não numa coluna: a
 * tabela guarda o plano em JSONB, então o campo não custou migration.
 *
 * ⚠️ **O estado VAZIO é o que este bloco protege.** Na primeira versão o
 * `<textarea>` era renderizado sempre, e no painel do professor — que lista as
 * refeições todas abertas — isso somava ~310px de caixas vazias num plano de 6
 * refeições, para um campo que quase nunca é preenchido. Hoje, sem nota, o
 * campo é um convite de uma linha.
 */
describe('MyDietPlan — observação da refeição', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    const abrirPrimeiraRefeicao = async () => {
        fireEvent.click(await screen.findByText('Café da Manhã'))
    }

    it('sem nota NÃO mostra caixa de texto — só o convite de uma linha', async () => {
        mockFetch(dayPlan)
        const { container } = render(<MyDietPlan dateKey="2026-08-03" canApply />)
        await abrirPrimeiraRefeicao()

        expect(await screen.findByRole('button', { name: /Observação/i })).toBeTruthy()
        expect(
            container.querySelector('textarea'),
            'caixa vazia empilhada é o ruído que esta mudança removeu',
        ).toBeNull()
    })

    it('tocar no convite abre o campo JÁ FOCADO — senão são dois toques', async () => {
        mockFetch(dayPlan)
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        await abrirPrimeiraRefeicao()
        fireEvent.click(await screen.findByRole('button', { name: /Observação/i }))

        const campo = await screen.findByPlaceholderText(/bater no liquidificador/i)
        await waitFor(() => expect(document.activeElement).toBe(campo))
    })

    it('com nota salva, o campo já vem aberto e preenchido', async () => {
        mockFetch({
            ...dayPlan,
            meals: [{ ...DAY_MEALS[0], note: 'bater no liquidificador' }, DAY_MEALS[1]],
        })
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        await abrirPrimeiraRefeicao()

        const campo = await screen.findByPlaceholderText(/bater no liquidificador/i)
        expect((campo as HTMLTextAreaElement).value).toBe('bater no liquidificador')
    })

    it('grava no BLUR, com o dia e a refeição certos — não a cada tecla', async () => {
        const fn = mockFetch(dayPlan)
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        await abrirPrimeiraRefeicao()
        fireEvent.click(await screen.findByRole('button', { name: /Observação/i }))
        const campo = await screen.findByPlaceholderText(/bater no liquidificador/i)

        fireEvent.change(campo, { target: { value: 'trocar por atum' } })
        expect(fn.mock.calls.filter(([u]) => String(u).includes('/note'))).toHaveLength(0)

        fireEvent.blur(campo)
        await waitFor(() => {
            const chamada = fn.mock.calls.find(([u]) => String(u).includes('/diet-plan/note'))
            expect(chamada, 'o blur tinha que gravar').toBeTruthy()
            const body = JSON.parse(String((chamada?.[1] as RequestInit)?.body))
            expect(body).toMatchObject({ dayIndex: 0, mealIndex: 0, note: 'trocar por atum' })
        })
    })

    it('sair do campo sem mudar nada NÃO gasta requisição', async () => {
        const fn = mockFetch({ ...dayPlan, meals: [{ ...DAY_MEALS[0], note: 'já escrita' }, DAY_MEALS[1]] })
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        await abrirPrimeiraRefeicao()
        const campo = await screen.findByPlaceholderText(/bater no liquidificador/i)

        fireEvent.blur(campo)
        await waitFor(() => expect(screen.queryByText('salvando…')).toBeNull())
        expect(fn.mock.calls.filter(([u]) => String(u).includes('/note'))).toHaveLength(0)
    })

    it('texto apagado vira nota vazia — é assim que o usuário desfaz', async () => {
        const fn = mockFetch({ ...dayPlan, meals: [{ ...DAY_MEALS[0], note: 'apagar isto' }, DAY_MEALS[1]] })
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        await abrirPrimeiraRefeicao()
        const campo = await screen.findByPlaceholderText(/bater no liquidificador/i)

        fireEvent.change(campo, { target: { value: '' } })
        fireEvent.blur(campo)
        await waitFor(() => {
            const chamada = fn.mock.calls.find(([u]) => String(u).includes('/diet-plan/note'))
            expect(JSON.parse(String((chamada?.[1] as RequestInit)?.body)).note).toBe('')
        })
    })

    it('falha ao salvar avisa JUNTO do campo e preserva o texto', async () => {
        // O aviso ficava no topo da lista: a 6ª refeição falhava e a mensagem
        // nascia fora da tela. Perder o texto digitado seria o pior desfecho —
        // ele não está em nenhum outro lugar.
        mockFetch(dayPlan, (url) =>
            String(url).includes('/diet-plan/note')
                ? { ok: false, status: 500, json: async () => ({ ok: false }) }
                : undefined,
        )
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        await abrirPrimeiraRefeicao()
        fireEvent.click(await screen.findByRole('button', { name: /Observação/i }))
        const campo = await screen.findByPlaceholderText(/bater no liquidificador/i)

        fireEvent.change(campo, { target: { value: 'não me perca' } })
        fireEvent.blur(campo)

        const erro = await screen.findByText(/Não consegui salvar/i)
        expect((campo as HTMLTextAreaElement).value).toBe('não me perca')
        // "junto do campo" = dentro do mesmo bloco, não no topo da lista.
        expect(erro.closest('div')?.contains(campo)).toBe(true)
    })

    it('a autocorreção fica LIGADA — é texto livre, não identificador', async () => {
        mockFetch({ ...dayPlan, meals: [{ ...DAY_MEALS[0], note: 'x' }, DAY_MEALS[1]] })
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        await abrirPrimeiraRefeicao()
        const campo = await screen.findByPlaceholderText(/bater no liquidificador/i)
        expect(campo.getAttribute('autocorrect')).not.toBe('off')
        expect(campo.getAttribute('autocapitalize')).not.toBe('none')
    })
})

describe('MyDietPlan — reajuste automático (fiação real, não só o módulo puro)', () => {
  beforeEach(() => { applyMealMock.mockClear(); nutritionAutoAdjustMock = false })
  afterEach(() => { vi.unstubAllGlobals() })

  const itemPuro = (food: string, grams: number, protein: number, carbs: number, fat: number) =>
    ({ food, grams, calories: protein * 4 + carbs * 4 + fat * 9, protein, carbs, fat })

  const PLANO_COM_CARBO = {
    id: 'p3',
    plan_name: 'Minha dieta',
    plan_kind: 'day',
    meals: [
      { name: 'Almoço', items: [itemPuro('Arroz branco cozido', 200, 0, 56, 0)] },
      { name: 'Janta', items: [itemPuro('Arroz branco cozido', 200, 0, 56, 0), itemPuro('Carne moída magra', 200, 52, 0, 10)] },
    ],
    days: null,
  }

  // Lançou só metade do arroz do almoço — sobraram 28g de carboidrato.
  const ENTRIES_COM_DESVIO = [{ food_name: 'Almoço', calories: 112, protein: 0, carbs: 28, fat: 0 }]

  it('DESLIGADO: refeição pendente mostra o plano original, sem aviso', async () => {
    mockFetch(PLANO_COM_CARBO)
    render(<MyDietPlan dateKey="2026-08-03" canApply entries={ENTRIES_COM_DESVIO} />)
    fireEvent.click(await screen.findByRole('button', { name: /Janta/ }))
    expect(await screen.findByText('Carne moída magra')).toBeTruthy()
    // 200g originais, sem ajuste — o toggle está desligado. Quantidade agora é
    // campo editável (NumericInput), não texto puro — o valor mora no input.
    expect(screen.getByLabelText('Quantidade de Arroz branco cozido, em gramas')).toHaveValue('200')
    expect(screen.queryByText(/Reequilibrei/i)).toBeNull()
  })

  it('LIGADO: a refeição pendente absorve o que sobrou, e a tela avisa', async () => {
    nutritionAutoAdjustMock = true
    mockFetch(PLANO_COM_CARBO)
    render(<MyDietPlan dateKey="2026-08-03" canApply entries={ENTRIES_COM_DESVIO} />)

    expect(await screen.findByText(/Reequilibrei seu dia/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Janta/ }))
    await screen.findByText('Arroz branco cozido')
    // Mais que os 200g originais — absorveu o carboidrato que sobrou no almoço.
    // Quantidade é campo editável (NumericInput); o valor mora no input, não no texto.
    expect(screen.getByLabelText('Quantidade de Arroz branco cozido, em gramas')).not.toHaveValue('200')
  })

  it('LIGADO: refeição JÁ lançada nunca aparece alterada, mesmo se o toggle estiver ligado', async () => {
    nutritionAutoAdjustMock = true
    mockFetch(PLANO_COM_CARBO)
    render(<MyDietPlan dateKey="2026-08-03" canApply entries={ENTRIES_COM_DESVIO} />)
    await screen.findByText(/Reequilibrei seu dia/i)

    fireEvent.click(screen.getByRole('button', { name: /Almoço/ }))
    await screen.findByText('Arroz branco cozido')
    // O almoço é a refeição JÁ lançada — continua com os 200g do plano.
    expect(screen.getByLabelText('Quantidade de Arroz branco cozido, em gramas')).toHaveValue('200')
  })

  it('LIGADO: a refeição ajustada mostra o indicador 🧠 na lista fechada; as demais não', async () => {
    nutritionAutoAdjustMock = true
    mockFetch(PLANO_COM_CARBO)
    render(<MyDietPlan dateKey="2026-08-03" canApply entries={ENTRIES_COM_DESVIO} />)
    await screen.findByText(/Reequilibrei seu dia/i)

    const cardDaJanta = screen.getByRole('button', { name: /Janta/ })
    const cardDoAlmoco = screen.getByRole('button', { name: /Almoço/ })
    expect(cardDaJanta.textContent).toContain('🧠')
    expect(cardDoAlmoco.textContent).not.toContain('🧠')
  })

  it('LIGADO: editar a refeição JÁ lançada (entries muda) recalcula o ajuste sozinho, sem ação extra', async () => {
    // Cenário do dono: lançou a janta, depois editou (reduziu quantidade,
    // tirou um item) — a pergunta é se a PRÓXIMA refeição se reajusta
    // sozinha. A resposta está na arquitetura: nada aqui é persistido, o
    // ajuste é recalculado toda vez que `entries` muda — e `entries` É o
    // diário de verdade, atualizado pelo NutritionMixer após qualquer edição.
    nutritionAutoAdjustMock = true
    const planoTresRefeicoes = {
      id: 'p4',
      plan_name: 'Minha dieta',
      plan_kind: 'day',
      meals: [
        { name: 'Almoço', items: [itemPuro('Arroz branco cozido', 200, 0, 56, 0)] },
        { name: 'Janta', items: [itemPuro('Arroz branco cozido', 200, 0, 56, 0)] },
        { name: 'Ceia', items: [itemPuro('Aveia', 100, 0, 60, 0)] },
      ],
      days: null,
    }
    mockFetch(planoTresRefeicoes)

    // 1ª leitura: Almoço e Janta lançados EXATAMENTE como o plano — sem desvio.
    const entriesAntesDaEdicao = [
      { food_name: 'Almoço', calories: 224, protein: 0, carbs: 56, fat: 0 },
      { food_name: 'Janta', calories: 224, protein: 0, carbs: 56, fat: 0 },
    ]
    const { rerender } = render(<MyDietPlan dateKey="2026-08-03" canApply entries={entriesAntesDaEdicao} />)
    await screen.findByText('Ceia')
    expect(screen.queryByText(/Reequilibrei/i)).toBeNull()

    // 2ª leitura: o usuário EDITOU a janta (reduziu o arroz) — simula a nova
    // versão de `entries` que o NutritionMixer traria após o refetch.
    const entriesDepoisDaEdicao = [
      entriesAntesDaEdicao[0],
      { food_name: 'Janta', calories: 112, protein: 0, carbs: 28, fat: 0 },
    ]
    rerender(<MyDietPlan dateKey="2026-08-03" canApply entries={entriesDepoisDaEdicao} />)

    // Sem tocar em nada além de passar o `entries` novo, a Ceia (a PRÓXIMA
    // refeição, ainda não lançada) absorve o carboidrato que sobrou.
    expect(await screen.findByText(/Reequilibrei seu dia/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ceia/ }))
    await screen.findByText('Aveia')
    expect(screen.getByLabelText('Quantidade de Aveia, em gramas')).not.toHaveValue('100')
  })
})

describe('MyDietPlan — adicionar/tirar/mudar quantidade no lançamento (22/09/2026)', () => {
  beforeEach(() => {
    applyMealMock.mockClear()
    nutritionAutoAdjustMock = false
    resolveFoodMock = vi.fn(async () => ({ ok: false, error: 'não usado neste teste' }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  const itemJanta = (food: string, grams: number, protein: number, carbs: number, fat: number) =>
    ({ food, grams, calories: protein * 4 + carbs * 4 + fat * 9, protein, carbs, fat })

  // Arroz 244 kcal + Frango 207 kcal = 451 kcal.
  const PLANO_JANTA = {
    id: 'p5',
    plan_name: 'Minha dieta',
    plan_kind: 'day',
    meals: [
      { name: 'Jantar', items: [itemJanta('Arroz branco cozido', 200, 5, 56, 0), itemJanta('Frango grelhado', 150, 45, 0, 3)] },
    ],
    days: null,
  }

  it('tirar um item: some da lista, os totais do cabeçalho descontam ele, e o toque seguinte devolve', async () => {
    mockFetch(PLANO_JANTA)
    render(<MyDietPlan dateKey="2026-08-03" canApply />)
    fireEvent.click(await screen.findByRole('button', { name: /Jantar/ }))
    await screen.findByText('Frango grelhado')

    fireEvent.click(screen.getByRole('button', { name: 'Tirar Frango grelhado' }))
    // Riscado, não some da tela — mesma regra de "trocado" (o usuário precisa
    // continuar LENDO o que deixou de lado).
    expect(screen.getByText('Frango grelhado').className).toContain('line-through')
    // O cabeçalho da refeição (fechado por trás do botão) já reflete o desconto.
    await waitFor(() => expect(screen.getByRole('button', { name: /Jantar/ }).textContent).toContain('244 kcal'))

    fireEvent.click(screen.getByRole('button', { name: 'Manter Frango grelhado' }))
    expect(screen.getByText('Frango grelhado').className).not.toContain('line-through')
    await waitFor(() => expect(screen.getByRole('button', { name: /Jantar/ }).textContent).toContain('451 kcal'))
  })

  it('mudar a quantidade: reescala os macros do item e o cabeçalho', async () => {
    mockFetch(PLANO_JANTA)
    render(<MyDietPlan dateKey="2026-08-03" canApply />)
    fireEvent.click(await screen.findByRole('button', { name: /Jantar/ }))
    await screen.findByText('Arroz branco cozido')

    const campo = screen.getByLabelText('Quantidade de Arroz branco cozido, em gramas')
    fireEvent.change(campo, { target: { value: '100' } })
    // Metade do arroz (200→100, 244→122 kcal) + frango intacto (207) = 329.
    await waitFor(() => expect(screen.getByRole('button', { name: /Jantar/ }).textContent).toContain('329 kcal'))
    // A linha de macros do PRÓPRIO item também reflete a nova quantidade — não
    // pode dizer "100g" no campo e continuar mostrando os macros de 200g embaixo.
    expect(await screen.findByText('122 kcal')).toBeTruthy()
    expect(screen.queryByText('244 kcal')).toBeNull()
  })

  it('adicionar um alimento avulso: chama a resolução compartilhada e soma no cabeçalho', async () => {
    resolveFoodMock = vi.fn(async (texto: string) => {
      expect(texto).toBe('100g brócolis cozido')
      return { ok: true, items: [{ label: 'Brócolis cozido', grams: 100, calories: 40, protein: 3, carbs: 7, fat: 0 }] }
    })
    mockFetch(PLANO_JANTA)
    render(<MyDietPlan dateKey="2026-08-03" canApply />)
    fireEvent.click(await screen.findByRole('button', { name: /Jantar/ }))
    await screen.findByText('Arroz branco cozido')

    fireEvent.change(screen.getByLabelText('Adicionar alimento a Jantar'), { target: { value: '100g brócolis cozido' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))

    expect(await screen.findByText('Brócolis cozido')).toBeTruthy()
    // 451 (plano) + 40 (brócolis) = 491.
    await waitFor(() => expect(screen.getByRole('button', { name: /Jantar/ }).textContent).toContain('491 kcal'))
    expect(resolveFoodMock).toHaveBeenCalledTimes(1)
  })

  it('erro ao adicionar (alimento não reconhecido) mostra a mensagem, sem quebrar a tela', async () => {
    resolveFoodMock = vi.fn(async () => ({ ok: false, error: 'Não reconheci esse alimento.' }))
    mockFetch(PLANO_JANTA)
    render(<MyDietPlan dateKey="2026-08-03" canApply />)
    fireEvent.click(await screen.findByRole('button', { name: /Jantar/ }))
    await screen.findByText('Arroz branco cozido')

    fireEvent.change(screen.getByLabelText('Adicionar alimento a Jantar'), { target: { value: 'xyzabc123' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))

    expect(await screen.findByText('Não reconheci esse alimento.')).toBeTruthy()
  })

  it('o item adicionado só entra no lançamento — some ao tirar antes de lançar', async () => {
    resolveFoodMock = vi.fn(async () => ({
      ok: true, items: [{ label: 'Brócolis cozido', grams: 100, calories: 40, protein: 3, carbs: 7, fat: 0 }],
    }))
    mockFetch(PLANO_JANTA)
    render(<MyDietPlan dateKey="2026-08-03" canApply />)
    fireEvent.click(await screen.findByRole('button', { name: /Jantar/ }))
    await screen.findByText('Arroz branco cozido')

    fireEvent.change(screen.getByLabelText('Adicionar alimento a Jantar'), { target: { value: '100g brócolis cozido' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await screen.findByText('Brócolis cozido')

    fireEvent.click(screen.getByRole('button', { name: 'Tirar Brócolis cozido' }))
    await waitFor(() => expect(screen.queryByText('Brócolis cozido')).toBeNull())
  })

  it('lançar a refeição manda os itens exatamente como ajustados na tela (remoção + adição juntas)', async () => {
    resolveFoodMock = vi.fn(async () => ({
      ok: true, items: [{ label: 'Brócolis cozido', grams: 100, calories: 40, protein: 3, carbs: 7, fat: 0 }],
    }))
    mockFetch(PLANO_JANTA)
    render(<MyDietPlan dateKey="2026-08-03" canApply />)
    fireEvent.click(await screen.findByRole('button', { name: /Jantar/ }))
    await screen.findByText('Frango grelhado')

    fireEvent.click(screen.getByRole('button', { name: 'Tirar Frango grelhado' }))
    fireEvent.change(screen.getByLabelText('Adicionar alimento a Jantar'), { target: { value: '100g brócolis cozido' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await screen.findByText('Brócolis cozido')

    fireEvent.click(screen.getByRole('button', { name: '✚ Lançar refeição' }))
    await waitFor(() => expect(applyMealMock).toHaveBeenCalled())
    const [, , itensLancados] = applyMealMock.mock.calls[0] as [unknown, unknown, Array<{ label: string }>]
    const nomes = itensLancados.map((it) => it.label)
    expect(nomes).toContain('Arroz branco cozido')
    expect(nomes).toContain('Brócolis cozido')
    expect(nomes).not.toContain('Frango grelhado') // tirado — não pode ir pro diário
  })
})
