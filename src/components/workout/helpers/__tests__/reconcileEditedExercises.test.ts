import { describe, it, expect } from 'vitest'
import {
  tagExercisesForEdit,
  reconcileEditedExercises,
  remapIndexSet,
  remapCurrentIndex,
  EDIT_LOG_KEY,
} from '../reconcileEditedExercises'

describe('tagExercisesForEdit', () => {
  it('etiqueta cada exercício com chave estável por índice, sem mutar o original', () => {
    const orig = [{ name: 'A' }, { name: 'B' }]
    const tagged = tagExercisesForEdit(orig)
    expect(tagged[0][EDIT_LOG_KEY]).toBe('orig-0')
    expect(tagged[1][EDIT_LOG_KEY]).toBe('orig-1')
    expect((orig[0] as Record<string, unknown>)[EDIT_LOG_KEY]).toBeUndefined()
  })

  it('lida com entrada inválida', () => {
    expect(tagExercisesForEdit(null)).toEqual([])
    expect(tagExercisesForEdit(undefined)).toEqual([])
  })
})

describe('reconcileEditedExercises', () => {
  const tag = (n: number) => tagExercisesForEdit(Array.from({ length: n }, (_, i) => ({ name: `E${i}` })))

  it('sem mudança de ordem: logs preservados, sem remap efetivo', () => {
    const orig = tag(3)
    const logs = { '0-0': { done: true }, '1-0': { done: true }, '2-0': { done: true } }
    const r = reconcileEditedExercises(orig, orig, logs)
    expect(r.logs).toEqual(logs)
    expect(r.exercises.every((e) => !(EDIT_LOG_KEY in e))).toBe(true)
  })

  it('reordena: logs acompanham o exercício (por chave, não posição)', () => {
    const orig = tag(3) // orig-0, orig-1, orig-2
    const edited = [orig[2], orig[0], orig[1]] // nova ordem: E2, E0, E1
    const logs = { '0-0': 'a', '1-0': 'b', '2-0': 'c' }
    const r = reconcileEditedExercises(orig, edited, logs)
    // E2 (old 2 → new 0), E0 (old 0 → new 1), E1 (old 1 → new 2)
    expect(r.logs).toEqual({ '0-0': 'c', '1-0': 'a', '2-0': 'b' })
    expect(r.remap.get(2)).toBe(0)
    expect(r.remap.get(0)).toBe(1)
    expect(r.remap.get(1)).toBe(2)
  })

  it('remove um exercício: logs dele são descartados, os demais reindexados', () => {
    const orig = tag(3)
    const edited = [orig[0], orig[2]] // remove E1
    const logs = { '0-0': 'a', '1-0': 'b', '2-0': 'c' }
    const r = reconcileEditedExercises(orig, edited, logs)
    expect(r.logs).toEqual({ '0-0': 'a', '1-0': 'c' }) // b (removido) sumiu; c foi de 2→1
    expect(r.remap.has(1)).toBe(false)
  })

  it('adiciona exercício novo (sem chave): sem logs, não colide com os existentes', () => {
    const orig = tag(2)
    const novo = { name: 'Novo' } // sem __logKey
    const edited = [orig[0], novo, orig[1]]
    const logs = { '0-0': 'a', '1-0': 'b' }
    const r = reconcileEditedExercises(orig, edited, logs)
    // E0 fica em 0; novo em 1 (sem log); E1 vai de 1→2
    expect(r.logs).toEqual({ '0-0': 'a', '2-0': 'b' })
    expect(r.exercises[1]).toEqual({ name: 'Novo' })
  })

  it('preserva chaves de log não numéricas / unilateral (sufixo após o traço)', () => {
    const orig = tag(2)
    const edited = [orig[1], orig[0]]
    const logs = { '0-L_0': 'la', '0-R_0': 'ra', '1-0': 'b' }
    const r = reconcileEditedExercises(orig, edited, logs)
    // old 0 → new 1: "0-L_0"→"1-L_0", "0-R_0"→"1-R_0"; old 1 → new 0: "1-0"→"0-0"
    expect(r.logs).toEqual({ '1-L_0': 'la', '1-R_0': 'ra', '0-0': 'b' })
  })

  it('duplicata (mesma chave duas vezes): só a primeira herda os logs', () => {
    const orig = tag(1)
    const edited = [orig[0], { ...orig[0] }] // duplicou E0 (mesma __logKey)
    const logs = { '0-0': 'a' }
    const r = reconcileEditedExercises(orig, edited, logs)
    expect(r.logs).toEqual({ '0-0': 'a' }) // fica no primeiro
    expect(r.remap.get(0)).toBe(0)
    expect(r.exercises).toHaveLength(2)
  })

  it('entrada vazia/ inválida não quebra', () => {
    expect(reconcileEditedExercises(null, null, null).exercises).toEqual([])
    expect(reconcileEditedExercises([], [], {}).logs).toEqual({})
  })
})

describe('remapIndexSet', () => {
  it('remapeia índices e descarta removidos', () => {
    const remap = new Map([[0, 1], [2, 0]]) // 1 foi removido
    const r = remapIndexSet(new Set([0, 1, 2]), remap)
    expect(r).toEqual(new Set([1, 0]))
  })
})

describe('remapCurrentIndex', () => {
  it('segue o remap quando o atual sobreviveu', () => {
    expect(remapCurrentIndex(2, new Map([[2, 0]]), 3)).toBe(0)
  })
  it('atual removido: cai no vizinho válido (clamp)', () => {
    expect(remapCurrentIndex(2, new Map([[0, 0]]), 2)).toBe(1)
    expect(remapCurrentIndex(5, new Map(), 3)).toBe(2)
  })
  it('lista vazia → 0', () => {
    expect(remapCurrentIndex(3, new Map(), 0)).toBe(0)
  })
})
