import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../BodyMapSvg', () => ({ default: () => <div>Mapa original 2D</div> }))
vi.mock('next/dynamic', () => ({ default: () => function Mock3D(props: { muscles: Record<string, unknown>; onUnavailable: () => void }) {
  return <div><span>{Object.keys(props.muscles).join(',')}</span><button onClick={props.onUnavailable}>Simular falha 3D</button></div>
} }))
import BodyMapInteractive from '../BodyMapInteractive'

describe('alternativa segura do mapa 3D', () => {
  it('só monta o 3D ao solicitar e recebe os dois lados do corpo', () => {
    render(<BodyMapInteractive view="front" muscles={{ chest: { ratio: 1 }, lats: { ratio: 0.5 } }} musclesForView={{ chest: { ratio: 1 } }} />)
    expect(screen.queryByText('Simular falha 3D')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '3D', exact: true }))
    expect(screen.getByText('chest,lats')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Simular falha 3D' }))
    expect(screen.getByText('Mapa original 2D')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('2D')
  })
  it('não troca o corpo feminino pelo modelo masculino', () => {
    render(<BodyMapInteractive gender="female" view="front" muscles={{}} musclesForView={{}} />)
    expect(screen.queryByRole('button', { name: '3D', exact: true })).toBeNull()
    expect(screen.getByText('Mapa original 2D')).toBeTruthy()
  })
})
