import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(process.cwd(), 'src/components/dashboard/nutrition/MyDietPlan.tsx'), 'utf8')

/**
 * Apagar o plano alimentar inteiro era UM toque, sem pergunta — enquanto apagar
 * uma refeição já pedia confirmação. A polaridade estava invertida em relação
 * ao dano: a ação de menor consequência tinha fricção, a de maior não.
 *
 * Agrava que o botão é `text-[10px] text-neutral-400` e só fica vermelho no
 * hover, que não existe no iPhone: no celular ele lê como controle neutro.
 */
describe('remover o plano alimentar', () => {
  it('pergunta antes de apagar', () => {
    const ini = src.indexOf('const removePlan')
    const fim = src.indexOf("method: 'DELETE'", ini)
    expect(ini, 'removePlan sumiu do arquivo').toBeGreaterThan(-1)
    expect(fim, 'o DELETE do plano sumiu do arquivo').toBeGreaterThan(ini)

    const antesDoDelete = src.slice(ini, fim)
    expect(
      antesDoDelete,
      'o DELETE do plano dispara sem confirmação — um toque apaga todos os dias e refeições',
    ).toMatch(/await\s+confirm\(/)
  })

  it('a confirmação se declara destrutiva e não devolve o dano no caminho do fechar', () => {
    const ini = src.indexOf('const removePlan')
    const bloco = src.slice(ini, src.indexOf("method: 'DELETE'", ini))

    expect(bloco, 'sem destructive o diálogo sai com o dourado de ação positiva').toMatch(/destructive:\s*true/)

    // `confirm` resolve false ao fechar por fora: remover PRECISA ser o confirmText.
    const opts = bloco.slice(bloco.indexOf('{', bloco.indexOf('await confirm(')))
    const confirmText = /confirmText:\s*'([^']+)'/.exec(opts)?.[1] ?? ''
    const cancelText = /cancelText:\s*'([^']+)'/.exec(opts)?.[1] ?? ''
    expect(confirmText.toLowerCase(), 'o texto destrutivo tem que ser o confirmText').toMatch(/remover|apagar|excluir/)
    expect(cancelText.toLowerCase(), 'o cancelText é o caminho SEGURO — não pode apagar').not.toMatch(/remover|apagar|excluir/)
  })
})
