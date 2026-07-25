import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PlateCalculatorSheet from '../PlateCalculatorSheet'
import type { PlateInventory } from '@/utils/plates/plateInventory'

/** 6 anilhas de 20 kg + 2 de 10, barra de 20 — o inventário que motivou a feature. */
const HOME_INV: PlateInventory = { counts: { '20': 6, '10': 2 }, barWeightKg: 20 }

const setup = (over: Partial<React.ComponentProps<typeof PlateCalculatorSheet>> = {}) => {
  const onApply = vi.fn()
  const onSaveInventory = vi.fn()
  const onClose = vi.fn()
  render(
    <PlateCalculatorSheet
      isOpen
      onClose={onClose}
      exerciseName="Supino Reto"
      setLabel="Série 3"
      initialWeight={null}
      inventory={HOME_INV}
      onApply={onApply}
      onSaveInventory={onSaveInventory}
      {...over}
    />,
  )
  return { onApply, onSaveInventory, onClose }
}

const typeTarget = (value: string) => {
  const input = screen.getByLabelText('Peso desejado em quilos')
  fireEvent.change(input, { target: { value } })
  return input as HTMLInputElement
}

describe('PlateCalculatorSheet', () => {
  it('mostra a montagem por lado de um peso exato', () => {
    setup()
    typeTarget('80')
    expect(screen.getByText('Monta exato')).toBeTruthy()
    expect(screen.getByText(/Total montado/)).toBeTruthy()
  })

  it('avisa quando o peso não monta e oferece os dois vizinhos', () => {
    setup()
    typeTarget('82,5')
    expect(screen.getByText(/não monta com as suas anilhas/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '↓ 80 kg' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '↑ 100 kg' })).toBeTruthy()
  })

  /**
   * Regressão conhecida do repo (ver NumericInput): `<input type="number">` num WebView
   * com locale != pt-BR REJEITA a vírgula — "82,5" viraria impossível de digitar num
   * campo de peso, que é justamente o valor quebrado que a calculadora existe para
   * resolver. Este guard vale para TODOS os campos numéricos do sheet, não só o alvo.
   */
  it('nenhum campo numérico usa type="number" (bloqueia vírgula no WebView)', () => {
    const { container } = render(
      <PlateCalculatorSheet
        isOpen onClose={() => { }} exerciseName="Agachamento" setLabel="Série 1"
        initialWeight={null} inventory={HOME_INV} onApply={() => { }} onSaveInventory={() => { }}
      />,
    )
    expect(container.querySelectorAll('input[type="number"]').length).toBe(0)
    const target = screen.getAllByLabelText('Peso desejado em quilos')[0] as HTMLInputElement
    expect(target.getAttribute('type')).toBe('text')
    expect(target.getAttribute('inputmode')).toBe('decimal')
  })

  it('aceita vírgula como separador decimal', () => {
    setup()
    const input = typeTarget('82,5')
    expect(input.value).toBe('82,5')
    expect(screen.getByText(/82,5 kg não monta/)).toBeTruthy()
  })

  /**
   * O botão SEMPRE nomeia a série que vai receber o peso. Em drop-set/cluster/stripping
   * a "série corrente" tem sub-etapas — aplicar às cegas é a classe de bug que já mordeu
   * a família de renderers, então a confirmação é explícita.
   */
  it('o botão aplicar nomeia a série de destino', () => {
    const { onApply } = setup({ setLabel: 'Série 3' })
    typeTarget('80')
    const btn = screen.getByRole('button', { name: /Aplicar 80 kg → Série 3/ })
    fireEvent.click(btn)
    expect(onApply).toHaveBeenCalledWith(80)
  })

  it('não aplica peso zero/vazio', () => {
    setup()
    const btn = screen.getByRole('button', { name: /Aplicar/ }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('mostra as cargas montáveis e o menor salto real', () => {
    setup()
    expect(screen.getAllByText(/20 · 40 · 60 · 80/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Menor salto: 20 kg/).length).toBeGreaterThan(0)
  })

  it('o cadastro conta unidades e mostra os pares derivados', () => {
    const { onSaveInventory } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Ajustar minhas anilhas/ }))
    expect(screen.getByText('3 pares')).toBeTruthy() // 6 unidades de 20 kg
    fireEvent.click(screen.getByRole('button', { name: 'Mais uma anilha de 20 kg' }))
    expect(onSaveInventory).toHaveBeenCalledWith(
      expect.objectContaining({ '20': 7 }),
      20,
    )
  })

  it('avisa a unidade ímpar sobrando', () => {
    setup({ inventory: { counts: { '10': 5 }, barWeightKg: 20 } })
    fireEvent.click(screen.getByRole('button', { name: /Ajustar minhas anilhas/ }))
    expect(screen.getByText(/1 sobrando/)).toBeTruthy()
  })

  it('não renderiza nada fechado', () => {
    const { container } = render(
      <PlateCalculatorSheet
        isOpen={false} onClose={() => { }} exerciseName="X" setLabel="Série 1"
        initialWeight={null} inventory={HOME_INV} onApply={() => { }} onSaveInventory={() => { }}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
