import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { isNonWorkingSet, nonWorkingSetLabel } from '@/utils/report/setVolume'
import { ReportExerciseCard } from '../ReportExerciseCard'

/**
 * "Preciso saber qual série foi aquecimento" (dono, 05/08/2026, com print).
 *
 * A marcação já era gravada (`set_type: 'warmup'`, conferido no treino real dele:
 * leg press 160 kg como primeira série) e o PDF já a exibia — só a TABELA do
 * relatório em tela ignorava. Pior: a série de aquecimento ganhava coluna de
 * evolução comparando-a com a série de trabalho do treino anterior, e saía
 * "−112 kg 1RM (−33,3%)" em vermelho, como se ele tivesse regredido.
 */

/** Os logs REAIS do treino dele, com a primeira série marcada como aquecimento. */
const sessionLogs: Record<string, unknown> = {
  '0-0': { done: true, weight: '160', reps: '12', rpe: '6', set_type: 'warmup', is_warmup: true },
  '0-1': { done: true, weight: '260', reps: '12', rpe: '7' },
  '0-2': { done: true, weight: '285', reps: '12', rpe: '8' },
}

const exercise = { name: 'Leg press 45°', sets: 3 }

describe('a regra de "não é série de trabalho"', () => {
  it('reconhece aquecimento pelas duas grafias e pelo flag legado', () => {
    expect(isNonWorkingSet({ set_type: 'warmup' })).toBe(true)
    expect(isNonWorkingSet({ setType: 'warmup' })).toBe(true)
    expect(isNonWorkingSet({ is_warmup: true })).toBe(true)
    expect(isNonWorkingSet({ isWarmup: true })).toBe(true)
  })

  it('reconhece reconhecimento (feeler) — existe no histórico dele', () => {
    expect(isNonWorkingSet({ set_type: 'feeler' })).toBe(true)
    expect(nonWorkingSetLabel({ set_type: 'feeler' })).toBe('Recon.')
  })

  it('série de trabalho não é marcada', () => {
    expect(isNonWorkingSet({ weight: '260', reps: '12' })).toBe(false)
    expect(isNonWorkingSet({ set_type: 'working' })).toBe(false)
    expect(nonWorkingSetLabel({ set_type: 'working' })).toBeNull()
  })

  it('`is_warmup: false` explícito não vira aquecimento', () => {
    // O app grava `is_warmup: false` junto de `set_type: 'feeler'` — se a leitura
    // olhasse só o booleano, o feeler viraria "Aquec." e vice-versa.
    expect(nonWorkingSetLabel({ set_type: 'feeler', is_warmup: false })).toBe('Recon.')
  })

  it('entrada inválida não quebra', () => {
    for (const v of [null, undefined, 'x', 42, []]) expect(isNonWorkingSet(v)).toBe(false)
  })
})

describe('o que aparece na tabela do relatório', () => {
  const renderCard = () =>
    render(
      <ReportExerciseCard
        exercise={exercise}
        exIdx={0}
        sessionLogs={sessionLogs}
        prevLogs={[
          { weight: '240', reps: '12' },
          { weight: '260', reps: '12' },
          { weight: '285', reps: '12' },
        ]}
        baseMs={null}
      />,
    )

  it('a série de aquecimento é identificada', () => {
    renderCard()
    expect(screen.getByText('Aquec.')).toBeTruthy()
  })

  it('aquecimento NÃO recebe percentual de evolução', () => {
    const { container } = renderCard()
    const linhas = container.querySelectorAll('tbody tr')
    // A 1ª linha é o aquecimento: nada de "%" nela.
    expect(linhas[0]!.textContent).not.toMatch(/%/)
    // A 2ª é série de trabalho e mantém a comparação normal.
    expect(linhas[0]!.textContent).toContain('160')
  })

  it('"Melhor" não vai para uma série de aquecimento', () => {
    /*
     * Com um aquecimento pesado o suficiente, o 1RM estimado dele poderia ganhar
     * das séries de trabalho e roubar o selo — `reportMetrics` já ignorava essas
     * séries nos totais, e a tabela precisava do mesmo critério.
     */
    const { container } = render(
      <ReportExerciseCard
        exercise={exercise}
        exIdx={0}
        sessionLogs={{
          '0-0': { done: true, weight: '400', reps: '12', set_type: 'warmup' },
          '0-1': { done: true, weight: '100', reps: '12' },
        }}
        prevLogs={[]}
        baseMs={null}
      />,
    )
    const linhas = container.querySelectorAll('tbody tr')
    expect(linhas[0]!.textContent).not.toContain('Melhor')
    expect(linhas[1]!.textContent).toContain('Melhor')
  })
})
