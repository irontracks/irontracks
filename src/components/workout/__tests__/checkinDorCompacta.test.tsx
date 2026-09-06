import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CheckinScale } from '../CheckinScale'

/**
 * A escala de dor começa com dois chips, não onze botões.
 *
 * Auditoria da tela do treino ativo (06/09/2026): o check-in e o check-out
 * abriam 11 botões de dor em duas linhas cada — 22 por treino — para uma
 * pergunta cuja resposta na base é **0,3 na média, com 24 respostas ≥7 em toda
 * a história**. A escala 1–10 continua a um toque de quem tem o que dizer; o
 * dado (0–10, mesmo campo) não mudou.
 */

afterEach(() => cleanup())

const DOR = { label: 'Sem dor', expandLabel: 'Tenho dor' }
const montar = (value: string, onChange = vi.fn(), zero: typeof DOR | undefined = DOR) =>
  render(
    <CheckinScale
      label="Dor muscular (0–10)"
      values={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
      gridCols="grid-cols-6"
      value={value}
      onChange={onChange}
      zero={zero}
    />,
  )

describe('CheckinScale compacta', () => {
  it('começa com DOIS chips, não onze botões', () => {
    montar('')
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Sem dor/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tenho dor/i })).toBeTruthy()
  })

  it('"Sem dor" grava 0 — o mesmo dado de antes, não um campo novo', () => {
    const onChange = vi.fn()
    montar('', onChange)
    fireEvent.click(screen.getByRole('button', { name: /Sem dor/i }))
    expect(onChange).toHaveBeenCalledWith('0')
  })

  it('"Sem dor" aparece marcado quando o valor é 0', () => {
    montar('0')
    expect(screen.getByRole('button', { name: /Sem dor/i }).getAttribute('aria-pressed')).toBe('true')
  })

  it('"Tenho dor" abre a escala 1–10', () => {
    montar('')
    fireEvent.click(screen.getByRole('button', { name: /Tenho dor/i }))
    expect(screen.getByRole('button', { name: '7' })).toBeTruthy()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(10)
  })

  it('valor acima de zero já abre a escala — esconder o 7 marcado seria mentir', () => {
    montar('7')
    expect(screen.getByRole('button', { name: '7' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: /Tenho dor/i })).toBeNull()
  })

  it('sem o modo compacto (RPE, satisfação) nada muda', () => {
    // Sem `zero` de verdade — `undefined` explícito cairia no default do helper.
    render(
      <CheckinScale
        label="Esforço (RPE 1–10)"
        values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
        gridCols="grid-cols-5"
        value=""
        onChange={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('button')).toHaveLength(10)
  })
})

describe('as duas telas usam o modo compacto na dor', () => {
  it('check-in (pré) e check-out (pós) passam `zero` só na escala de dor', () => {
    const pre = readFileSync(join(process.cwd(), 'src/app/(app)/dashboard/DashboardModals.tsx'), 'utf8')
    const pos = readFileSync(join(process.cwd(), 'src/components/workout/Modals.tsx'), 'utf8')
    for (const src of [pre, pos]) {
      const dor = src.slice(src.indexOf('label="Dor muscular'), src.indexOf('label="Dor muscular') + 600)
      expect(dor).toMatch(/zero=\{\{ label: 'Sem dor'/)
    }
    // RPE e satisfação continuam abertas: lá a resposta varia, e é o dado que
    // alimenta o motor de carga.
    const rpe = pos.slice(pos.indexOf('label="Esforço'), pos.indexOf('label="Satisfação'))
    expect(rpe).not.toMatch(/zero=/)
  })
})
