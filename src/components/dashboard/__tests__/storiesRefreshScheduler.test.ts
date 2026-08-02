import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createStoriesRefreshScheduler, STORIES_REALTIME_DEBOUNCE_MS } from '../storiesRefreshScheduler'

/**
 * Guard de regressão do refresh automático da fileira de stories (StoriesBar).
 *
 * Sintoma que originou o guard: o canal Realtime `stories-auto-refresh` escuta
 * INSERT em `social_stories` sem filtro de coluna (postgres_changes só compara
 * uma coluna; "quem eu sigo" é join — o recorte real é a RLS `can_view_story`).
 * Cada evento entregue agendava o SEU PRÓPRIO `setTimeout(() => reload(true))`,
 * então uma rajada de N stories virava N GETs em
 * `/api/social/stories/list?nocache=1` — e o `nocache=1` fura o cache da rota
 * (refaz a query + re-assina até 200 URLs de mídia). Rodava até em background.
 *
 * Invariantes travadas aqui:
 *  1. rajada de eventos → UM refresh (debounce trailing, timer único);
 *  2. app oculto → ZERO fetch; o refresh fica pendente até voltar a visível;
 *  3. cleanup do efeito cancela o pendente (nada dispara depois do unmount).
 */
describe('createStoriesRefreshScheduler', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const visible = () => false

  it('coalesce uma rajada de eventos num único refresh', () => {
    const onRefresh = vi.fn()
    const s = createStoriesRefreshScheduler({ onRefresh, delayMs: 4000, isHidden: visible })

    s.request()
    s.request()
    s.request()
    expect(onRefresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(4000)
    expect(onRefresh).toHaveBeenCalledTimes(1)

    // e não dispara de novo depois (os timers extras foram cancelados, não enfileirados)
    vi.advanceTimersByTime(60_000)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('re-agenda a cada evento (debounce trailing, não throttle leading)', () => {
    const onRefresh = vi.fn()
    const s = createStoriesRefreshScheduler({ onRefresh, delayMs: 4000, isHidden: visible })

    s.request()
    vi.advanceTimersByTime(3000)
    s.request()
    vi.advanceTimersByTime(3000)
    expect(onRefresh).not.toHaveBeenCalled() // ainda dentro da janela do 2º request

    vi.advanceTimersByTime(1000)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('com o app oculto não faz fetch — segura o refresh até voltar a visível', () => {
    const onRefresh = vi.fn()
    let hidden = true
    const s = createStoriesRefreshScheduler({ onRefresh, delayMs: 4000, isHidden: () => hidden })

    s.request()
    vi.advanceTimersByTime(60_000)
    expect(onRefresh).not.toHaveBeenCalled()

    hidden = false
    s.flushOnVisible()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('se ficar oculto entre o agendamento e o disparo, adia em vez de gastar o fetch', () => {
    const onRefresh = vi.fn()
    let hidden = false
    const s = createStoriesRefreshScheduler({ onRefresh, delayMs: 4000, isHidden: () => hidden })

    s.request()
    hidden = true
    vi.advanceTimersByTime(4000)
    expect(onRefresh).not.toHaveBeenCalled()

    hidden = false
    s.flushOnVisible()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('flushOnVisible sem nada pendente não dispara refresh', () => {
    const onRefresh = vi.fn()
    const s = createStoriesRefreshScheduler({ onRefresh, delayMs: 4000, isHidden: visible })
    s.flushOnVisible()
    vi.advanceTimersByTime(60_000)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('dispose cancela o refresh pendente (cleanup do efeito)', () => {
    const onRefresh = vi.fn()
    const s = createStoriesRefreshScheduler({ onRefresh, delayMs: 4000, isHidden: visible })

    s.request()
    s.dispose()
    vi.advanceTimersByTime(60_000)
    expect(onRefresh).not.toHaveBeenCalled()

    // e continua neutro depois de descartado
    s.request()
    s.flushOnVisible()
    vi.advanceTimersByTime(60_000)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('o debounce padrão dá folga pro CDN e coalesce rajada (>= 1.5s do valor antigo)', () => {
    expect(STORIES_REALTIME_DEBOUNCE_MS).toBeGreaterThanOrEqual(1500)
  })
})

/**
 * Source-guard: a fiação no StoriesBar tem que USAR o scheduler. Um
 * `setTimeout(reload)` solto dentro do handler do canal reintroduz exatamente o
 * storm de fetches que o scheduler existe para evitar.
 */
describe('StoriesBar — fiação do canal Realtime', () => {
  const src = readFileSync('src/components/dashboard/StoriesBar.tsx', 'utf8')

  // Bloco do efeito do Realtime: do createStoriesRefreshScheduler até o subscribe.
  // Lazy de propósito — se o recorte falhasse no corpo do describe, o arquivo
  // inteiro morreria na coleta e os testes de comportamento acima nem rodariam.
  const realtimeBlock = () => {
    const start = src.indexOf('createStoriesRefreshScheduler({')
    expect(start).toBeGreaterThan(-1)
    const end = src.indexOf('.subscribe()', start)
    expect(end).toBeGreaterThan(start)
    return src.slice(start, end)
  }

  it('o handler do INSERT delega ao scheduler (não agenda o próprio setTimeout)', () => {
    const block = realtimeBlock()
    expect(block).toMatch(/table:\s*'social_stories'\s*\}[\s\S]{0,120}scheduler\.request\(\)/)
    expect(block).not.toMatch(/setTimeout/)
  })

  it('respeita visibilidade: solta o pendente no visibilitychange', () => {
    const block = realtimeBlock()
    expect(block).toMatch(/visibilityState\s*===\s*'visible'[\s\S]{0,80}scheduler\.flushOnVisible\(\)/)
    expect(block).toMatch(/addEventListener\('visibilitychange'/)
  })

  it('o cleanup descarta o scheduler e remove o canal', () => {
    const at = src.indexOf('scheduler.dispose()')
    expect(at).toBeGreaterThan(-1)
    const cleanup = src.slice(at, at + 300)
    expect(cleanup).toMatch(/removeChannel\(channel\)/)
  })

  it('o efeito do canal não depende de groups.length (re-subscribe do WebSocket a cada carga)', () => {
    // pega as deps do useEffect que contém o subscribe
    const start = src.indexOf('createStoriesRefreshScheduler({')
    expect(start).toBeGreaterThan(-1)
    const depsAt = src.indexOf('}, [', src.indexOf('.subscribe()', start))
    expect(depsAt).toBeGreaterThan(-1)
    expect(src.slice(depsAt, depsAt + 40)).toMatch(/^\}, \[\]\)/)
  })
})
