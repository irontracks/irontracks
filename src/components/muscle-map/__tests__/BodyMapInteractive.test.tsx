import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../BodyMapSvg', () => ({ default: () => <div>Mapa original 2D</div> }))
vi.mock('next/dynamic', () => ({ default: () => function Mock3D(props: { muscles: Record<string, unknown>; onUnavailable: () => void }) {
  return <div><span>{Object.keys(props.muscles).join(',')}</span><button onClick={props.onUnavailable}>Simular falha 3D</button></div>
} }))
import BodyMapInteractive from '../BodyMapInteractive'

describe('alternativa segura do mapa 3D', () => {
  it('abre o 3D em modal dedicado, mantém o 2D no card e trava o scroll da página', () => {
    render(<BodyMapInteractive view="front" muscles={{ chest: { ratio: 1 }, lats: { ratio: 0.5 } }} musclesForView={{ chest: { ratio: 1 } }} />)
    expect(screen.queryByText('Simular falha 3D')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '3D', exact: true }))
    expect(screen.getByRole('dialog', { name: 'Visualização 3D' })).toBeTruthy()
    expect(screen.getByText('Mapa original 2D')).toBeTruthy()
    expect(screen.getByText('chest,lats')).toBeTruthy()
    expect(document.body.style.position).toBe('fixed')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar mapa muscular 3D' }))
    expect(screen.queryByRole('dialog', { name: 'Visualização 3D' })).toBeNull()
    expect(document.body.style.position).toBe('')
  })

  it('fecha o modal e mantém o fallback 2D quando o visualizador falha', () => {
    render(<BodyMapInteractive view="front" muscles={{ chest: { ratio: 1 }, lats: { ratio: 0.5 } }} musclesForView={{ chest: { ratio: 1 } }} />)
    fireEvent.click(screen.getByRole('button', { name: '3D', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Simular falha 3D' }))
    expect(screen.queryByRole('dialog', { name: 'Visualização 3D' })).toBeNull()
    expect(screen.getByText('Mapa original 2D')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('2D')
  })
  it('não troca o corpo feminino pelo modelo masculino', () => {
    render(<BodyMapInteractive gender="female" view="front" muscles={{}} musclesForView={{}} />)
    expect(screen.queryByRole('button', { name: '3D', exact: true })).toBeNull()
    expect(screen.getByText('Mapa original 2D')).toBeTruthy()
  })
})
