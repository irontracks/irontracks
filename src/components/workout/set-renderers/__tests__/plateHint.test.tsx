import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { NormalSet } from '../normalSet'

/**
 * Dica de montagem de anilhas (pedido do dono, jul/2026): quando o autoload sugere
 * a carga num exercício de anilha, o card mostra quantas anilhas vão de cada lado.
 *
 * Dois invariantes:
 *  1. Aparece com o peso do motor em máquina de anilha / barra — e SÓ ali (numa
 *     máquina de pino não há anilha pra montar; a dica seria instrução errada).
 *  2. Os 14 renderers usam o MESMO componente (`AutoloadNote`). Essa família já
 *     divergiu em silêncio várias vezes por copiar o bloco em cada arquivo.
 */
const updateLog = vi.fn()
let logStore: Record<string, unknown> = {}
let suggestions: Record<string, unknown> = {}

const ctx = {
  getLog: () => logStore,
  updateLog,
  updateSetType: vi.fn(),
  getPlanConfig: () => null,
  getPlannedSet: () => null,
  startTimer: vi.fn(),
  openNotesKeys: new Set<string>(),
  toggleNotes: vi.fn(),
  deloadSuggestions: {},
  autoLoadEnabled: true,
  get autoLoadSuggestions() { return suggestions },
  setCollapsed: vi.fn(),
  reportHistory: null,
  settings: {},
}

vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))
vi.mock('../../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

const renderSet = (name: string) =>
  render(<NormalSet ex={{ name, sets: 3, reps: '15-20' } as never} exIdx={0} setIdx={0} setsCount={3} />)

beforeEach(() => {
  updateLog.mockClear()
  logStore = {}
  suggestions = {}
})

describe('Dica de anilhas na série', () => {
  it('mostra a montagem por lado quando o peso é do motor', () => {
    logStore = { weight: '325', weightSource: 'auto' }
    suggestions = { '0-0': { weight: 325, reps: 15, confidence: 'high', rationale: 'mantive a carga' } }
    renderSet('Leg press 45°')
    expect(screen.getByText('8×20 + 1×2,5 por lado')).toBeTruthy()
  })

  it('não mostra nada em máquina de pino', () => {
    logStore = { weight: '60', weightSource: 'auto' }
    suggestions = { '0-0': { weight: 60, reps: 12, confidence: 'high', rationale: 'mantive a carga' } }
    renderSet('Cadeira extensora')
    expect(screen.queryByText(/por lado/)).toBeNull()
  })

  it('some quando o usuário assume o peso (não é mais a carga do motor)', () => {
    logStore = { weight: '300', weightSource: 'user' }
    suggestions = { '0-0': { weight: 325, reps: 15, confidence: 'high', rationale: 'x' } }
    renderSet('Leg press 45°')
    expect(screen.queryByText(/por lado/)).toBeNull()
  })
})

describe('Rodapé da sugestão é compartilhado pelos renderers', () => {
  const dir = join(process.cwd(), 'src/components/workout/set-renderers')

  it('nenhum renderer reimplementa o bloco 🧠 inline', () => {
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx') && f !== 'AutoloadNote.tsx')
      .filter((f) => {
        const src = readFileSync(join(dir, f), 'utf8')
        // Assinatura do RODAPÉ da sugestão (não confundir com o 🧠 que marca as
        // etapas do drop-set, que é outro elemento e pode continuar inline).
        return /text-\[10px\] text-violet-300\/80/.test(src)
      })
    expect(offenders, 'use <AutoloadNote> — bloco copiado diverge em silêncio').toEqual([])
  })

  it('todo renderer que consome o autoload renderiza o AutoloadNote', () => {
    const missing = readdirSync(dir)
      .filter((f) => f.endsWith('Set.tsx'))
      .filter((f) => {
        const src = readFileSync(join(dir, f), 'utf8')
        const usesAutoload = /useAutoloadWeight|autoLoadSuggestions/.test(src)
        return usesAutoload && !/<AutoloadNote/.test(src)
      })
    expect(missing).toEqual([])
  })
})
