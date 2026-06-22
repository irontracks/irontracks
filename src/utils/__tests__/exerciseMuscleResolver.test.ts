import { describe, it, expect, vi } from 'vitest'
import { buildLibraryIndex, resolveExerciseMuscles, type LibRow } from '@/utils/exerciseMuscleResolver'

const LIB: LibRow[] = [
  { normalized_name: 'crucifixo invertido na maquina', aliases: ['Crucifixo inverso'], primary_muscle: 'ombros_posteriores', secondary_muscles: ['costas'] },
  { normalized_name: 'supino reto', aliases: null, primary_muscle: 'peito', secondary_muscles: ['triceps'] },
  { normalized_name: 'sem musculo', aliases: null, primary_muscle: null, secondary_muscles: [] },
]
const index = buildLibraryIndex(LIB)

describe('resolveExerciseMuscles (anti-falhas)', () => {
  it('1) resolve pelo library (normalized_name) — fonte curada', () => {
    const r = resolveExerciseMuscles('Crucifixo invertido na máquina', index)
    expect(r?.primary).toBe('ombros_posteriores')
    expect(r?.secondary).toEqual(['costas'])
    expect(r?.source).toBe('library')
  })

  it('2) resolve por alias do library', () => {
    const r = resolveExerciseMuscles('crucifixo inverso', index)
    expect(r?.primary).toBe('ombros_posteriores')
    expect(r?.source).toBe('library_alias')
  })

  it('3) cai na heurística quando não está no library — e sinaliza buraco', () => {
    const onGap = vi.fn()
    const r = resolveExerciseMuscles('Rosca direta', index, onGap)
    expect(r?.primary).toBe('biceps')
    expect(r?.source).toBe('heuristic')
    expect(onGap).toHaveBeenCalledWith('Rosca direta', 'heuristic')
  })

  it('4) não resolve nada conhecido — sinaliza unresolved, retorna null', () => {
    const onGap = vi.fn()
    const r = resolveExerciseMuscles('xpto zzz inexistente', index, onGap)
    expect(r).toBeNull()
    expect(onGap).toHaveBeenCalledWith('xpto zzz inexistente', 'unresolved')
  })

  it('5) heurística mapeia encolhimento para trapezio (taxonomia library)', () => {
    const r = resolveExerciseMuscles('Encolhimento com barra', buildLibraryIndex([]))
    expect(r?.primary).toBe('trapezio')
  })

  it('ignora linhas do library sem músculo (não casa)', () => {
    const r = resolveExerciseMuscles('sem musculo', index)
    // não tem heurística válida -> null (não retorna a linha vazia)
    expect(r).toBeNull()
  })
})
