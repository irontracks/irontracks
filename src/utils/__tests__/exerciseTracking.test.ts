import { describe, it, expect } from 'vitest'
import { isPlank } from '../exerciseTracking'

describe('isPlank', () => {
  it.each([
    'Prancha',
    'prancha',
    'Prancha lateral',
    'Prancha com toques no ombro',
    'Plank',
    'plank',
    'Side plank',
    'PRANCHA',
  ])('retorna true para %s', (name) => {
    expect(isPlank(name)).toBe(true)
  })

  it.each([
    'Supino',
    'Agachamento',
    'Rosca direta',
    'Bird-dog',
    'Dead bug',
    'Abdominal',
    'Abdominal infra',
    '',
  ])('retorna false para %s', (name) => {
    expect(isPlank(name)).toBe(false)
  })

  it('retorna false para entradas nulas/undefined', () => {
    expect(isPlank(null as unknown as string)).toBe(false)
    expect(isPlank(undefined as unknown as string)).toBe(false)
  })

  it('ignora espaços em branco nas bordas', () => {
    expect(isPlank('  Prancha  ')).toBe(true)
  })
})
