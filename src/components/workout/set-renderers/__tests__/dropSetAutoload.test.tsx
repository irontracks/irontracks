import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DropSetSet } from '../dropSetSet'

/**
 * Guard: o drop-set semeia as etapas com a sugestão do motor.
 *
 * INCIDENTE: o autoload preenchia `log.weight`, mas as ETAPAS do drop leem
 * `saved`/`planned` — nunca `log.weight`. Resultado: o hint 🧠 aparecia, o peso
 * do drop continuava vazio e o usuário tinha que digitar tudo no modal.
 *
 * INVARIANTE: etapa VAZIA recebe a sugestão (1ª etapa = peso de trabalho, as
 * seguintes caem ~20%); etapa já preenchida (usuário ou template) é INTOCADA.
 * Verificado pelo que chega ao modal ao tocar em "Abrir" — que é o que o usuário vê.
 */
vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))

const setDropSetModal = vi.fn()
let logStore: Record<string, unknown> = {}
let plannedSet: Record<string, unknown> | null = null
let suggestions: Record<string, unknown> = {}

const ctx = {
  getLog: () => logStore,
  updateLog: vi.fn(),
  getPlanConfig: () => null,
  getPlannedSet: () => plannedSet,
  setDropSetModal,
  dropSetDraftsRef: { current: {} },
  openNotesKeys: new Set<string>(),
  toggleNotes: vi.fn(),
  reportHistory: null,
  autoLoadEnabled: true,
  get autoLoadSuggestions() { return suggestions },
}
vi.mock('../../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

/** Pesos das etapas entregues ao modal ao tocar em "Abrir". */
const stageWeightsSentToModal = (): string[] => {
  fireEvent.click(screen.getByText('Abrir'))
  const arg = setDropSetModal.mock.calls.at(-1)?.[0] as { stages?: Array<{ weight?: unknown }> }
  return (arg?.stages ?? []).map((s) => String(s?.weight ?? ''))
}

const renderDrop = () =>
  render(<DropSetSet ex={{ name: 'Mesa flexora', method: 'Drop-set' } as never} exIdx={0} setIdx={0} />)

beforeEach(() => {
  setDropSetModal.mockClear()
  logStore = {}
  plannedSet = null
  suggestions = {}
  ctx.dropSetDraftsRef.current = {}
})

describe('Drop-set — autoload semeia as etapas', () => {
  it('etapas vazias recebem a sugestão, caindo ~20% por etapa', () => {
    // "Mesa flexora" → máquina (passo 5kg). 50 → 40 (50 × 0,8).
    suggestions = { '0-0': { weight: 50, reps: 10, confidence: 'high', rationale: 'x' } }
    renderDrop()
    expect(stageWeightsSentToModal()).toEqual(['50', '40'])
  })

  it('NÃO sobrescreve etapa já preenchida pelo template', () => {
    plannedSet = { advanced_config: [{ weight: '77', reps: 8 }, { weight: '55', reps: 8 }] }
    suggestions = { '0-0': { weight: 50, reps: 10, confidence: 'high', rationale: 'x' } }
    renderDrop()
    expect(stageWeightsSentToModal()).toEqual(['77', '55'])
  })

  it('sem sugestão, segue vazio (não inventa peso)', () => {
    suggestions = {}
    renderDrop()
    expect(stageWeightsSentToModal()).toEqual(['', ''])
  })
})

/**
 * Guard: rascunho vazio NÃO pode mascarar a sugestão.
 *
 * INCIDENTE: ao fechar o modal, o estado vira rascunho (`dropSetDraftsRef`). Se o
 * modal abriu antes do histórico carregar (ou foi fechado sem preencher), o rascunho
 * guardava etapas com peso VAZIO. Reabrir usava o rascunho e IGNORAVA a sugestão do
 * motor — o drop aparecia "sem peso automático" pra sempre naquela sessão.
 *
 * INVARIANTE: ao reabrir, etapa de peso vazia recebe a sugestão atual; etapa já
 * digitada pelo usuário é preservada.
 */
describe('Drop-set — rascunho vazio não congela a sugestão', () => {
  it('rascunho com pesos vazios recebe a sugestão ao reabrir', () => {
    suggestions = { '0-0': { weight: 50, reps: 10, confidence: 'high', rationale: 'x' } }
    ctx.dropSetDraftsRef.current = {
      '0-0': { key: '0-0', label: 'Drop', stages: [{ weight: '', reps: 8 }, { weight: '', reps: 6 }], rpe: '' },
    }
    renderDrop()
    expect(stageWeightsSentToModal()).toEqual(['50', '40'])
  })

  it('peso digitado pelo usuário no rascunho é preservado (só preenche o vazio)', () => {
    suggestions = { '0-0': { weight: 50, reps: 10, confidence: 'high', rationale: 'x' } }
    ctx.dropSetDraftsRef.current = {
      '0-0': { key: '0-0', label: 'Drop', stages: [{ weight: '60', reps: 8 }, { weight: '', reps: 6 }], rpe: '' },
    }
    renderDrop()
    // 1ª etapa preservada (60); só a 2ª (vazia) recebe a sugestão (40).
    expect(stageWeightsSentToModal()).toEqual(['60', '40'])
  })
})

/**
 * Guard: a LINHA do drop mostra o peso sugerido.
 *
 * INCIDENTE: a série de drop exibia só "Etapas N • Total: X" — nenhum peso na linha,
 * ao contrário das séries normais que mostram o número na caixa. O usuário olhava e
 * achava que "o drop não automatizou", mesmo com a sugestão pronta dentro do modal.
 */
describe('Drop-set — a linha exibe o peso das etapas', () => {
  it('mostra o resumo "50 → 40 kg" sem precisar abrir o modal', () => {
    suggestions = { '0-0': { weight: 50, reps: 10, confidence: 'high', rationale: 'x' } }
    renderDrop()
    const found = screen.getByText(
      (_c, el) => el?.tagName === 'SPAN' && (el.textContent ?? '').replace(/\s+/g, ' ').includes('50 → 40 kg'),
    )
    expect(found).toBeTruthy()
  })
})
