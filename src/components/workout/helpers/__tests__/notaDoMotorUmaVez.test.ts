/**
 * Um fato, um lugar — na série (auditoria da tela do treino ativo, 06/09/2026).
 *
 * Dois achados com a mesma raiz:
 *  1. A explicação 🧠 do motor era repetida em cada série do exercício (3–4
 *     cópias idênticas). Agora aparece na primeira série PENDENTE, e só nela.
 *  2. A montagem de anilhas era dita DUAS vezes na mesma série, por dois
 *     módulos com dois inventários: "1×20 + 1×5 + 1×2,5 por lado" (anilhas
 *     padrão, peso sugerido) e "Por lado: 1×20 + 1×5 · ≈70kg montável"
 *     (inventário do usuário, peso do campo). Duas verdades para 75 kg. Fica a
 *     do inventário (`PlateHintLine`); o renderer que a desenha não passa mais
 *     `plateHint` à `AutoloadNote`.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPrimeiraSeriePendente } from '../notaDoMotorUmaVez'

const getLogDe = (logs: Record<string, Record<string, unknown>>) => (k: string) => logs[k]

describe('isPrimeiraSeriePendente', () => {
  it('a série 0 é sempre a primeira pendente', () => {
    expect(isPrimeiraSeriePendente(getLogDe({}), 0, 0)).toBe(true)
  })

  it('série 1 só é a primeira pendente quando a 0 está feita', () => {
    expect(isPrimeiraSeriePendente(getLogDe({}), 0, 1)).toBe(false)
    expect(isPrimeiraSeriePendente(getLogDe({ '0-0': { done: true } }), 0, 1)).toBe(true)
  })

  it('só o `done` conta — peso preenchido pelo motor não é série feita', () => {
    expect(isPrimeiraSeriePendente(getLogDe({ '0-0': { weight: '84', weightSource: 'auto' } }), 0, 1)).toBe(false)
  })

  it('olha só as séries DESTE exercício', () => {
    expect(isPrimeiraSeriePendente(getLogDe({ '1-0': { done: true } }), 0, 1)).toBe(false)
    expect(isPrimeiraSeriePendente(getLogDe({ '0-0': { done: true } }), 1, 1)).toBe(false)
  })

  it('índice inválido não é primeira de nada', () => {
    expect(isPrimeiraSeriePendente(getLogDe({}), 0, -1)).toBe(false)
    expect(isPrimeiraSeriePendente(getLogDe({}), 0, Number.NaN)).toBe(false)
  })
})

const RENDERERS = join(process.cwd(), 'src/components/workout/set-renderers')
const ler = (p: string) => readFileSync(p, 'utf8')
const semComentarios = (s: string) =>
  s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('fiação — a regra chega a quem desenha a nota', () => {
  it('useAutoloadWeight (13 renderers) filtra o rationale pela primeira pendente', () => {
    const hook = semComentarios(ler(join(process.cwd(), 'src/components/workout/hooks/useAutoloadWeight.ts')))
    expect(hook).toMatch(/rationale:\s*isPrimeiraSeriePendente\(getLog,\s*exIdx,\s*setIdx\)\s*\?/)
  })

  it('normalSet (que não usa o hook) aplica a mesma regra', () => {
    const normal = semComentarios(ler(join(RENDERERS, 'normalSet.tsx')))
    expect(normal).toMatch(/isPrimeiraSeriePendente\(getLog,\s*exIdx,\s*setIdx\)/)
    // As duas notas (unilateral e bilateral) leem o valor filtrado, não o cru.
    expect(normal).not.toMatch(/rationale=\{autoSuggestion\?\.rationale/)
  })
})

describe('guard de classe — anilhas têm UMA fonte por série', () => {
  const arquivos = readdirSync(RENDERERS).filter((f) => f.endsWith('.tsx'))

  it('a varredura viu os renderers (senão o guard fica cego)', () => {
    expect(arquivos.length).toBeGreaterThan(10)
  })

  it('renderer que desenha PlateHintLine não passa plateHint à AutoloadNote', () => {
    const infratores = arquivos.filter((nome) => {
      const code = semComentarios(ler(join(RENDERERS, nome)))
      const temLinha = /<PlateHintLine\b/.test(code)
      const passaHint = /<AutoloadNote\b[^>]*\bplateHint=/.test(code)
      return temLinha && passaHint
    })
    expect(infratores, 'duas montagens para o mesmo peso, por dois inventários').toEqual([])
  })
})
