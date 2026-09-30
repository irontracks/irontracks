import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TierProfessor } from '@/lib/planos/publicos'

/**
 * `/para-professores` mostra o preço que a TABELA diz, não o que estava no JSX.
 *
 * O array `plans` da página já guardou `price: 49/97/179/249` à mão. Quando a
 * landing passou a ler `teacher_tiers`, as duas páginas ficaram com uma fonte
 * cada — e a divergência é silenciosa: ninguém vê até um cliente reclamar do
 * valor. O teste usa valores que NÃO existem no código antigo (R$ 12,30 · 456 ·
 * nomes novos): se aparecerem na tela, vieram do banco; se "49" ou "Starter"
 * aparecerem, são resíduo do array digitado.
 */

const lerTiers = vi.fn<() => Promise<TierProfessor[] | null>>()
vi.mock('@/lib/planos/lerPublicos', () => ({ lerTiersProfessorPublicos: () => lerTiers() }))

const tiersDoBanco: TierProfessor[] = [
  { chave: 'free', nome: 'Degustação', descricao: '', maxAlunos: 3, precoCentavos: 0 },
  { chave: 'starter', nome: 'Bronze', descricao: '', maxAlunos: 7, precoCentavos: 1230 },
  { chave: 'pro', nome: 'Prata', descricao: '', maxAlunos: 55, precoCentavos: 45600 },
  { chave: 'unlimited', nome: 'Rede', descricao: '', maxAlunos: null, precoCentavos: 99900 },
]

const pagina = async () => {
  const { default: Page } = await import('../app/para-professores/page')
  return render(await Page())
}

beforeEach(() => {
  lerTiers.mockReset()
})

describe('página do professor — preço do banco', () => {
  it('mostra nome, preço e teto que vieram da tabela (e nenhum dos antigos)', async () => {
    lerTiers.mockResolvedValue(tiersDoBanco)
    await pagina()
    const t = document.body.textContent ?? ''
    for (const nome of ['Degustação', 'Bronze', 'Prata', 'Rede']) expect(t).toContain(nome)
    expect(t).toContain('12,30') // centavos de verdade aparecem
    expect(t).toContain('456')
    expect(t).toContain('999')
    expect(t).toContain('Até 3 alunos')
    expect(t).toContain('Até 55 alunos')
    expect(t).toContain('Alunos ilimitados')
    // resíduo do array digitado: os nomes antigos não podem sobrar
    for (const velho of ['Starter', 'Unlimited']) expect(t).not.toContain(velho)
  })

  it('grátis vira "Grátis" e "Começar Grátis"; pago vira "Assinar Agora" (na seção de preços)', async () => {
    lerTiers.mockResolvedValue(tiersDoBanco)
    const { getByText } = await pagina()
    // "Começar Grátis" também existe em outros botões da página: escopo na seção.
    const secao = within(getByText('Comece de graça. Cresça sem limites.').closest('section')!)
    expect(secao.getByText('Grátis')).toBeTruthy()
    expect(secao.getByText('Começar Grátis')).toBeTruthy()
    expect(secao.getAllByText('Assinar Agora')).toHaveLength(3)
  })

  it('o destaque e a etiqueta seguem a chave do nível, não a posição', async () => {
    lerTiers.mockResolvedValue(tiersDoBanco)
    const { getAllByText, getByText } = await pagina()
    expect(getAllByText('Mais Popular')).toHaveLength(1)
    const cartao = getByText('Mais Popular').closest('div.relative')!
    expect(cartao.textContent).toContain('Prata')
  })

  it('o destaque VISUAL (borda e botão dourados) cai só no nível Pro', async () => {
    lerTiers.mockResolvedValue(tiersDoBanco)
    const { getByText } = await pagina()
    const secao = getByText('Comece de graça. Cresça sem limites.').closest('section')!
    const cartoes = [...secao.querySelectorAll('div.relative.rounded-2xl')]
    expect(cartoes).toHaveLength(4)
    const destacados = cartoes.filter((c) => c.className.includes('from-yellow-500/15'))
    expect(destacados).toHaveLength(1)
    expect(destacados[0].textContent).toContain('Prata')
    // e o botão dourado é o do mesmo cartão
    expect(destacados[0].querySelector('a')!.className).toContain('bg-yellow-500')
    for (const c of cartoes.filter((x) => x !== destacados[0])) {
      expect(c.querySelector('a')!.className).not.toContain('bg-yellow-500')
    }
  })

  it('banco fora do ar (null): a seção de preços some, o resto da página fica', async () => {
    lerTiers.mockResolvedValue(null)
    const { queryByText, getByText } = await pagina()
    expect(queryByText('Assinar Agora')).toBeNull()
    expect(document.body.textContent).not.toContain('Comece de graça. Cresça sem limites.')
    // a página continua sendo a página
    expect(getByText(/para Professores/)).toBeTruthy()
  })
})

describe('página do professor — a FORMA do código', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'app', 'para-professores', 'page.tsx'), 'utf8')
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

  it('lê os níveis do banco e não tem array de planos com preço digitado', () => {
    expect(codigo).toMatch(/await lerTiersProfessorPublicos\(\)/)
    expect(codigo).not.toMatch(/\bprice\s*:\s*\d/)
    expect(codigo).not.toMatch(/const plans\s*=\s*\[/)
  })

  it('a seção de preços só desenha quando há níveis', () => {
    expect(codigo).toMatch(/\{plans && \(/)
  })
})
