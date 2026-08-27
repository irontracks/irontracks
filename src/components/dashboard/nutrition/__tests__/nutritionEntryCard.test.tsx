import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import NutritionEntryCard, { type MealEntry } from '../NutritionEntryCard'
import { MACRO_COLORS, MACRO_OVER_COLOR } from '@/lib/nutrition/macroColors'

/**
 * Card de lançamento da aba NUTRIÇÃO — auditoria de design, ago/2026.
 *
 * O achado que originou estes guards é SISTÊMICO: as cores de macro estavam
 * escritas três vezes no app, diferentes em cada lugar, e duas delas conviviam
 * na mesma tela — o carboidrato era azul no card Macronutrientes e amarelo
 * aqui, e a gordura pintava o bloco inteiro com o VERMELHO de erro. Corrigir só
 * este arquivo repetiria o ciclo; por isso a fonte agora é única e o guard
 * mira a fonte, não a instância.
 */

const rgb = (hex: string): string => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

const refeicao: MealEntry = {
  id: 'm1',
  created_at: '2026-08-10T20:00:00.000Z',
  food_name: 'Shake da tarde',
  calories: 655,
  protein: 45,
  carbs: 79,
  fat: 23,
  items: [{ label: '500ml leite zero lactose', grams: 500, calories: 155, protein: 15, carbs: 24, fat: 0 }],
}

const props = {
  item: refeicao,
  isExpanded: true,
  onToggleExpand: vi.fn(),
  editingId: '',
  editDraft: { food_name: '', items: [] },
  editBusy: false,
  onStartEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onSaveEdit: vi.fn(),
  onEditDraftChange: vi.fn(),
  confirmDeleteId: '',
  entryBusyId: '',
  onConfirmDelete: vi.fn(),
  onCancelDelete: vi.fn(),
  onDelete: vi.fn(),
}

describe('cores dos macros', () => {
  /**
   * A gordura era `#ef4444` — a cor de ERRO do app. 23g de gordura pintavam um
   * bloco inteiro de vermelho e o usuário lia "algo está errado" sobre um
   * número que só descrevia a refeição.
   */
  it('vermelho não é cor de macro — fica reservado a estouro de meta', () => {
    const { container } = render(<NutritionEntryCard {...props} />)
    expect(container.innerHTML).not.toContain(rgb(MACRO_OVER_COLOR))
    expect(container.querySelector('[class*="red-500/[0.08]"]')).toBeNull()
  })

  it('a barra de proporção usa as cores da fonte única', () => {
    const { container } = render(<NutritionEntryCard {...props} />)
    const html = container.innerHTML
    expect(html).toContain(rgb(MACRO_COLORS.protein))
    expect(html).toContain(rgb(MACRO_COLORS.carbs))
    expect(html).toContain(rgb(MACRO_COLORS.fat))
  })

  /**
   * O guard que importa: o componente não pode ter cor PRÓPRIA. Foi a cópia
   * local que deixou o carboidrato azul num card e amarelo no outro.
   */
  it('o componente não declara hex de macro por conta própria', () => {
    const src = readFileSync(join(__dirname, '..', 'NutritionEntryCard.tsx'), 'utf8')
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(src).toContain("from '@/lib/nutrition/macroColors'")
    expect(src, 'cor de macro sai da fonte única, nunca de um hex local').not.toMatch(/#[0-9a-fA-F]{6}/)
  })

  /**
   * ⚠️ ACHADO ABERTO, não resolvido aqui. Medido: proteína (#fbbf24, matiz 43°) e
   * gordura (#f97316, 25°) estão a apenas **18,7°** — o par mais fraco da
   * paleta, bem abaixo dos 40° que o heatmap Treino × Nutrição exige de si
   * mesmo. Onde cada cor tem rótulo ao lado (as barras do card Macronutrientes,
   * os três blocos deste card) isso passa; onde a cor carrega sozinha o
   * significado — a BARRA EMPILHADA no topo, com âmbar e laranja adjacentes —
   * é risco real de leitura.
   *
   * Não mexi na paleta por conta própria: trocar a cor da gordura muda três
   * telas e é decisão do dono. O guard trava o que já é sólido (carbo contra os
   * dois) e impede que o par fraco piore.
   */
  it('a fonte única distingue os três por matiz — com o par âmbar/laranja no limite', () => {
    const hue = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      if (max === min) return 0
      const d = max - min
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      return (h * 60 + 360) % 360
    }
    const dist = (a: string, b: string) => {
      const d = Math.abs(hue(a) - hue(b)) % 360
      return d > 180 ? 360 - d : d
    }
    expect(dist(MACRO_COLORS.protein, MACRO_COLORS.carbs)).toBeGreaterThan(40)
    expect(dist(MACRO_COLORS.carbs, MACRO_COLORS.fat)).toBeGreaterThan(40)
    // O par fraco: 18,7° hoje. Não é um alvo, é um piso — abaixo disso âmbar e
    // laranja colam de vez na barra empilhada.
    expect(dist(MACRO_COLORS.protein, MACRO_COLORS.fat)).toBeGreaterThanOrEqual(18)
  })
})

describe('o percentual diz de que é', () => {
  /** "45%" sozinho é lido como percentual de GRAMAS, que dá outro número. */
  it('rotula o percentual como fração das calorias', () => {
    render(<NutritionEntryCard {...props} />)
    expect(screen.getAllByText(/% das kcal/).length).toBe(3)
  })
})

describe('redundância', () => {
  /**
   * O rodapé repetia "Total: 655 kcal · 17:00" — os dois números já estão no
   * cabeçalho da MESMA caixa, a poucos pixels dali.
   */
  it('as calorias aparecem uma vez só, no cabeçalho', () => {
    render(<NutritionEntryCard {...props} />)
    expect(screen.getAllByText(/655 kcal/)).toHaveLength(1)
    expect(screen.queryByText(/^Total:/)).toBeNull()
  })
})

describe('confirmação de remoção', () => {
  /**
   * "Sim"/"Não" não dizem a que respondem — confirmação destrutiva nomeia a ação
   * no BOTÃO. A pergunta fica curta de propósito: "Remover este lançamento?" não
   * cabe ao lado de dois botões de 44px na largura de um iPhone e truncava na
   * tela ("Remover este lançament…"), visto no simulador.
   */
  it('a confirmação pergunta e nomeia a ação, sem "Sim"/"Não"', () => {
    render(<NutritionEntryCard {...props} confirmDeleteId="m1" />)
    expect(screen.getByText(/Tem certeza\?/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sim' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Não' })).toBeNull()
  })

  it('confirmar remove; cancelar não toca no lançamento', () => {
    const onDelete = vi.fn()
    const onCancelDelete = vi.fn()
    const { rerender } = render(
      <NutritionEntryCard {...props} confirmDeleteId="m1" onDelete={onDelete} onCancelDelete={onCancelDelete} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancelDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()

    rerender(<NutritionEntryCard {...props} confirmDeleteId="m1" onDelete={onDelete} onCancelDelete={onCancelDelete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }))
    expect(onDelete).toHaveBeenCalledWith('m1')
  })
})

describe('alvos de toque', () => {
  /** 44pt é o mínimo da HIG; o card inteiro estava em 32px (h-8) e 28px (w-7). */
  it('nenhum botão do card abaixo de 44px', () => {
    const src = readFileSync(join(__dirname, '..', 'NutritionEntryCard.tsx'), 'utf8')
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    const pequenos: string[] = []
    for (const trecho of src.split('<button').slice(1)) {
      const cls = trecho.match(/className=\{?[`"]([^`"]*)[`"]/)
      if (!cls) continue
      const classes = cls[1]
      // Alvo pode ser menor que 44px SE estender a área de toque com o
      // pseudo-elemento — recurso já usado no botão METAS.
      if (/before:-inset-\d/.test(classes)) continue
      for (const m of classes.matchAll(/\b(?:h|w|size)-(\d+(?:\.\d+)?)\b/g)) {
        if (parseFloat(m[1]) * 4 < 44) pequenos.push(m[0])
      }
    }
    expect(pequenos, `alvos abaixo de 44px: ${pequenos.join(', ')}`).toHaveLength(0)
  })
})

/**
 * A hora da refeição saía no fuso do DISPOSITIVO.
 *
 * `toLocaleTimeString('pt-BR', { hour, minute })` sem `timeZone` usa o fuso de
 * quem renderiza. O histórico de refeições e o relatório de período já usam
 * `America/Sao_Paulo` explícito (`horaBrt`), então a MESMA refeição aparecia
 * com horas diferentes em duas superfícies da mesma aba — e no SSR, que roda em
 * UTC, o café da manhã virava 11h.
 *
 * ⚠️ Este caso só reprova sozinho onde o runner NÃO está em BRT (o CI, em UTC):
 * na máquina do dono ele passa verde com o `timeZone` removido. Por isso o
 * source-guard vem junto — é a metade que fecha o buraco localmente. Mesma
 * lição do guard de hora do histórico de refeições.
 */
describe('a hora da refeição é sempre BRT', () => {
    it('não formata hora sem fuso explícito', () => {
        const src = readFileSync(join(__dirname, '..', 'NutritionEntryCard.tsx'), 'utf8')
        const codigo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
        expect(codigo, 'sem timeZone, usa o fuso de quem renderiza').not.toMatch(/toLocaleTimeString\(/)
        expect(codigo, 'reusa a fonte única em vez de reimplementar').toMatch(/horaBrt/)
    })

    it('e o formatador continua sendo o do histórico', () => {
        const fonte = readFileSync(join(__dirname, '..', '..', '..', '..', 'lib', 'nutrition', 'dayMeals.ts'), 'utf8')
        expect(fonte).toMatch(/const FUSO = 'America\/Sao_Paulo'/)
        expect(fonte).toMatch(/export function horaBrt/)
    })
})
