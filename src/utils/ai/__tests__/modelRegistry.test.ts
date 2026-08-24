import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_GEMINI_TEXT_MODEL,
  isNonTextGeminiModel,
  isRetiredGeminiModel,
  isSunsettingGeminiModel,
  resolveGeminiModel,
  resolveGeminiModelId,
} from '../modelRegistry'

/**
 * Guards da migração de modelo Gemini (24/08/2026).
 *
 * O bug que originou tudo: o default de `env.gemini.modelId` era
 * `gemini-1.5-pro`, DESLIGADO pelo Google em 24/09/2025, e ~20 rotas de IA
 * dependiam dele. Só não quebrou porque a env var de produção existia.
 *
 * Três camadas, de propósito — as duas primeiras sozinhas já passaram verdes
 * com o bug vivo em ensaio:
 *  1. comportamento do registro (função pura);
 *  2. FIAÇÃO — o que `getGeminiModel` de fato manda ao SDK (o registro pode
 *     estar perfeito e ninguém chamá-lo);
 *  3. source-guard de CLASSE — nenhum literal de modelo morto no código
 *     executável de `src/`, para o próximo default não nascer torto.
 */

describe('modelRegistry — classificação', () => {
  it('reconhece os modelos que o Google já desligou', () => {
    for (const m of ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro', 'gemini-pro', 'gemini-pro-vision', 'gemini-2.0-flash']) {
      expect(isRetiredGeminiModel(m), m).toBe(true)
    }
  })

  it('reconhece a família 2.5 como em retirada (≥ 16/10/2026)', () => {
    for (const m of ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']) {
      expect(isSunsettingGeminiModel(m), m).toBe(true)
      expect(isRetiredGeminiModel(m), m).toBe(false)
    }
  })

  it('deixa passar os modelos atuais', () => {
    for (const m of ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite']) {
      expect(isRetiredGeminiModel(m), m).toBe(false)
      expect(isSunsettingGeminiModel(m), m).toBe(false)
      expect(resolveGeminiModelId(m)).toBe(m)
    }
  })

  it('NÃO troca modelo de outra modalidade — trocar imagem por texto quebraria em silêncio', () => {
    // `gemini-2.5-flash-image` (Nano Banana) casaria com o padrão da família
    // 2.5. Substituí-lo por um modelo de TEXTO devolveria prosa a quem pediu
    // uma imagem: falha invisível, pior que o 404 que o saneamento evita.
    for (const m of ['gemini-2.5-flash-image', 'imagen-4.0', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-native-audio-latest']) {
      expect(isNonTextGeminiModel(m), m).toBe(true)
      expect(resolveGeminiModelId(m), m).toBe(m)
    }
  })

  it('substitui morto e em-retirada pelo padrão, dizendo o motivo', () => {
    expect(resolveGeminiModel('gemini-1.5-pro')).toEqual({
      modelId: DEFAULT_GEMINI_TEXT_MODEL, requested: 'gemini-1.5-pro', replacedReason: 'retired',
    })
    expect(resolveGeminiModel('gemini-2.5-flash')).toEqual({
      modelId: DEFAULT_GEMINI_TEXT_MODEL, requested: 'gemini-2.5-flash', replacedReason: 'sunsetting',
    })
    expect(resolveGeminiModel('')).toEqual({
      modelId: DEFAULT_GEMINI_TEXT_MODEL, requested: '', replacedReason: 'empty',
    })
    expect(resolveGeminiModel(undefined).modelId).toBe(DEFAULT_GEMINI_TEXT_MODEL)
  })

  it('o padrão do app não pode ser um modelo morto ou em retirada', () => {
    expect(isRetiredGeminiModel(DEFAULT_GEMINI_TEXT_MODEL)).toBe(false)
    expect(isSunsettingGeminiModel(DEFAULT_GEMINI_TEXT_MODEL)).toBe(false)
  })
})

// ── 2. FIAÇÃO ────────────────────────────────────────────────────────────────

const generateContent = vi.fn(async () => ({ text: 'ok' }))
const generateContentStream = vi.fn(async () => (async function* () { yield { text: 'ok' } })())

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent, generateContentStream }
  },
}))

describe('getGeminiModel — o saneamento está LIGADO na chamada', () => {
  beforeEach(() => {
    generateContent.mockClear()
    generateContentStream.mockClear()
    vi.resetModules()
  })

  it('uma env apontando para modelo desligado NÃO chega à API', async () => {
    const { getGeminiModel } = await import('../gemini')
    // É este o cenário real: a env var de produção é quem decide o modelo, e
    // ela vive num painel que o repo não alcança. Se o saneamento não rodar
    // aqui, a migração simplesmente não acontece em produção.
    await getGeminiModel('k', 'gemini-1.5-pro').generateContent('oi')
    expect(generateContent).toHaveBeenCalledTimes(1)
    expect(generateContent.mock.calls[0][0].model).toBe(DEFAULT_GEMINI_TEXT_MODEL)
  })

  it('a família 2.5 também é substituída antes de sair', async () => {
    const { getGeminiModel } = await import('../gemini')
    await getGeminiModel('k', 'gemini-2.5-flash').generateContent('oi')
    expect(generateContent.mock.calls[0][0].model).toBe(DEFAULT_GEMINI_TEXT_MODEL)
  })

  it('o streaming passa pelo mesmo saneamento', async () => {
    const { getGeminiModel } = await import('../gemini')
    const it = getGeminiModel('k', 'gemini-2.5-flash').generateContentStream('oi')
    await it.next()
    expect(generateContentStream.mock.calls[0][0].model).toBe(DEFAULT_GEMINI_TEXT_MODEL)
  })

  it('modelo atual passa intacto — o saneamento não sequestra quem está certo', async () => {
    const { getGeminiModel } = await import('../gemini')
    await getGeminiModel('k', 'gemini-3.7-flash').generateContent('oi')
    expect(generateContent.mock.calls[0][0].model).toBe('gemini-3.7-flash')
  })

  it('mantém o thinking desligado (economia de tokens) na config enviada', async () => {
    const { getGeminiModel } = await import('../gemini')
    await getGeminiModel('k', 'gemini-1.5-pro').generateContent('oi')
    expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })
})

// ── 3. SOURCE-GUARD DE CLASSE ────────────────────────────────────────────────

/**
 * Remove comentários preservando strings. Um `String.replace(/\/\/.*$/)`
 * ingênuo corta o miolo de `'https://...'`; e um guard que casa com a própria
 * documentação que explica o padrão proibido é o segundo jeito clássico de
 * escrever guard falso (ver CLAUDE.md).
 */
function stripComments(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && next === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out += c; i++
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue }
        out += src[i]
        if (src[i] === quote) { i++; break }
        i++
      }
      continue
    }
    out += c; i++
  }
  return out
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      walk(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

describe('nenhum literal de modelo morto no código executável', () => {
  it('só o registro nomeia modelos; ninguém digita um id retirado/em retirada', () => {
    const root = path.resolve(__dirname, '../../..') // src/
    const registry = path.join(root, 'utils', 'ai', 'modelRegistry.ts')
    const offenders: string[] = []

    for (const file of walk(root)) {
      if (file === registry) continue // é o dono da lista; nomear ali é o ponto
      const code = stripComments(fs.readFileSync(file, 'utf8'))
      for (const m of code.matchAll(/['"`](gemini-[A-Za-z0-9.\-]+)['"`]/g)) {
        const id = m[1]
        if (isRetiredGeminiModel(id) || isSunsettingGeminiModel(id)) {
          offenders.push(`${path.relative(root, file)} → "${id}"`)
        }
      }
    }

    expect(offenders, `Use DEFAULT_GEMINI_TEXT_MODEL em vez de digitar o id:\n${offenders.join('\n')}`).toEqual([])
  })
})
