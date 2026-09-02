import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import NutritionEntryCard, { type MealEntry, type EditDraft } from '../NutritionEntryCard'

/**
 * Editar a QUANTIDADE de um item já lançado (frente A do plano
 * `docs/plans/nutricao-editar-item-e-corte-composto.md`).
 *
 * Até esta tarefa o editor só sabia REMOVER e ADICIONAR: "250g arroz" lançado
 * por engano virava perder o item inteiro e relançar. O núcleo puro
 * (`mealItemQuantity.ts`) já tem sua própria suíte — aqui o que importa é a
 * FIAÇÃO: o campo aparece, o toque escala o item certo, a base do reescale é
 * sempre o item ORIGINAL (não o já editado), e item sem densidade não ganha
 * campo nenhum.
 */

const arroz = { label: '250g arroz branco', grams: 250, calories: 384, protein: 27, carbs: 29, fat: 18 }
const semDensidade = { label: 'Refeição antiga', grams: 0, calories: 500, protein: 30, carbs: 40, fat: 15 }
const daIa = { label: 'Arroz branco cozido', grams: 180, calories: 234, protein: 4, carbs: 51, fat: 0 }

const refeicao: MealEntry = {
  id: 'm1',
  created_at: '2026-09-02T12:00:00.000Z',
  food_name: 'Almoço',
  calories: 384,
  protein: 27,
  carbs: 29,
  fat: 18,
}

/**
 * O componente real é CONTROLADO de fora (`editDraft`/`onEditDraftChange` são
 * props) — quem dona o estado é `NutritionMixer`. Este harness reproduz
 * exatamente aquele contrato: `onEditDraftChange` aplica o updater sobre o
 * estado mais fresco, igual ao `setEditDraft(prev => ...)` real.
 */
function Harness({ draftInicial, onSave }: { draftInicial: EditDraft; onSave?: (d: EditDraft) => void }) {
  const [editDraft, setEditDraft] = useState<EditDraft>(draftInicial)
  return (
    <NutritionEntryCard
      item={refeicao}
      isExpanded
      onToggleExpand={() => {}}
      editingId={refeicao.id}
      editDraft={editDraft}
      editBusy={false}
      onStartEdit={() => {}}
      onCancelEdit={() => {}}
      onSaveEdit={() => onSave?.(editDraft)}
      onEditDraftChange={(updater) => setEditDraft((prev) => updater(prev))}
      confirmDeleteId=""
      entryBusyId=""
      onConfirmDelete={() => {}}
      onCancelDelete={() => {}}
      onDelete={() => {}}
    />
  )
}

describe('editar a quantidade de um item lançado', () => {
  it('reescala macros e rótulo proporcionalmente (250 → 150)', () => {
    render(<Harness draftInicial={{ food_name: 'Almoço', items: [arroz], itensOriginais: [arroz] }} />)

    const campo = screen.getByLabelText('Quantidade de 250g arroz branco')
    fireEvent.change(campo, { target: { value: '150' } })

    expect(screen.getByText('150g arroz branco')).toBeInTheDocument()
    // 384 * 0.6 = 230,4 → 230
    expect(screen.getByText(/230 kcal · P16 C17 G11/)).toBeInTheDocument()
  })

  it('round-trip 250 → 150 → 250 volta ao original exato (base é sempre o item ORIGINAL)', () => {
    render(<Harness draftInicial={{ food_name: 'Almoço', items: [arroz], itensOriginais: [arroz] }} />)

    const campo = () => screen.getByLabelText(/Quantidade de/)
    fireEvent.change(campo(), { target: { value: '150' } })
    expect(screen.getByText('150g arroz branco')).toBeInTheDocument()

    fireEvent.change(campo(), { target: { value: '250' } })
    expect(screen.getByText('250g arroz branco')).toBeInTheDocument()
    expect(screen.getByText(/384 kcal · P27 C29 G18/)).toBeInTheDocument()
  })

  it('preserva a unidade "ml" — não pode virar "g"', () => {
    const leite = { label: '500ml leite zero lactose', grams: 500, calories: 155, protein: 15, carbs: 24, fat: 0 }
    render(<Harness draftInicial={{ food_name: 'Lanche', items: [leite], itensOriginais: [leite] }} />)

    fireEvent.change(screen.getByLabelText(/Quantidade de/), { target: { value: '300' } })
    expect(screen.getByText('300ml leite zero lactose')).toBeInTheDocument()
    expect(screen.queryByText(/300g leite/)).toBeNull()
  })

  it('item da IA (rótulo sem quantidade) reescala via grams e mantém o rótulo', () => {
    render(<Harness draftInicial={{ food_name: 'Almoço', items: [daIa], itensOriginais: [daIa] }} />)

    fireEvent.change(screen.getByLabelText('Quantidade de Arroz branco cozido'), { target: { value: '90' } })
    // rotuloItem prefixa gramas porque o rótulo não começa com dígito.
    expect(screen.getByText('90g Arroz branco cozido')).toBeInTheDocument()
  })

  it('item sem densidade (grams: 0) não ganha campo — mostra a nota', () => {
    render(<Harness draftInicial={{ food_name: 'Almoço', items: [semDensidade], itensOriginais: [semDensidade] }} />)

    expect(screen.queryByLabelText(/Quantidade de/)).toBeNull()
    expect(screen.getByText(/quantidade não registrada/)).toBeInTheDocument()
  })

  it('novoValor <= 0 não apaga nem zera o item', () => {
    render(<Harness draftInicial={{ food_name: 'Almoço', items: [arroz], itensOriginais: [arroz] }} />)

    fireEvent.change(screen.getByLabelText(/Quantidade de/), { target: { value: '0' } })
    // O item continua com os macros originais — nada foi commitado.
    expect(screen.getByText(/384 kcal · P27 C29 G18/)).toBeInTheDocument()
  })

  it('remover um item também remove sua entrada em itensOriginais (arrays continuam paralelos)', () => {
    const feijao = { label: '100g feijão', grams: 100, calories: 130, protein: 9, carbs: 20, fat: 1 }
    let ultimoSave: EditDraft | undefined
    render(
      <Harness
        draftInicial={{ food_name: 'Almoço', items: [arroz, feijao], itensOriginais: [arroz, feijao] }}
        onSave={(d) => { ultimoSave = d }}
      />,
    )

    fireEvent.click(screen.getByLabelText('Remover 250g arroz branco'))
    // Só o feijão restou — reescalar ele agora não pode explodir por causa de
    // um itensOriginais desalinhado (tamanho diferente de items).
    fireEvent.change(screen.getByLabelText('Quantidade de 100g feijão'), { target: { value: '200' } })
    expect(screen.getByText('200g feijão')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(ultimoSave?.items).toHaveLength(1)
    expect(ultimoSave?.itensOriginais).toHaveLength(1)
  })

  it('adicionar um alimento novo também entra em itensOriginais, editável desde já', async () => {
    const onAddFood = vi.fn().mockResolvedValue({
      ok: true,
      items: [{ label: '50g whey', grams: 50, calories: 200, protein: 40, carbs: 5, fat: 2 }],
    })
    function HarnessComAdd() {
      const [editDraft, setEditDraft] = useState<EditDraft>({ food_name: 'Almoço', items: [], itensOriginais: [] })
      return (
        <NutritionEntryCard
          item={refeicao}
          isExpanded
          onToggleExpand={() => {}}
          editingId={refeicao.id}
          editDraft={editDraft}
          editBusy={false}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={() => {}}
          onEditDraftChange={(updater) => setEditDraft((prev) => updater(prev))}
          onAddFood={onAddFood}
          confirmDeleteId=""
          entryBusyId=""
          onConfirmDelete={() => {}}
          onCancelDelete={() => {}}
          onDelete={() => {}}
        />
      )
    }
    render(<HarnessComAdd />)
    fireEvent.change(screen.getByLabelText('Adicionar alimento'), { target: { value: '50g whey' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))

    const campo = await screen.findByLabelText('Quantidade de 50g whey')
    fireEvent.change(campo, { target: { value: '25' } })
    expect(await screen.findByText('25g whey')).toBeInTheDocument()
  })
})
