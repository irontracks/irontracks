import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AutoloadNote } from '../AutoloadNote'
import { FailureToggle } from '../FailureToggle'

/**
 * Legibilidade do rodapé da série (print do dono, 29/07/2026).
 *
 * Dois defeitos visuais no mesmo lugar, e um causava o outro:
 *
 *  1. A explicação do motor era cortada numa linha só (`truncate`). Com a
 *     calibração pelo reconhecimento o texto cresceu — "Última vez: 73kg × 9
 *     @RPE10 — ajustei p/ 65kg — reconhecimento de hoje (60kg × 12 @RPE6): -3%" —
 *     e o corte engolia exatamente a parte que explica POR QUE o peso mudou.
 *  2. O botão de falha quebrava em duas linhas (emoji em cima, palavra embaixo)
 *     porque a nota disputava largura no mesmo flex e faltava `whitespace-nowrap`.
 */
const updateLog = vi.fn()
const ctx = { getLog: () => ({}), updateLog }
vi.mock('../../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

beforeEach(() => updateLog.mockClear())

const RATIONALE_REAL =
  'Última vez: 73kg × 9 @RPE10 — ajustei p/ 65kg — reconhecimento de hoje (60kg × 12 @RPE6): -3%'

describe('AutoloadNote — explicação legível', () => {
  it('não corta a explicação numa linha só', () => {
    render(<AutoloadNote show rationale={RATIONALE_REAL} />)
    const el = screen.getByText(RATIONALE_REAL)
    expect(el.className).toContain('line-clamp-2')
    expect(el.className).not.toContain('truncate')
  })

  it('mantém o texto completo acessível (title) mesmo se a caixa apertar', () => {
    const { container } = render(<AutoloadNote show rationale={RATIONALE_REAL} />)
    expect(container.querySelector(`[title="${RATIONALE_REAL}"]`)).not.toBeNull()
  })

  it('a parte que explica o ajuste do dia está presente no DOM', () => {
    render(<AutoloadNote show rationale={RATIONALE_REAL} />)
    expect(screen.getByText(/reconhecimento de hoje/)).toBeTruthy()
    expect(screen.getByText(/-3%/)).toBeTruthy()
  })
})

describe('FailureToggle — rótulo não quebra em duas linhas', () => {
  it('usa whitespace-nowrap', () => {
    render(<FailureToggle exIdx={0} setIdx={0} />)
    expect(screen.getByRole('button').className).toContain('whitespace-nowrap')
  })

  it('não usa mais o peso/espaçamento exagerados que deformavam a palavra', () => {
    render(<FailureToggle exIdx={0} setIdx={0} />)
    const cls = screen.getByRole('button').className
    expect(cls).not.toContain('font-black')
    expect(cls).not.toContain('tracking-widest')
  })

  it('a variante compacta continua só com o ícone (linhas apertadas dos métodos)', () => {
    render(<FailureToggle exIdx={0} setIdx={1} compact />)
    expect(screen.getByRole('button').textContent).not.toMatch(/falha/i)
  })

  it('segue acessível por rótulo, não pelo texto visual', () => {
    render(<FailureToggle exIdx={0} setIdx={2} />)
    expect(screen.getByLabelText(/levada à falha/i)).toBeTruthy()
  })
})
