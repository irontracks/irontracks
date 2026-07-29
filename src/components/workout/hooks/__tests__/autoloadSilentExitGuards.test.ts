/**
 * Source-guards das duas defesas que não dá pra exercitar como função pura:
 * o descarte do prefill na LEITURA do histórico e a exibição do motivo na tela.
 *
 * Contexto: o autoload falhava em silêncio absoluto — sem nada na tela e sem nada
 * no Sentry. O rationale ("sem histórico neste exercício…") era computado e jogado
 * fora, então "motor desligado", "motor sem base" e "campo vazio" ficavam
 * indistinguíveis para o usuário.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

const deload = read('src/components/workout/hooks/useWorkoutDeload.ts')
const autoload = read('src/components/workout/hooks/useWorkoutAutoload.ts')
const normalSet = read('src/components/workout/set-renderers/normalSet.tsx')

describe('histórico não é envenenado pelo prefill do motor', () => {
  it('useWorkoutDeload descarta log que só tem peso automático, sem reps e sem conclusão', () => {
    expect(deload).toContain('isEnginePrefillOnly')
    // as três condições precisam estar presentes — afrouxar qualquer uma
    // reabre o auto-envenenamento
    expect(deload).toMatch(/weightSource[\s\S]{0,80}auto/)
    expect(deload).toMatch(/isEnginePrefillOnly[\s\S]{0,220}reps == null/)
    expect(deload).toMatch(/isEnginePrefillOnly[\s\S]{0,220}doneRaw == null/)
  })
})

describe('o motor não escolhe histórico cegamente', () => {
  it('usa pickUsableHistory (com fallback) em vez de pegar a sessão mais recente', () => {
    expect(autoload).toContain('pickUsableHistory')
    // o padrão antigo — sort e índice zero — não pode voltar
    expect(autoload).not.toMatch(/sort\(\(a, b\) => b\.ts - a\.ts\)\[0\]/)
  })
})

describe('saída do motor é observável', () => {
  it('emite warning remoto quando está ligado e mesmo assim não sugere', () => {
    expect(autoload).toContain('logWarnRemote')
    expect(autoload).toMatch(/suggestion\.weight == null/)
  })

  it('a tela mostra o motivo quando não há sugestão (chip cinza)', () => {
    // condição do ramo: motor ligado, série de trabalho, não concluída e sem peso sugerido
    expect(normalSet).toMatch(
      /autoLoadEnabled && setType === 'working' && !done && autoSuggestionWeight == null/,
    )
    expect(normalSet).toMatch(/<AutoloadNote show muted/)
  })
})
