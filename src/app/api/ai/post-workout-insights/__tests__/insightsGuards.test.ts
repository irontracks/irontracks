import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(
  resolve(process.cwd(), 'src/app/api/ai/post-workout-insights/route.ts'),
  'utf8',
)

describe('post-workout-insights — volume canônico (guard #B)', () => {
  it('usa setVolume + isWorkingSet (não weight×reps flat que subestimava)', () => {
    expect(src).toContain("from '@/utils/report/setVolume'")
    expect(src).toContain('setVolume(log)')
    expect(src).toContain('isWorkingSet(log)')
  })
})

describe('post-workout-insights — privacidade de exames (guard #A)', () => {
  it("NÃO injeta 'labs' no contexto (relatório é compartilhável)", () => {
    // não deve pedir labs na chamada de contexto (o comentário do código pode
    // citar a palavra; o que importa é o array passado ao buildUserContextBlock).
    expect(src).not.toContain("'nutrition', 'labs'")
    expect(src).toContain("['profile', 'nutrition']")
  })
  it('instrui a IA a não citar marcadores clínicos', () => {
    expect(src.toLowerCase()).toContain('não cite exames')
  })
})
