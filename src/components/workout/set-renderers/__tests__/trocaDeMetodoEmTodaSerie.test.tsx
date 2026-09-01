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

/**
 * Guard de CLASSE: escolher método PERGUNTA se vale só hoje ou também no plano.
 *
 * Os dois seletores (o do card, para série avançada, e o do rodapé da série
 * normal) escreviam direto em `logs[...].per_set_method` — ou seja, só na
 * sessão, e sem dizer isso a ninguém. Quem ajustava o treino de verdade refazia
 * a troca toda semana.
 *
 * A checagem mira em QUEM ESCREVE, não no nome do handler: um `updateLog` com
 * `per_set_method` em qualquer componente do treino é a forma exata do defeito,
 * inclusive num seletor novo que ninguém previu aqui. Quem pergunta e persiste
 * é `changeSetMethod`, no `useWorkoutExerciseCrud` (guard próprio de
 * comportamento em `hooks/__tests__/changeSetMethod.test.tsx`).
 */
describe('trocar método pergunta sobre o plano', () => {
  const COMPONENTES = join(process.cwd(), 'src/components/workout')

  const arquivosDeComponente = (dir: string): string[] => {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...arquivosDeComponente(full))
      else if (/\.tsx$/.test(entry.name)) out.push(full)
    }
    return out
  }

  it('os dois seletores chamam changeSetMethod', () => {
    const NORMAL = readFileSync(join(RENDERERS_DIR, 'normalSet.tsx'), 'utf8')
    expect(CARD).toMatch(/changeSetMethod\(exIdx, setIdx,/)
    expect(NORMAL).toMatch(/changeSetMethod\(exIdx, setIdx,/)
  })

  it('nenhum componente do treino grava per_set_method direto no log', () => {
    const offenders: string[] = []
    for (const file of arquivosDeComponente(COMPONENTES)) {
      const code = readFileSync(file, 'utf8')
      // `updateLog(<algo>, { … per_set_method … })` — a escrita que pula a pergunta.
      if (/updateLog\([^)]*per_set_method/s.test(code)) offenders.push(file.replace(process.cwd() + '/', ''))
    }
    expect(offenders, 'use changeSetMethod — ele pergunta e persiste').toEqual([])
  })
})
