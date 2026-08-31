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

vi.mock('@/app/(app)/dashboard/nutrition/actions', () => ({
  applyGeneratedMealAction: (...args: unknown[]) => applyMealMock(...(args as [])),
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
  beforeEach(() => { applyMealMock.mockClear() })
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
 */
describe('MyDietPlan — observação da refeição', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    const abrirPrimeiraRefeicao = async () => {
        fireEvent.click(await screen.findByText('Café da Manhã'))
        return screen.findByPlaceholderText(/Observação ou dica/i)
    }

    it('cada refeição tem seu próprio campo, e ele nasce com o que já estava salvo', async () => {
        mockFetch({
            ...dayPlan,
            meals: [{ ...DAY_MEALS[0], note: 'bater no liquidificador' }, DAY_MEALS[1]],
        })
        render(<MyDietPlan dateKey="2026-08-03" canApply />)

        const campo = await abrirPrimeiraRefeicao()
        expect((campo as HTMLTextAreaElement).value).toBe('bater no liquidificador')
    })

    it('grava no BLUR, mandando o dia e a refeição certos — não a cada tecla', async () => {
        const fn = mockFetch(dayPlan)
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        const campo = await abrirPrimeiraRefeicao()

        fireEvent.change(campo, { target: { value: 'trocar por atum' } })
        // Digitar não pode gerar requisição: seria uma por caractere.
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
        const campo = await abrirPrimeiraRefeicao()

        fireEvent.blur(campo)
        await waitFor(() => expect(screen.queryByText('salvando…')).toBeNull())
        expect(fn.mock.calls.filter(([u]) => String(u).includes('/note'))).toHaveLength(0)
    })

    it('texto some ao apagar — é assim que o usuário desfaz', async () => {
        const fn = mockFetch({ ...dayPlan, meals: [{ ...DAY_MEALS[0], note: 'apagar isto' }, DAY_MEALS[1]] })
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        const campo = await abrirPrimeiraRefeicao()

        fireEvent.change(campo, { target: { value: '' } })
        fireEvent.blur(campo)
        await waitFor(() => {
            const chamada = fn.mock.calls.find(([u]) => String(u).includes('/diet-plan/note'))
            expect(JSON.parse(String((chamada?.[1] as RequestInit)?.body)).note).toBe('')
        })
    })

    it('falha ao salvar avisa E preserva o que a pessoa escreveu', async () => {
        // Perder o texto digitado por causa de uma falha de rede é o pior
        // desfecho possível aqui — ele não está em lugar nenhum além da tela.
        mockFetch(dayPlan, (url) =>
            String(url).includes('/diet-plan/note')
                ? { ok: false, status: 500, json: async () => ({ ok: false }) }
                : undefined,
        )
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        const campo = await abrirPrimeiraRefeicao()

        fireEvent.change(campo, { target: { value: 'não me perca' } })
        fireEvent.blur(campo)

        expect(await screen.findByText(/Não consegui salvar a observação/i)).toBeTruthy()
        expect((campo as HTMLTextAreaElement).value).toBe('não me perca')
    })

    it('a autocorreção fica LIGADA — é texto livre, não identificador', async () => {
        mockFetch(dayPlan)
        render(<MyDietPlan dateKey="2026-08-03" canApply />)
        const campo = await abrirPrimeiraRefeicao()
        expect(campo.getAttribute('autocorrect')).not.toBe('off')
        expect(campo.getAttribute('autocapitalize')).not.toBe('none')
    })
})
