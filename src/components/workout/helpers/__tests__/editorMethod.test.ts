import { describe, it, expect } from 'vitest'
import { canonicalEditorMethod, isNonStandardEditorMethod, EDITOR_METHODS } from '../editorMethod'

describe('canonicalEditorMethod — casa o método com o dropdown', () => {
  it('normaliza a grafia do drop-set (o bug reportado)', () => {
    expect(canonicalEditorMethod('Drop-Set')).toBe('Drop-set')
    expect(canonicalEditorMethod('dropset')).toBe('Drop-set')
    expect(canonicalEditorMethod('drop set')).toBe('Drop-set')
    expect(canonicalEditorMethod('Drop-set')).toBe('Drop-set')
  })

  it('casa os demais métodos do dropdown case-insensitive', () => {
    expect(canonicalEditorMethod('rest-pause')).toBe('Rest-Pause')
    expect(canonicalEditorMethod('CLUSTER')).toBe('Cluster')
    expect(canonicalEditorMethod('bi-set')).toBe('Bi-Set')
    expect(canonicalEditorMethod('cardio')).toBe('Cardio')
    expect(canonicalEditorMethod('normal')).toBe('Normal')
  })

  it('vazio → Normal', () => {
    expect(canonicalEditorMethod('')).toBe('Normal')
    expect(canonicalEditorMethod(null)).toBe('Normal')
    expect(canonicalEditorMethod(undefined)).toBe('Normal')
  })

  it('método avançado fora do dropdown: mantém o valor original (não vira Normal)', () => {
    expect(canonicalEditorMethod('FST-7')).toBe('FST-7')
    expect(canonicalEditorMethod('Sistema 21')).toBe('Sistema 21')
    expect(canonicalEditorMethod('Onda')).toBe('Onda')
    expect(canonicalEditorMethod('Heavy Duty')).toBe('Heavy Duty')
  })
})

describe('isNonStandardEditorMethod', () => {
  it('false pros métodos do dropdown (inclusive grafia divergente)', () => {
    for (const m of EDITOR_METHODS) expect(isNonStandardEditorMethod(m)).toBe(false)
    expect(isNonStandardEditorMethod('Drop-Set')).toBe(false) // normaliza pra Drop-set
  })
  it('true pros avançados fora do dropdown', () => {
    expect(isNonStandardEditorMethod('FST-7')).toBe(true)
    expect(isNonStandardEditorMethod('Sistema 21')).toBe(true)
  })
})
