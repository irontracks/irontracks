/**
 * Guard de CLASSE: a troca de método existe em QUALQUER série, não só na normal.
 *
 * O bug (24/08/2026): o seletor vivia dentro do `normalSet.tsx`. Escolher
 * "Drop-Set" fazia o `renderSet` devolver `DropSetSet` — **e o seletor sumia
 * junto**. Caminho de mão única: a única saída era apagar a série. No caso real
 * era pior, porque o drop nem tinha sido escolhido: veio da nota do exercício
 * ("DROP-SET na última série"), então não havia nada para desfazer.
 *
 * Este arquivo é guard da CLASSE de propósito. Um teste que só renderizasse o
 * `DropSetSet` cobriria 1 dos 14 renderers — e a pergunta certa ao escrever
 * guard é "onde ele NÃO olha?". Aqui a checagem é no ROTEADOR: o seletor é
 * desenhado pelo `ExerciseCard`, uma vez por série, fora dos renderers.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetMethodPicker, SET_METHOD_OPTIONS } from '../SetMethodPicker'

const CARD = readFileSync(join(process.cwd(), 'src/components/workout/ExerciseCard.tsx'), 'utf8')
const RENDERERS_DIR = join(process.cwd(), 'src/components/workout/set-renderers')

describe('o seletor de método vive FORA dos renderers', () => {
  it('o card desenha o seletor junto de cada série', () => {
    expect(CARD).toMatch(/renderMethodPicker\(setIdx\)/)
    expect(CARD).toMatch(/<SetMethodPicker/)
  })

  it('nenhum renderer reimplementa a lista de métodos', () => {
    // 14 cópias divergindo em silêncio é a família de bug deste diretório.
    const offenders: string[] = []
    for (const file of readdirSync(RENDERERS_DIR)) {
      if (!/\.tsx?$/.test(file) || file === 'SetMethodPicker.tsx') continue
      const code = readFileSync(join(RENDERERS_DIR, file), 'utf8')
      // A lista literal de opções ('Drop-Set' + 'Rest-Pause' no mesmo array).
      if (/\[\s*'Normal',\s*'Drop-Set'/.test(code)) offenders.push(file)
    }
    expect(offenders, 'use o SetMethodPicker do card').toEqual([])
  })

  it('o rótulo vem de resolveSetMethodLabel, não de um palpite', () => {
    // Rotular por `per_set_method` sozinho diria "Normal" numa série DROP.
    expect(CARD).toMatch(/resolveSetMethodLabel\(/)
  })
})

describe('SetMethodPicker', () => {
  const setup = (current = '') => {
    const onSelect = vi.fn()
    render(<SetMethodPicker current={current} onSelect={onSelect} />)
    return { onSelect }
  }

  it('série sem método mostra "Normal"', () => {
    setup()
    expect(screen.getByRole('button', { name: /Método da série: Normal/ })).toBeTruthy()
  })

  it('série com drop VINDO DA NOTA mostra "Drop-Set" — e abre a lista', () => {
    setup('Drop-Set')
    fireEvent.click(screen.getByRole('button', { name: /Método da série: Drop-Set/ }))
    for (const opt of SET_METHOD_OPTIONS) {
      expect(screen.getByRole('button', { name: opt }), opt).toBeTruthy()
    }
  })

  it('escolher Normal devolve `Normal` EXPLÍCITO — string vazia não desfaz nada', () => {
    // `''` cairia de volta na inferência por nota: o seletor pareceria funcionar
    // e a série continuaria drop. Foi o defeito do seletor antigo.
    const { onSelect } = setup('Drop-Set')
    fireEvent.click(screen.getByRole('button', { name: /Método da série/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    expect(onSelect).toHaveBeenCalledWith('Normal')
  })

  it('série concluída não troca de método', () => {
    render(<SetMethodPicker current="Drop-Set" onSelect={vi.fn()} disabled />)
    expect(screen.queryByRole('button', { name: /Método da série/ })).toBeNull()
  })
})
