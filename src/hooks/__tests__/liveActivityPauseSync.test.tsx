import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { render, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Sintoma (07/08/2026, print do dono): app mostrando "PAUSADO 56:07" enquanto a
 * ilha dinâmica e a tela bloqueada seguiam contando.
 *
 * Causa: o relógio da Live Activity é `Text(timerInterval:)` — o SISTEMA conta a
 * partir de uma data e não sabe o que é pausa. Ninguém avisava o nativo.
 *
 * ⚠️ Limite deste arquivo: jsdom não renderiza SwiftUI. O que se prova aqui é a
 * FIAÇÃO (quem chama o nativo, quando, e com qual número) e, por leitura de
 * texto, os invariantes do Swift. O resultado na ilha é conferência visual no
 * device — nunca declare "a ilha congelou" com base só nestes testes.
 */

const setPaused = vi.hoisted(() => vi.fn(async () => { }))
vi.mock('@/utils/native/irontracksNative', () => ({
  setWorkoutLiveActivityPaused: setPaused,
}))

import { useLiveActivityPauseSync } from '@/hooks/useLiveActivityPauseSync'

function Probe({ isPaused, elapsedSeconds, startedAtMs }: { isPaused: boolean; elapsedSeconds: number; startedAtMs: number }) {
  useLiveActivityPauseSync({ isPaused, elapsedSeconds, startedAtMs })
  return null
}

describe('useLiveActivityPauseSync', () => {
  beforeEach(() => {
    setPaused.mockClear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pausar avisa o nativo com o tempo congelado do app', () => {
    const started = Date.now() - 60_000
    const { rerender } = render(<Probe isPaused={false} elapsedSeconds={40} startedAtMs={started} />)
    setPaused.mockClear()

    act(() => { rerender(<Probe isPaused elapsedSeconds={40} startedAtMs={started} />) })

    expect(setPaused).toHaveBeenCalledTimes(1)
    expect(setPaused).toHaveBeenCalledWith(true, 40)
  })

  it('retomar re-ancora a contagem no tempo do app, não no relógio de parede', () => {
    const started = Date.now() - 600_000 // 10 min de parede
    const { rerender } = render(<Probe isPaused elapsedSeconds={120} startedAtMs={started} />)
    setPaused.mockClear()

    act(() => { rerender(<Probe isPaused={false} elapsedSeconds={120} startedAtMs={started} />) })

    expect(setPaused).toHaveBeenCalledWith(false, 120)
  })

  it('o tique do cronômetro NÃO gera update (ActivityKit limita ~120/h)', () => {
    const started = Date.now()
    const { rerender } = render(<Probe isPaused={false} elapsedSeconds={1} startedAtMs={started} />)
    setPaused.mockClear()

    act(() => { rerender(<Probe isPaused={false} elapsedSeconds={2} startedAtMs={started} />) })
    act(() => { rerender(<Probe isPaused={false} elapsedSeconds={3} startedAtMs={started} />) })
    act(() => { rerender(<Probe isPaused={false} elapsedSeconds={4} startedAtMs={started} />) })

    expect(setPaused).not.toHaveBeenCalled()
  })

  it('montar não dispara nada de imediato — a activity ainda pode não existir', () => {
    render(<Probe isPaused={false} elapsedSeconds={0} startedAtMs={Date.now()} />)
    expect(setPaused).not.toHaveBeenCalled()
  })

  it('sessão restaurada: ancora depois da espera, com o tempo do app', () => {
    // 30 min de parede, mas o app só conta 5 min (o gap longo virou pausa).
    const started = Date.now() - 30 * 60_000
    render(<Probe isPaused={false} elapsedSeconds={300} startedAtMs={started} />)

    act(() => { vi.advanceTimersByTime(6000) })

    expect(setPaused).toHaveBeenCalledWith(false, 300)
  })

  it('sessão nova (app e parede batem) não gasta update à toa', () => {
    const started = Date.now() - 10_000
    render(<Probe isPaused={false} elapsedSeconds={10} startedAtMs={started} />)

    act(() => { vi.advanceTimersByTime(6000) })

    expect(setPaused).not.toHaveBeenCalled()
  })

  it('desmontar antes da espera cancela a âncora', () => {
    const started = Date.now() - 30 * 60_000
    const { unmount } = render(<Probe isPaused={false} elapsedSeconds={300} startedAtMs={started} />)
    unmount()

    act(() => { vi.advanceTimersByTime(6000) })

    expect(setPaused).not.toHaveBeenCalled()
  })
})

/** Fiação: o provider do cronômetro é quem tem a verdade (pausedMs + desconto de
 *  background). Se ele parar de chamar o sync, todos os testes acima seguem
 *  verdes com a ilha correndo solta — o erro nº 3 do CLAUDE.md. */
describe('WorkoutTimerProvider — o dono do tempo aciona o sync', () => {
  const code = readFileSync(
    join(__dirname, '..', '..', 'components', 'workout', 'WorkoutTimerContext.tsx'),
    'utf8',
  )
  const executavel = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  it('chama useLiveActivityPauseSync com isPaused e elapsedSeconds', () => {
    expect(executavel).toMatch(/useLiveActivityPauseSync\(\{[^}]*isPaused[^}]*elapsedSeconds[^}]*\}\)/s)
  })
})

/**
 * Invariantes do Swift, por leitura de texto (o widget não roda em jsdom).
 * Cada asserção corresponde a um jeito conhecido de o bug voltar pela metade.
 */
describe('Swift — pausa da Live Activity do treino', () => {
  const ios = join(__dirname, '..', '..', '..', 'ios', 'App')
  const attrs = readFileSync(join(ios, 'App', 'RestTimerAttributes.swift'), 'utf8')
  const plugin = readFileSync(join(ios, 'App', 'IronTracksNativePlugin.swift'), 'utf8')
  const widget = readFileSync(join(ios, 'IronTracksWidgets', 'RestTimerWidget.swift'), 'utf8')

  it('o ContentState do treino carrega pausa e âncora', () => {
    expect(attrs).toContain('var pausedElapsedSeconds: Int?')
    expect(attrs).toContain('var elapsedAnchorDate: Date?')
  })

  it('o método está registrado no plugin (senão o JS chama e o iOS não implementa)', () => {
    expect(plugin).toContain('CAPPluginMethod(name: "setWorkoutLiveActivityPaused"')
    expect(plugin).toContain('@objc func setWorkoutLiveActivityPaused')
  })

  it('o update de snapshot PRESERVA a pausa — senão concluir série descongela o relógio', () => {
    const corpo = plugin.slice(
      plugin.indexOf('@objc func updateWorkoutLiveActivity'),
      plugin.indexOf('@objc func updateWorkoutRestCountdown'),
    )
    expect(corpo).toContain('pausedElapsedSeconds: current?.pausedElapsedSeconds')
    expect(corpo).toContain('elapsedAnchorDate: current?.elapsedAnchorDate')
  })

  it('o update de descanso também preserva a pausa', () => {
    const corpo = plugin.slice(
      plugin.indexOf('@objc func updateWorkoutRestCountdown'),
      plugin.indexOf('@objc func setWorkoutLiveActivityPaused'),
    )
    expect(corpo).toContain('pausedElapsedSeconds: cur.pausedElapsedSeconds')
    expect(corpo).toContain('elapsedAnchorDate: cur.elapsedAnchorDate')
  })

  it('retomar ancora em agora − decorrido (o workoutStartDate é imutável)', () => {
    const corpo = plugin.slice(plugin.indexOf('@objc func setWorkoutLiveActivityPaused'))
    expect(corpo).toContain('Date().addingTimeInterval(-Double(elapsedSeconds))')
  })

  it('os TRÊS lugares do tempo de treino usam o componente único', () => {
    const usos = widget.match(/WorkoutElapsedText\(/g) ?? []
    // 1 declaração da struct + 3 usos (expandido, compactTrailing, tela bloqueada)
    expect(usos.length).toBe(3)
  })

  it('nenhum deles voltou a desenhar timerInterval a partir do workoutStartDate do TREINO', () => {
    const inicioWorkout = widget.indexOf('struct WorkoutLiveActivity: Widget')
    const fimWorkout = widget.indexOf('struct LockScreenBannerView')
    const trecho = widget.slice(inicioWorkout, fimWorkout)
    expect(trecho).not.toMatch(/timerInterval:\s*context\.attributes\.workoutStartDate/)
  })

  it('pausado desenha texto estático; correndo, timerInterval a partir da âncora', () => {
    const corpo = widget.slice(widget.indexOf('struct WorkoutElapsedText'), widget.indexOf('struct WorkoutLiveActivity: Widget'))
    expect(corpo).toContain('if let pausedSeconds = state.pausedElapsedSeconds')
    expect(corpo).toContain('Text(Self.format(pausedSeconds))')
    expect(corpo).toContain('state.elapsedAnchorDate ?? fallbackStart')
  })
})
