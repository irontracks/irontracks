import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('não pode ser espremido pelo flex que divide com a nota do motor', () => {
    render(<FailureToggle exIdx={0} setIdx={0} />)
    expect(screen.getByRole('button').className).toContain('shrink-0')
  })

  it('carimba o extraPatch no MESMO patch do failure (advanced_config da série normal)', () => {
    render(<FailureToggle exIdx={1} setIdx={2} extraPatch={{ advanced_config: { a: 1 } }} />)
    fireEvent.click(screen.getByRole('button'))
    expect(updateLog).toHaveBeenCalledWith('1-2', { failure: true, advanced_config: { a: 1 } })
  })
})

/**
 * O chip de falha voltou a quebrar em duas linhas (print do dono, 04/08/2026) na
 * série NORMAL — e só nela: o `whitespace-nowrap`/`shrink-0` foi para o componente
 * compartilhado, mas `normalSet.tsx` mantinha uma cópia inline própria (por causa
 * do `advanced_config`), que ficou para trás. Guard da CLASSE do problema: nenhum
 * renderer pode voltar a desenhar o chip por conta própria.
 *
 * Limite declarado: jsdom não faz layout, então nenhum teste aqui vê a quebra de
 * linha de verdade — o que se trava é a fonte única do chip e as classes que a
 * impedem. Conferência do resultado na tela é visual.
 */
describe('chip de falha — fonte única, sem cópia inline nos renderers', () => {
  const dir = join(__dirname, '..')
  /** Remove comentários para não casar com a documentação que explica o proibido. */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  const renderers = readdirSync(dir).filter(f => f.endsWith('.tsx') && f !== 'FailureToggle.tsx')

  it('varre todos os renderers (a lista não pode ter esvaziado)', () => {
    expect(renderers.length).toBeGreaterThan(10)
  })

  it.each(renderers)('%s usa <FailureToggle>, não um botão próprio', file => {
    const code = stripComments(readFileSync(join(dir, file), 'utf8'))
    expect(code).not.toMatch(/Falha\?/i)
  })
})
