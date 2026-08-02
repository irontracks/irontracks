import { describe, it, expect } from 'vitest'
import { extractJsonFromModelText, repairJsonText, stripCodeFence } from '@/utils/ai/extractJson'

describe('extractJsonFromModelText — fonte única (antes eram 3 cópias idênticas)', () => {
  it('faz parse de JSON puro', () => {
    expect(extractJsonFromModelText('{"a":1}')).toEqual({ a: 1 })
  })

  it('recorta JSON embrulhado em prosa/markdown', () => {
    expect(extractJsonFromModelText('Claro! ```json\n{"x": 2}\n``` pronto')).toEqual({ x: 2 })
  })

  it('retorna null para texto sem objeto', () => {
    expect(extractJsonFromModelText('nenhum json aqui')).toBeNull()
    expect(extractJsonFromModelText('')).toBeNull()
    expect(extractJsonFromModelText('   ')).toBeNull()
  })

  it('pega do primeiro { ao último }', () => {
    expect(extractJsonFromModelText('lixo {"a": {"b": 1}} lixo')).toEqual({ a: { b: 1 } })
  })
})

/**
 * Guard do REPARO sintático (jul/2026).
 *
 * Bug real: a correlação da Avaliação por Foto falhava para o usuário com "Não
 * consegui gerar a correlação. Tente novamente.". Reproduzido em 12 chamadas ao
 * gemini-2.5-flash com o prompt de produção — 8 falharam, e parte delas porque o
 * modelo devolvia JSON quebrado, esquecendo o `}` de um item de array:
 *
 *   "trend": "supported"
 *   ,
 *   { "muscleGroup": "Quadríceps", …
 *
 * Recortar do `{` ao `}` NÃO salva esse caso (o recorte preserva o defeito) —
 * só o reparo salva. O fixture abaixo é texto real do modelo, encurtado.
 */
describe('extractJsonFromModelText — reparo de JSON quebrado pelo modelo', () => {
  const quebrado = [
    '```json',
    '{',
    '  "headline": "Treino consistente",',
    '  "links": [',
    '    {',
    '      "muscleGroup": "Peitoral",',
    '      "observation": "Supino reto com 24.800 kg de volume.",',
    '      "trend": "supported"',
    '    ,',
    '    {',
    '      "muscleGroup": "Quadríceps",',
    '      "observation": "Agachamento livre em 42 séries.",',
    '      "trend": "supported"',
    '    }',
    '  ],',
    '  "confidence": "high"',
    '}',
    '```',
  ].join('\n')

  it('o recorte puro (comportamento antigo) de fato NÃO parseia esse texto', () => {
    const sliced = quebrado.slice(quebrado.indexOf('{'), quebrado.lastIndexOf('}') + 1)
    expect(() => JSON.parse(sliced)).toThrow()
  })

  it('recupera o objeto de array com `}` faltando', () => {
    const parsed = extractJsonFromModelText(quebrado) as Record<string, unknown>
    expect(parsed).toBeTruthy()
    expect(parsed.headline).toBe('Treino consistente')
    expect((parsed.links as unknown[]).length).toBe(2)
    expect(parsed.confidence).toBe('high')
  })

  it('remove cerca markdown com e sem fechamento', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripCodeFence('```json\n{"a":1}')).toBe('{"a":1}')
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}')
  })

  it('fecha containers de resposta truncada (MAX_TOKENS)', () => {
    const parsed = extractJsonFromModelText(
      '{"headline":"abc","links":[{"muscleGroup":"Peito","observation":"tex',
    ) as Record<string, unknown>
    expect(parsed).toBeTruthy()
    expect(parsed.headline).toBe('abc')
  })

  it('remove vírgula sobrando antes de } e ]', () => {
    expect(JSON.parse(repairJsonText('{"a":1,}'))).toEqual({ a: 1 })
    expect(JSON.parse(repairJsonText('{"a":[1,2,]}'))).toEqual({ a: [1, 2] })
  })

  it('insere vírgula faltando entre itens de array', () => {
    expect(JSON.parse(repairJsonText('[{"a":1} {"a":2}]'))).toEqual([{ a: 1 }, { a: 2 }])
    expect(JSON.parse(repairJsonText('["a" "b"]'))).toEqual(['a', 'b'])
  })

  it('não estraga JSON válido com chaves/vírgulas dentro de string', () => {
    const src = '{"note":"peso 10,5 kg {ajustar}, série [1]","ok":true}'
    expect(JSON.parse(repairJsonText(src))).toEqual({ note: 'peso 10,5 kg {ajustar}, série [1]', ok: true })
    expect(extractJsonFromModelText(src)).toEqual({ note: 'peso 10,5 kg {ajustar}, série [1]', ok: true })
  })

  it('aceita array no topo (não só objeto)', () => {
    expect(extractJsonFromModelText('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }])
  })
})
