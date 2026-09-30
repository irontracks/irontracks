import { describe, expect, it, beforeAll } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import Pricing from '../Pricing'
import { montarPlanos } from '@/lib/planos/publicos'
import { APP_PLANS, TEACHER_TIERS } from '@/lib/planos/__tests__/fixtures'

/**
 * A seção de planos da landing, do jeito que a pessoa usa: abas, seletor
 * mensal/anual e as notas que não podem faltar.
 *
 * Os valores esperados aqui são os DA TABELA (fixtures no formato real do
 * banco) — o componente não tem número próprio, e é isso que este arquivo
 * garante junto com `landingPrecosDoBanco.test.ts`.
 */

beforeAll(() => {
  // jsdom não tem IntersectionObserver (whileInView do Motion).
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO
})

const planos = () => montarPlanos(APP_PLANS, TEACHER_TIERS)!
const limpo = (s: string | null) => (s ?? '').replace(/ /g, ' ')
const textoDaPagina = () => limpo(document.body.textContent)

describe('Pricing — aba "Para treinar" (padrão)', () => {
  it('mostra os três planos com o preço mensal da tabela', () => {
    render(<Pricing planos={planos()} />)
    const t = textoDaPagina()
    expect(t).toContain('R$ 29,90')
    expect(t).toContain('R$ 59,90')
    expect(t).toContain('R$ 99,90')
    for (const nome of ['VIP Start', 'VIP Pro', 'VIP Elite']) expect(t).toContain(nome)
  })

  it('o Pro leva o selo de "Mais escolhido" e o botão do trial; os outros, não', () => {
    render(<Pricing planos={planos()} />)
    expect(screen.getAllByText('Mais escolhido')).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: /Testar 14 dias grátis/ })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: /Criar conta grátis/ })).toHaveLength(2)
  })

  it('todo botão leva ao app em /app — nunca à raiz, que é a landing', () => {
    render(<Pricing planos={planos()} />)
    const botoes = [
      ...screen.getAllByRole('link', { name: /Testar 14 dias grátis/ }),
      ...screen.getAllByRole('link', { name: /Criar conta grátis/ }),
    ]
    expect(botoes.length).toBe(3)
    for (const a of botoes) expect(a.getAttribute('href')).toBe('/app')
  })

  it('mostra o anual como "ou R$ 299 por ano" no modo mensal', () => {
    render(<Pricing planos={planos()} />)
    expect(textoDaPagina()).toContain('ou R$ 299 por ano')
  })

  it('o seletor Anual troca os três preços, a unidade e mostra o equivalente por mês', () => {
    render(<Pricing planos={planos()} />)
    fireEvent.click(screen.getByRole('button', { name: /Anual/ }))
    const t = textoDaPagina()
    expect(t).toContain('R$ 299')
    expect(t).toContain('R$ 599')
    expect(t).toContain('R$ 999')
    expect(t).toContain('/ano')
    expect(t).toContain('equivale a R$ 24,92 por mês')
    expect(t).not.toContain('R$ 29,90')
    expect(screen.getByRole('button', { name: /Anual/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Mensal' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('o rótulo do Anual diz quantos meses saem de graça (calculado, não digitado)', () => {
    render(<Pricing planos={planos()} />)
    expect(screen.getByRole('button', { name: /Anual · 2 meses grátis/ })).toBeTruthy()
  })

  it('traz as duas notas: uso justo (por causa do "Ilimitado*") e a do iPhone', () => {
    render(<Pricing planos={planos()} />)
    const t = textoDaPagina()
    expect(t).toContain('Ilimitado*')
    expect(t).toContain('política de uso justo')
    expect(t).toContain('No iPhone a assinatura é mensal')
  })

  it('o que um plano não tem aparece dito ao leitor de tela', () => {
    render(<Pricing planos={planos()} />)
    const start = screen.getByText('VIP Start').closest('li')!
    expect(within(start).getAllByText(/\(não incluso\)/).length).toBeGreaterThanOrEqual(3)
  })

  it('sem plano anual em nenhum dos planos: sem seletor e sem a nota do iPhone', () => {
    const semAnual = montarPlanos(APP_PLANS.filter((p) => p.interval !== 'year'), TEACHER_TIERS)!
    render(<Pricing planos={semAnual} />)
    expect(screen.queryByRole('button', { name: /Anual/ })).toBeNull()
    expect(textoDaPagina()).not.toContain('No iPhone a assinatura é mensal')
  })

  it('anual só em parte dos planos não liga o seletor (preço misto seria mentira)', () => {
    const parcial = montarPlanos(APP_PLANS.filter((p) => p.id !== 'vip_pro_annual'), TEACHER_TIERS)!
    render(<Pricing planos={parcial} />)
    expect(screen.queryByRole('button', { name: /Anual/ })).toBeNull()
  })
})

describe('Pricing — aba "Para professores"', () => {
  const abrir = () => {
    render(<Pricing planos={planos()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Para professores' }))
  }

  it('troca o painel e mostra os cinco níveis com preço e teto de alunos da tabela', () => {
    abrir()
    const t = textoDaPagina()
    for (const nome of ['Free', 'Starter', 'Pro', 'Elite', 'Unlimited']) expect(t).toContain(nome)
    expect(t).toContain('Grátis')
    expect(t).toContain('R$ 49')
    expect(t).toContain('R$ 97')
    expect(t).toContain('R$ 179')
    expect(t).toContain('R$ 249')
    expect(t).toContain('Até 2 alunos')
    expect(t).toContain('Até 15 alunos')
    expect(t).toContain('Até 100 alunos')
    expect(t).toContain('Alunos ilimitados')
    // e a aba do aluno saiu de cena
    expect(t).not.toContain('VIP Start')
  })

  it('custo por aluno só onde há teto e preço', () => {
    abrir()
    const t = textoDaPagina()
    expect(t).toContain('R$ 3,27 por aluno com o plano cheio')
    expect(t).toContain('R$ 2,43 por aluno com o plano cheio')
    expect(t).toContain('R$ 1,79 por aluno com o plano cheio')
    expect(t.match(/por aluno com o plano cheio/g)).toHaveLength(3)
  })

  it('o Pro de professor é o "Mais popular" e há UM só destaque', () => {
    abrir()
    expect(screen.getAllByText('Mais popular')).toHaveLength(1)
    expect(within(screen.getByText('Mais popular').closest('li')!).getByText('Pro')).toBeTruthy()
  })

  it('leva ao app e à página do professor', () => {
    abrir()
    expect(screen.getByRole('link', { name: 'Começar grátis' }).getAttribute('href')).toBe('/app')
    expect(screen.getAllByRole('link', { name: 'Começar' })).toHaveLength(4)
    expect(screen.getByRole('link', { name: /Conhecer a área do professor/ }).getAttribute('href')).toBe('/para-professores')
  })
})

describe('Pricing — abas acessíveis', () => {
  it('tablist com duas abas, a ativa marcada e ligada ao painel por id', () => {
    render(<Pricing planos={planos()} />)
    expect(screen.getByRole('tablist', { name: 'Tipo de plano' })).toBeTruthy()
    const [treinar, professores] = screen.getAllByRole('tab')
    expect(treinar.getAttribute('aria-selected')).toBe('true')
    expect(professores.getAttribute('aria-selected')).toBe('false')
    const painel = screen.getByRole('tabpanel')
    expect(painel.getAttribute('id')).toBe(treinar.getAttribute('aria-controls'))
    expect(painel.getAttribute('aria-labelledby')).toBe(treinar.getAttribute('id'))
  })

  it('só a aba ativa entra na ordem do Tab; a outra fica a uma seta de distância', () => {
    render(<Pricing planos={planos()} />)
    const [treinar, professores] = screen.getAllByRole('tab')
    expect(treinar.getAttribute('tabindex')).toBe('0')
    expect(professores.getAttribute('tabindex')).toBe('-1')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' })
    expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true')
  })
})
