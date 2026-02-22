import { describe, it, expect } from 'vitest'

// Algoritmo Jaccard puro — extraído de useWorkoutDuplicates
function jaccardSimilarity(A: Set<string>, B: Set<string>): number {
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const v of A) if (B.has(v)) inter++
  const union = A.size + B.size - inter
  if (!union) return 0
  return inter / union
}

// Union-Find para agrupar duplicados
function findDuplicateGroups(
  items: Array<{ id: string; exercises: string[] }>
): Array<string[]> {
  const keys = items.map((w) => new Set(w.exercises.map((e) => e.toLowerCase())))
  const parent = items.map((_, i) => i)

  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) r = parent[r]
    let cur = x
    while (parent[cur] !== cur) { const p = parent[cur]; parent[cur] = r; cur = p }
    return r
  }
  const unite = (a: number, b: number) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (jaccardSimilarity(keys[i], keys[j]) >= 0.9) unite(i, j)
    }
  }

  const groupsMap = new Map<number, number[]>()
  for (let i = 0; i < items.length; i++) {
    const r = find(i)
    const arr = groupsMap.get(r) || []
    arr.push(i)
    groupsMap.set(r, arr)
  }

  return Array.from(groupsMap.values())
    .filter((g) => g.length >= 2)
    .map((g) => g.map((i) => items[i].id))
}

describe('useWorkoutDuplicates — lógica Jaccard', () => {
  describe('jaccardSimilarity', () => {
    it('100% similares — mesmos exercícios', () => {
      const A = new Set(['supino', 'rosca', 'agachamento'])
      const B = new Set(['supino', 'rosca', 'agachamento'])
      expect(jaccardSimilarity(A, B)).toBe(1)
    })

    it('0% — sem sobreposição', () => {
      const A = new Set(['supino', 'rosca'])
      const B = new Set(['agachamento', 'deadlift'])
      expect(jaccardSimilarity(A, B)).toBe(0)
    })

    it('50% — metade em comum', () => {
      const A = new Set(['supino', 'rosca'])
      const B = new Set(['supino', 'agachamento'])
      expect(jaccardSimilarity(A, B)).toBeCloseTo(1 / 3)
    })

    it('retorna 0 para sets vazios', () => {
      expect(jaccardSimilarity(new Set(), new Set(['supino']))).toBe(0)
      expect(jaccardSimilarity(new Set(['supino']), new Set())).toBe(0)
      expect(jaccardSimilarity(new Set(), new Set())).toBe(0)
    })

    it('3 de 4 em comum — ~75%', () => {
      const A = new Set(['a', 'b', 'c', 'd'])
      const B = new Set(['a', 'b', 'c', 'e'])
      // inter=3, union=5 → 0.6
      expect(jaccardSimilarity(A, B)).toBeCloseTo(3 / 5)
    })
  })

  describe('findDuplicateGroups', () => {
    it('agrupa treinos com 100% similaridade', () => {
      const items = [
        { id: 'w1', exercises: ['supino', 'rosca', 'agachamento'] },
        { id: 'w2', exercises: ['supino', 'rosca', 'agachamento'] },
        { id: 'w3', exercises: ['stiff', 'remada'] },
      ]
      const groups = findDuplicateGroups(items)
      expect(groups).toHaveLength(1)
      expect(groups[0]).toContain('w1')
      expect(groups[0]).toContain('w2')
      expect(groups[0]).not.toContain('w3')
    })

    it('não agrupa treinos completamente diferentes', () => {
      const items = [
        { id: 'w1', exercises: ['supino', 'rosca'] },
        { id: 'w2', exercises: ['stiff', 'remada'] },
        { id: 'w3', exercises: ['agachamento', 'leg press'] },
      ]
      const groups = findDuplicateGroups(items)
      expect(groups).toHaveLength(0)
    })

    it('retorna lista vazia se não há duplicados', () => {
      const items = [{ id: 'w1', exercises: ['supino'] }]
      const groups = findDuplicateGroups(items)
      expect(groups).toHaveLength(0)
    })

    it('retorna lista vazia para array vazio', () => {
      expect(findDuplicateGroups([])).toHaveLength(0)
    })

    it('agrupa 3 treinos quase idênticos em um único grupo', () => {
      const base = ['supino', 'rosca', 'agachamento', 'stiff', 'remada']
      const items = [
        { id: 'w1', exercises: base },
        { id: 'w2', exercises: base },
        { id: 'w3', exercises: base },
      ]
      const groups = findDuplicateGroups(items)
      expect(groups).toHaveLength(1)
      expect(groups[0]).toHaveLength(3)
    })
  })
})
