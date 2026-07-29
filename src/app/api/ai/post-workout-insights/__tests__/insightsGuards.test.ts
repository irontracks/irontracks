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

describe('post-workout-insights — a IA nunca calcula agregado (guard #C)', () => {
  /**
   * Em 29/07/2026 o card do relatório dizia "26.300 kg / 29 séries" e o texto
   * gerado logo abaixo afirmava "18.232 kg em 26 séries de trabalho". O MESMO
   * 18.232 apareceu numa sessão de volume real 17.566 kg, e a string não existia
   * no payload: o modelo estava somando os logs por conta própria e errando.
   * A causa era de ORDEM — computeMetrics rodava DEPOIS de generateContent,
   * então o número correto nunca entrava no prompt.
   */
  const idxMetrics = src.indexOf('computeMetrics(sessionObj)')
  const idxPrompt = src.indexOf('const prompt = [')
  const idxGenerate = src.indexOf('generateContent(prompt)')

  it('computa as métricas ANTES de montar o prompt e de gerar', () => {
    expect(idxMetrics).toBeGreaterThan(-1)
    expect(idxPrompt).toBeGreaterThan(-1)
    expect(idxGenerate).toBeGreaterThan(-1)
    expect(idxMetrics).toBeLessThan(idxPrompt)
    expect(idxPrompt).toBeLessThan(idxGenerate)
  })

  it('injeta as métricas oficiais no prompt como fonte de verdade', () => {
    expect(src).toContain('MÉTRICAS OFICIAIS DA SESSÃO ATUAL')
    expect(src).toContain('JSON.stringify(metrics)')
    // a comparação com a sessão anterior também precisa de número pronto
    expect(src).toContain('JSON.stringify(prevMetrics)')
  })

  it('proíbe explicitamente o modelo de recalcular', () => {
    expect(src).toContain('NÃO recalcule')
    expect(src.toUpperCase()).toContain('PROIBIDO SOMAR')
  })

  it('reconcilia a narrativa antes de salvar/exibir', () => {
    expect(src).toContain('reconcileAiNarrative')
    // a divergência residual precisa ser observável, senão volta a ser silenciosa
    expect(src).toContain('logWarnRemote')
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
