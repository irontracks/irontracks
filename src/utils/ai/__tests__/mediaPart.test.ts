import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Guards do `buildGeminiMediaPart` — a peça que sabe mandar vídeo GRANDE ao
 * Gemini.
 *
 * O que precisa ficar travado, porque cada um já é uma falha SILENCIOSA:
 *  1. abaixo do teto vai inline e NÃO toca na rede (subir tudo pela Files API
 *     custaria duas idas à rede em toda foto);
 *  2. acima do teto vai pela Files API — com o teto PADRÃO, não só com o
 *     injetado pelo teste (senão o guard passa verde com o default errado);
 *  3. **espera ficar ACTIVE**. Sem o poll, o `fileData` de um arquivo em
 *     PROCESSING vai ao modelo e a resposta é sobre um vídeo que o Gemini
 *     ainda não leu — parece "a IA falou besteira", não parece bug;
 *  4. MIME em branco lança ANTES de qualquer rede, em vez de mandar
 *     `mimeType: ''` e falhar de um jeito ilegível no log.
 *
 * A rede é mockada só na classe `GoogleGenAI`; `createPartFromUri` é o REAL,
 * senão o teste validaria o formato do próprio mock.
 */

const upload = vi.hoisted(() => vi.fn())
const filesGet = vi.hoisted(() => vi.fn())

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>()
  return {
    ...actual,
    GoogleGenAI: class {
      files = { upload, get: filesGet }
    },
  }
})

import {
  buildGeminiMediaPart,
  GEMINI_INLINE_MAX_BYTES,
  GEMINI_MEDIA_ERRORS,
} from '../mediaPart'

const bytes = (n: number) => new Uint8Array(n)

beforeEach(() => {
  upload.mockReset()
  filesGet.mockReset()
})

describe('abaixo do teto → inline, sem ida à rede', () => {
  it('devolve inlineData com o base64 dos bytes e o mime recebido', async () => {
    const part = await buildGeminiMediaPart('k', new Uint8Array([1, 2, 3]), 'image/jpeg')
    expect(part).toEqual({ inlineData: { mimeType: 'image/jpeg', data: Buffer.from([1, 2, 3]).toString('base64') } })
    expect(upload).not.toHaveBeenCalled()
    expect(filesGet).not.toHaveBeenCalled()
  })

  it('aceita ArrayBuffer também (o que vem de um download costuma ser isso)', async () => {
    const part = await buildGeminiMediaPart('k', new Uint8Array([9]).buffer, 'video/mp4')
    expect(part).toEqual({ inlineData: { mimeType: 'video/mp4', data: Buffer.from([9]).toString('base64') } })
  })

  it('o teto é INCLUSIVO: exatamente no limite ainda é inline, um byte acima não', async () => {
    upload.mockResolvedValue({ name: 'files/x' })
    filesGet.mockResolvedValue({ state: 'ACTIVE', uri: 'https://g/x' })

    const noLimite = await buildGeminiMediaPart('k', bytes(4), 'video/mp4', { inlineMaxBytes: 4 })
    expect(noLimite).toHaveProperty('inlineData')
    expect(upload).not.toHaveBeenCalled()

    const acima = await buildGeminiMediaPart('k', bytes(5), 'video/mp4', { inlineMaxBytes: 4 })
    expect(acima).toEqual({ fileData: { fileUri: 'https://g/x', mimeType: 'video/mp4' } })
    expect(upload).toHaveBeenCalledTimes(1)
  })
})

describe('acima do teto → Files API', () => {
  it('com o teto PADRÃO (15 MiB), o vídeo grande sobe em vez de ir inline', async () => {
    upload.mockResolvedValue({ name: 'files/abc' })
    filesGet.mockResolvedValue({ state: 'ACTIVE', uri: 'https://generativelanguage/files/abc' })

    const part = await buildGeminiMediaPart('k', bytes(GEMINI_INLINE_MAX_BYTES + 1), 'video/quicktime')

    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0][0].config).toEqual({ mimeType: 'video/quicktime' })
    expect(part).toEqual({ fileData: { fileUri: 'https://generativelanguage/files/abc', mimeType: 'video/quicktime' } })
  })

  it('ESPERA ficar ACTIVE — arquivo em PROCESSING não vira part', async () => {
    upload.mockResolvedValue({ name: 'files/abc' })
    filesGet
      .mockResolvedValueOnce({ state: 'PROCESSING' })
      .mockResolvedValueOnce({ state: 'PROCESSING' })
      .mockResolvedValueOnce({ state: 'ACTIVE', uri: 'https://g/pronto' })

    const part = await buildGeminiMediaPart('k', bytes(9), 'video/mp4', { inlineMaxBytes: 4, pollIntervalMs: 0 })

    expect(filesGet).toHaveBeenCalledTimes(3)
    expect(part).toEqual({ fileData: { fileUri: 'https://g/pronto', mimeType: 'video/mp4' } })
  })

  it('FAILED e estouro de tentativas lançam código próprio, em vez de devolver part torto', async () => {
    upload.mockResolvedValue({ name: 'files/abc' })

    filesGet.mockResolvedValue({ state: 'FAILED' })
    await expect(buildGeminiMediaPart('k', bytes(9), 'video/mp4', { inlineMaxBytes: 4, pollIntervalMs: 0 }))
      .rejects.toThrow(GEMINI_MEDIA_ERRORS.processingFailed)

    filesGet.mockClear()
    filesGet.mockResolvedValue({ state: 'PROCESSING' })
    await expect(buildGeminiMediaPart('k', bytes(9), 'video/mp4', { inlineMaxBytes: 4, pollIntervalMs: 0, pollAttempts: 3 }))
      .rejects.toThrow(GEMINI_MEDIA_ERRORS.processingTimeout)
    expect(filesGet).toHaveBeenCalledTimes(3)
  })

  it('upload sem nome e ACTIVE sem uri não passam batido', async () => {
    upload.mockResolvedValue({})
    await expect(buildGeminiMediaPart('k', bytes(9), 'video/mp4', { inlineMaxBytes: 4, pollIntervalMs: 0 }))
      .rejects.toThrow(GEMINI_MEDIA_ERRORS.uploadFailed)

    upload.mockResolvedValue({ name: 'files/abc' })
    filesGet.mockResolvedValue({ state: 'ACTIVE', uri: '' })
    await expect(buildGeminiMediaPart('k', bytes(9), 'video/mp4', { inlineMaxBytes: 4, pollIntervalMs: 0 }))
      .rejects.toThrow(GEMINI_MEDIA_ERRORS.uriMissing)
  })
})

describe('MIME', () => {
  it('em branco (ou só espaço) lança ANTES de tocar na rede — não manda mimeType vazio', async () => {
    for (const mime of ['', '   ', undefined as unknown as string]) {
      await expect(buildGeminiMediaPart('k', bytes(9), mime, { inlineMaxBytes: 4 }))
        .rejects.toThrow(GEMINI_MEDIA_ERRORS.mimeMissing)
    }
    expect(upload).not.toHaveBeenCalled()
  })

  it('mime presente mas não reconhecido passa INTACTO — quem julga o tipo é o Gemini, não este módulo', async () => {
    const part = await buildGeminiMediaPart('k', new Uint8Array([1]), 'application/octet-stream')
    expect(part).toEqual({ inlineData: { mimeType: 'application/octet-stream', data: Buffer.from([1]).toString('base64') } })

    upload.mockResolvedValue({ name: 'files/abc' })
    filesGet.mockResolvedValue({ state: 'ACTIVE', uri: 'https://g/x' })
    const grande = await buildGeminiMediaPart('k', bytes(9), 'application/pdf', { inlineMaxBytes: 4, pollIntervalMs: 0 })
    expect(grande).toEqual({ fileData: { fileUri: 'https://g/x', mimeType: 'application/pdf' } })
  })
})
