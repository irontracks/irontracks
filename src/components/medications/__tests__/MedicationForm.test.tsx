import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MedicationForm from '../MedicationForm'
import { remedio } from './fixtures'

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const preencher = () => {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Losartana' } })
  fireEvent.change(screen.getByLabelText('Dose'), { target: { value: '50 mg' } })
}

describe('MedicationForm', () => {
  it('onSubmit → false: NÃO fecha e mantém tudo o que foi digitado', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    const onSaved = vi.fn()
    const onCancel = vi.fn()
    render(<MedicationForm onSubmit={onSubmit} onSaved={onSaved} onCancel={onCancel} />)
    preencher()
    fireEvent.change(screen.getByLabelText('Horário 1'), { target: { value: '21:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nome')).toHaveValue('Losartana')
    expect(screen.getByLabelText('Dose')).toHaveValue('50 mg')
    expect(screen.getByLabelText('Horário 1')).toHaveValue('21:30')
  })

  it('onSubmit → true: avisa que salvou e entrega o input validado', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const onSaved = vi.fn()
    render(<MedicationForm onSubmit={onSubmit} onSaved={onSaved} onCancel={vi.fn()} />)
    preencher()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const input = onSubmit.mock.calls[0][0]
    expect(input).toMatchObject({ name: 'Losartana', dose: '50 mg', times: ['08:00'], endDate: null, notes: null })
    expect(input.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('onSubmit que LANÇA conta como falha e não fecha', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('rede'))
    const onSaved = vi.fn()
    render(<MedicationForm onSubmit={onSubmit} onSaved={onSaved} onCancel={vi.fn()} />)
    preencher()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('valida com o schema antes de enviar: nome vazio não chega ao onSubmit', async () => {
    const onSubmit = vi.fn()
    render(<MedicationForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o nome.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('os sete dias são botões com aria-pressed e nome completo; começam todos marcados', () => {
    render(<MedicationForm onSubmit={vi.fn()} onCancel={vi.fn()} />)
    for (const nome of DIAS) {
      expect(screen.getByRole('button', { name: nome })).toHaveAttribute('aria-pressed', 'true')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Quarta-feira' }))
    expect(screen.getByRole('button', { name: 'Quarta-feira' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('o último dia marcado não desmarca (mínimo 1)', () => {
    render(<MedicationForm initial={remedio({ weekdays: [2] })} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Terça-feira' }))
    expect(screen.getByRole('button', { name: 'Terça-feira' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('ao menos um dia')
  })

  it('horários: "+ horário" até 8 e remover volta a abrir vaga', () => {
    render(<MedicationForm onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Remover horário/ })).toBeNull()
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByRole('button', { name: '+ horário' }))
    expect(screen.getAllByLabelText(/^Horário \d$/)).toHaveLength(8)
    expect(screen.queryByRole('button', { name: '+ horário' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remover horário 8' }))
    expect(screen.getAllByLabelText(/^Horário \d$/)).toHaveLength(7)
    expect(screen.getByRole('button', { name: '+ horário' })).toBeInTheDocument()
  })

  it('a observação fica escondida até pedir', () => {
    render(<MedicationForm onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByLabelText('Observação')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar observação' }))
    expect(screen.getByLabelText('Observação')).toBeInTheDocument()
  })

  it('ao editar, nasce preenchido e já mostra a observação existente', () => {
    render(
      <MedicationForm
        initial={remedio({ notes: 'em jejum', times: ['07:00', '19:00'] })}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Nome')).toHaveValue('Losartana')
    expect(screen.getByLabelText('Observação')).toHaveValue('em jejum')
    expect(screen.getByLabelText('Horário 2')).toHaveValue('19:00')
  })

  it('Cancelar chama onCancel', () => {
    const onCancel = vi.fn()
    render(<MedicationForm onSubmit={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
