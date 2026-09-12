/**
 * mediaPart — transforma bytes de imagem/vídeo no `Part` que o Gemini aceita.
 *
 * Por que existe como módulo próprio: este é o ÚNICO lugar do repo que sabe
 * resolver vídeo GRANDE no Gemini, e a regra não tem nada a ver com treino,
 * série ou storage — é contrato do modelo. Nasceu dentro da análise de mídia
 * por série (`lib/workout/setMediaAnalysis.ts`, set/2026) e saiu de lá para
 * sobreviver àquela feature: quem for mandar foto/vídeo ao Gemini (chat de IA
 * por exercício, avaliação por foto, o que vier) chama daqui em vez de
 * reimplementar o caminho difícil.
 *
 * ⚠️ A armadilha do vídeo grande, que é o motivo desta função:
 *
 *  - `inlineData` (base64 no corpo do request) tem TETO — o request inteiro
 *    fica em torno de 20 MB, e um vídeo de execução de 40 s no iPhone passa
 *    disso fácil. Acima de `GEMINI_INLINE_MAX_BYTES` o caminho é a Files API.
 *  - **A Files API processa vídeo de forma ASSÍNCRONA.** O upload retorna na
 *    hora com o arquivo em `PROCESSING`, e mandar esse `fileData` para o
 *    modelo sem esperar faz o Gemini responder sobre um arquivo que ainda não
 *    foi processado — ou recusar. Por isso existe o poll até `ACTIVE`: sem
 *    ele a falha é silenciosa e parece "a IA respondeu besteira", não "o
 *    arquivo não estava pronto".
 *  - Poll com teto (`GEMINI_FILE_POLL_ATTEMPTS`): vídeo de 30–60 s costuma
 *    ficar ACTIVE em poucos segundos, e esperar para sempre prenderia a rota.
 *
 * MIME é obrigatório e não é adivinhado aqui: quem chama sabe o que subiu
 * (o registro do banco, o `File` do usuário) e tem fallback melhor que
 * qualquer palpite deste módulo. MIME em branco lança em vez de seguir — o
 * Gemini com `mimeType` vazio falha de um jeito que não se lê no log.
 */

import { GoogleGenAI, createPartFromUri, type Part } from '@google/genai'

/** Acima disto o arquivo vai pela Files API, não inline (o request tem teto de ~20 MB). */
export const GEMINI_INLINE_MAX_BYTES = 15 * 1024 * 1024

/** Tentativas de poll até o arquivo ficar ACTIVE (≈30 s no total, com o intervalo padrão). */
export const GEMINI_FILE_POLL_ATTEMPTS = 20

/** Intervalo entre as tentativas de poll, em ms. */
export const GEMINI_FILE_POLL_INTERVAL_MS = 1500

export interface GeminiMediaPartOptions {
  /** Teto do inline. Só passe se a feature tiver régua própria; o padrão é o do modelo. */
  inlineMaxBytes?: number
  /** Tentativas de poll da Files API. */
  pollAttempts?: number
  /** Intervalo entre polls, em ms. */
  pollIntervalMs?: number
}

/** Códigos lançados por este módulo — o chamador grava/loga esses valores. */
export const GEMINI_MEDIA_ERRORS = {
  mimeMissing: 'gemini_media_mime_missing',
  uploadFailed: 'gemini_files_upload_failed',
  uriMissing: 'gemini_file_uri_missing',
  processingFailed: 'gemini_file_processing_failed',
  processingTimeout: 'gemini_file_processing_timeout',
} as const

function toBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input)
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Monta o `Part` da mídia para o Gemini.
 *
 * Abaixo do teto vai inline (base64, uma ida à rede só). Acima, sobe pela
 * Files API e ESPERA ficar ACTIVE antes de devolver o `fileData` — ver a
 * armadilha no cabeçalho do módulo.
 *
 * Lança `Error` com um dos códigos de `GEMINI_MEDIA_ERRORS`.
 */
export async function buildGeminiMediaPart(
  apiKey: string,
  input: Uint8Array | ArrayBuffer,
  mimeType: string,
  options: GeminiMediaPartOptions = {},
): Promise<Part> {
  const mime = String(mimeType || '').trim()
  if (!mime) throw new Error(GEMINI_MEDIA_ERRORS.mimeMissing)

  const bytes = toBytes(input)
  const inlineMax = options.inlineMaxBytes ?? GEMINI_INLINE_MAX_BYTES
  if (bytes.byteLength <= inlineMax) {
    return { inlineData: { mimeType: mime, data: bytesToBase64(bytes) } }
  }

  const attempts = options.pollAttempts ?? GEMINI_FILE_POLL_ATTEMPTS
  const interval = options.pollIntervalMs ?? GEMINI_FILE_POLL_INTERVAL_MS

  const ai = new GoogleGenAI({ apiKey })
  const blob = new Blob([Buffer.from(bytes)], { type: mime })
  const uploaded = await ai.files.upload({ file: blob, config: { mimeType: mime } })
  const name = String(uploaded?.name || '')
  if (!name) throw new Error(GEMINI_MEDIA_ERRORS.uploadFailed)

  for (let i = 0; i < attempts; i++) {
    const f = await ai.files.get({ name })
    const state = String(f?.state || '')
    if (state === 'ACTIVE') {
      const uri = String(f?.uri || '')
      if (!uri) throw new Error(GEMINI_MEDIA_ERRORS.uriMissing)
      return createPartFromUri(uri, mime)
    }
    if (state === 'FAILED') throw new Error(GEMINI_MEDIA_ERRORS.processingFailed)
    await sleep(interval)
  }
  throw new Error(GEMINI_MEDIA_ERRORS.processingTimeout)
}
