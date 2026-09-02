/**
 * setMediaAnalysis — a IA responde sobre a foto/vídeo anexado à série.
 *
 * Roda na FINALIZAÇÃO do treino (`api/workouts/finish` → `waitUntil`), nunca na
 * hora do upload: o aluno anexa no meio da série, com a academia ao redor, e a
 * resposta não é para agora — é para o histórico, o PDF e o professor. Cada
 * mídia passa pela cota VIP `media_analysis` (feature booleana com teto
 * diário), e o que não puder ser analisado fica `skipped` COM motivo: a linha
 * some da IA, não do histórico.
 *
 * Vídeo até `SET_MEDIA_INLINE_MAX_BYTES` vai inline (base64); acima disso vai
 * pela Files API do Gemini — inline tem teto de ~20 MB por request e um vídeo
 * de execução de 40 s no iPhone passa disso fácil.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { GoogleGenAI, createPartFromUri, type Part } from '@google/genai'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { logError, logWarn } from '@/lib/logger'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { SET_MEDIA_INLINE_MAX_BYTES } from './setMedia'

export const SET_MEDIA_NOTIFICATION_TYPE = 'set_media_analyzed'

interface MediaRow {
  id: string
  user_id: string
  workout_id: string | null
  exercise_index: number
  set_index: number
  exercise_name: string | null
  kind: 'photo' | 'video'
  bucket_id: string
  object_path: string
  mime_type: string | null
  file_size: number | null
  question: string | null
  ai_status: string
}

/** O prompt é UM só, e diz ao modelo qual é a pergunta implícita de cada tipo. */
export function buildSetMediaPrompt(row: Pick<MediaRow, 'kind' | 'exercise_name' | 'set_index' | 'question'>): string {
  const ex = String(row.exercise_name || '').trim() || 'exercício não identificado'
  const pergunta = String(row.question || '').trim()
  const contexto = row.kind === 'photo'
    ? 'O aluno FOTOGRAFOU o aparelho/máquina antes de fazer a série. A pergunta implícita é: este é o equipamento certo para o exercício, e como ajustar (banco, pino, pegada)?'
    : 'O aluno FILMOU a própria execução da série. A pergunta implícita é: a técnica está correta? Aponte o que está bom, o que corrigir (máximo 3 pontos, os mais importantes primeiro) e qualquer risco de lesão que apareça.'
  return [
    'Você é um treinador de musculação experiente, direto e brasileiro. Responda em português do Brasil.',
    `Exercício: ${ex}. Série ${row.set_index + 1}.`,
    contexto,
    pergunta ? `Observação escrita pelo aluno: "${pergunta}" — responda a ela primeiro.` : 'O aluno não escreveu pergunta; responda à pergunta implícita.',
    'Regras: máximo 120 palavras; frases curtas; sem introdução nem despedida; se a imagem/vídeo não permitir avaliar, diga o que faltou ver (ângulo, luz, enquadramento) em vez de inventar.',
  ].join('\n')
}

async function downloadObject(admin: SupabaseClient, bucket: string, path: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const { data, error } = await admin.storage.from(bucket).download(path)
  if (error || !data) return null
  const buf = new Uint8Array(await data.arrayBuffer())
  return { bytes: buf, mime: data.type || '' }
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/**
 * Monta o part da mídia. Vídeo grande sobe pela Files API e espera ficar
 * ACTIVE — o Gemini processa vídeo assincronamente e recusa `fileData` de um
 * arquivo ainda em PROCESSING.
 */
async function buildMediaPart(apiKey: string, bytes: Uint8Array, mime: string): Promise<Part> {
  if (bytes.byteLength <= SET_MEDIA_INLINE_MAX_BYTES) {
    return { inlineData: { mimeType: mime, data: bytesToBase64(bytes) } }
  }
  const ai = new GoogleGenAI({ apiKey })
  const blob = new Blob([Buffer.from(bytes)], { type: mime })
  const uploaded = await ai.files.upload({ file: blob, config: { mimeType: mime } })
  const name = String(uploaded?.name || '')
  if (!name) throw new Error('gemini_files_upload_failed')
  // Poll curto: vídeo de 30–60 s costuma ficar ACTIVE em poucos segundos.
  for (let i = 0; i < 20; i++) {
    const f = await ai.files.get({ name })
    const state = String(f?.state || '')
    if (state === 'ACTIVE') {
      const uri = String(f?.uri || '')
      if (!uri) throw new Error('gemini_file_uri_missing')
      return createPartFromUri(uri, mime)
    }
    if (state === 'FAILED') throw new Error('gemini_file_processing_failed')
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('gemini_file_processing_timeout')
}

export interface AnalyzeResult {
  analyzed: number
  skipped: number
  failed: number
}

/**
 * Analisa toda mídia PENDENTE de um treino. Idempotente por linha: uma linha só
 * é processada se ainda estiver `pending` (a atualização para `analyzing` é o
 * lock — quem não conseguir mudar o status, pula).
 */
export async function analyzeSetMediaForWorkout(
  admin: SupabaseClient,
  userId: string,
  workoutId: string,
): Promise<AnalyzeResult> {
  const result: AnalyzeResult = { analyzed: 0, skipped: 0, failed: 0 }
  const uid = String(userId || '').trim()
  const wid = String(workoutId || '').trim()
  if (!uid || !wid) return result

  const { data: rows, error } = await admin
    .from('workout_set_media')
    .select('id, user_id, workout_id, exercise_index, set_index, exercise_name, kind, bucket_id, object_path, mime_type, file_size, question, ai_status')
    .eq('user_id', uid)
    .eq('workout_id', wid)
    .eq('ai_status', 'pending')
    .order('exercise_index', { ascending: true })
    .order('set_index', { ascending: true })
    .limit(20)
  if (error) { logError('setMedia:analyze:list', error); return result }
  const list = (Array.isArray(rows) ? rows : []) as MediaRow[]
  if (!list.length) return result

  let apiKey = ''
  try { apiKey = env.gemini.apiKey } catch (e) { logError('setMedia:analyze:no-key', e) }

  for (const row of list) {
    // Lock por linha.
    const { data: locked } = await admin
      .from('workout_set_media')
      .update({ ai_status: 'analyzing' })
      .eq('id', row.id)
      .eq('ai_status', 'pending')
      .select('id')
      .maybeSingle()
    if (!locked?.id) continue

    const skip = async (reason: string) => {
      result.skipped += 1
      await admin.from('workout_set_media').update({ ai_status: 'skipped', ai_error: reason }).eq('id', row.id)
    }
    const fail = async (reason: string, e?: unknown) => {
      result.failed += 1
      if (e) logError('setMedia:analyze:item', e, { mediaId: row.id, reason })
      await admin.from('workout_set_media').update({ ai_status: 'failed', ai_error: reason }).eq('id', row.id)
    }

    try {
      if (!apiKey) { await skip('gemini_key_missing'); continue }
      // Cota VIP por mídia — cobra só o que de fato vai ao modelo.
      const access = await checkVipFeatureAccess(admin, uid, 'media_analysis', { meter: true })
      if (!access.allowed) { await skip(access.tier === 'free' ? 'vip_required' : 'daily_quota_exceeded'); continue }

      const obj = await downloadObject(admin, row.bucket_id, row.object_path)
      if (!obj) { await fail('storage_download_failed'); continue }
      const mime = String(row.mime_type || obj.mime || (row.kind === 'photo' ? 'image/jpeg' : 'video/mp4'))
      const mediaPart = await buildMediaPart(apiKey, obj.bytes, mime)
      const model = getGeminiModel(apiKey, env.gemini.modelId, { temperature: 0.3, maxOutputTokens: 400 })
      const gen = await safeGemini('set-media-analyze', () => model.generateContent([{ text: buildSetMediaPrompt(row) }, mediaPart]))
      if ('errorResponse' in gen) { await fail('gemini_error'); continue }
      const text = String(gen.value?.response?.text?.() || '').trim()
      if (!text) { await fail('empty_answer'); continue }
      await admin.from('workout_set_media').update({
        ai_status: 'analyzed',
        ai_answer: text.slice(0, 2000),
        ai_model: env.gemini.modelId,
        ai_error: null,
        analyzed_at: new Date().toISOString(),
      }).eq('id', row.id)
      result.analyzed += 1
    } catch (e) {
      await fail(e instanceof Error ? e.message.slice(0, 200) : 'unknown', e)
    }
  }

  // Uma notificação por treino, não por mídia — e só quando houve resposta.
  if (result.analyzed > 0) {
    try {
      const n = result.analyzed
      await insertNotifications([{
        user_id: uid,
        type: SET_MEDIA_NOTIFICATION_TYPE,
        title: n === 1 ? 'A IA analisou sua foto/vídeo' : `A IA analisou ${n} fotos/vídeos`,
        message: 'Abra o treino no histórico para ver a resposta em cada série.',
        metadata: { workoutId: wid, analyzed: n, skipped: result.skipped, failed: result.failed },
      }])
    } catch (e) { logWarn('setMedia:analyze', 'notificação falhou', e) }
  }
  return result
}
