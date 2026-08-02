import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import FeedCard, { feedCardPropsAreEqual, type FeedCardProps, type FeedItem } from '../FeedCard'

/**
 * Guard de regressão de performance do feed da comunidade.
 *
 * Sintoma: `useCommunityData` faz poll de presença a cada 30s
 * (`setInterval(loadPresence, 30_000)`). Cada tick atualizava estado no
 * CommunityClient e, como o FeedCard era exportado cru, TODOS os cards do feed
 * (20+ por página, com avatar e badges) re-renderizavam junto — sem nenhuma
 * mudança visível na maioria dos ticks.
 *
 * A memo só vale se o card de quem MUDOU de presença continuar atualizando: é o
 * que os testes de comportamento abaixo travam.
 */

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: 'feed-1',
  type: 'workout_finish',
  title: 'Treino concluído',
  message: 'Fulano finalizou o treino de peito',
  senderId: 'user-1',
  senderName: 'Fulano de Tal',
  senderPhoto: null,
  senderRole: null,
  metadata: null,
  createdAt: new Date('2026-08-02T12:00:00Z').toISOString(),
  ...over,
})

describe('feedCardPropsAreEqual', () => {
  const onProfileClick = vi.fn()

  it('props idênticas → pula o re-render (é o ganho do poll de 30s)', () => {
    const it0 = item()
    const a: FeedCardProps = { item: it0, presence: null, onProfileClick }
    const b: FeedCardProps = { item: it0, presence: null, onProfileClick }
    expect(feedCardPropsAreEqual(a, b)).toBe(true)
  })

  it('mudança de presença SEMPRE re-renderiza (null → training → online → null)', () => {
    const it0 = item()
    const base: FeedCardProps = { item: it0, presence: null, onProfileClick }
    expect(feedCardPropsAreEqual(base, { ...base, presence: 'training' })).toBe(false)
    expect(feedCardPropsAreEqual({ ...base, presence: 'training' }, { ...base, presence: 'online' })).toBe(false)
    expect(feedCardPropsAreEqual({ ...base, presence: 'online' }, base)).toBe(false)
  })

  it('item novo re-renderiza mesmo com o mesmo id (refetch do feed troca o conteúdo)', () => {
    const a: FeedCardProps = { item: item(), presence: null, onProfileClick }
    const b: FeedCardProps = { item: item({ message: 'mensagem editada' }), presence: null, onProfileClick }
    expect(feedCardPropsAreEqual(a, b)).toBe(false)
  })

  it('handler diferente re-renderiza (não congela um callback obsoleto)', () => {
    const it0 = item()
    const a: FeedCardProps = { item: it0, presence: null, onProfileClick }
    const b: FeedCardProps = { item: it0, presence: null, onProfileClick: vi.fn() }
    expect(feedCardPropsAreEqual(a, b)).toBe(false)
  })

  it('prop NOVA entra na comparação sozinha (comparador de união, não lista fixa)', () => {
    const it0 = item()
    const a = { item: it0, presence: null } as FeedCardProps
    const b = { item: it0, presence: null, propFutura: 'x' } as unknown as FeedCardProps
    expect(feedCardPropsAreEqual(a, b)).toBe(false)
    expect(feedCardPropsAreEqual(b, a)).toBe(false)
  })

  it('undefined explícito e ausente são o mesmo valor (não força re-render)', () => {
    const it0 = item()
    const a = { item: it0 } as FeedCardProps
    const b = { item: it0, presence: undefined, onProfileClick: undefined } as FeedCardProps
    expect(feedCardPropsAreEqual(a, b)).toBe(true)
  })
})

describe('FeedCard memoizado — comportamento renderizado', () => {
  it('o default export é memoizado (senão o poll de presença re-renderiza o feed todo)', () => {
    const el = FeedCard as unknown as { $$typeof?: symbol; compare?: unknown }
    expect(String(el.$$typeof)).toBe('Symbol(react.memo)')
    expect(el.compare).toBe(feedCardPropsAreEqual)
  })

  it('o card de quem mudou de presença AINDA atualiza depois da memo', () => {
    const { rerender } = render(<FeedCard item={item()} presence={null} />)
    expect(screen.queryByTitle('Treinando agora')).toBeNull()
    expect(screen.queryByTitle('Online')).toBeNull()

    rerender(<FeedCard item={item()} presence="training" />)
    expect(screen.getByTitle('Treinando agora')).toBeTruthy()

    rerender(<FeedCard item={item()} presence="online" />)
    expect(screen.getByTitle('Online')).toBeTruthy()

    rerender(<FeedCard item={item()} presence={null} />)
    expect(screen.queryByTitle('Treinando agora')).toBeNull()
    expect(screen.queryByTitle('Online')).toBeNull()
  })
})

/**
 * Source-guard: a memo é anulada se o pai passar uma arrow inline em
 * `onProfileClick` — identidade nova a cada render do CommunityClient, que é
 * exatamente o que o tick de presença provoca.
 */
describe('CommunityClient — props estáveis para o FeedCard', () => {
  const src = readFileSync('src/app/(app)/community/CommunityClient.tsx', 'utf8')

  it('o handler de perfil é memoizado com useCallback', () => {
    expect(src).toMatch(/const handleProfileClick = useCallback\(/)
  })

  it('o FeedCard recebe a referência estável, nunca uma arrow inline', () => {
    const tag = src.slice(src.indexOf('<FeedCard'), src.indexOf('<FeedCard') + 400)
    expect(tag).toMatch(/onProfileClick=\{handleProfileClick\}/)
    expect(tag).not.toMatch(/onProfileClick=\{\(/)
  })
})
