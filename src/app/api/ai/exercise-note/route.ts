import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { exerciseNoteGenerationConfig } from '@/utils/ai/routeContracts'
import { safeGemini, handleGeminiError } from '@/utils/ai/handleGeminiError'
import { MAX_NOTA_CHARS } from '@/lib/workout/exerciseNote'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/ai/exercise-note
 *
 * Gera a observação TÉCNICA de um exercício — usada quando o
 * usuário troca o exercício no treino ativo e a nota antiga
 * passaria a descrever o aparelho errado.
 *
 * Medido em 03/09/2026: 322 das 384 observações em produção
 * são técnica do aparelho ("pés altos na plataforma",
 * "alinhe o joelho ao eixo da máquina"). Mantê-las depois da
 * troca é instruir sobre uma máquina que não está mais ali.
 *
 * Diferente de `exercise-swap`, aqui NÃO existe fonte
 * determinística para consultar antes: `exercise_library` tem
 * músculo, equipamento, dificuldade e vídeo — e nenhuma coluna
 * de técnica. A IA não é atalho, é a única fonte. O que a
 * biblioteca oferece é CONTEXTO para o prompt.
 * ────────────────────────────────────────────────────────── */

const ZodBody = z.object({
  exerciseName: z.string().min(1).max(120),
}).strip()

const MODEL_ID = env.gemini.modelId

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()
    const supabase = auth.supabase

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:exercise-note:${userId}:${ip}`, 20, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      )
    }

    const parsed = await parseJsonBody(req, ZodBody)
    if (parsed.response) return parsed.response
    const nome = (parsed.data as z.infer<typeof ZodBody>).exerciseName.trim()

    const apiKey = env.gemini.apiKey
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_unavailable' }, { status: 503 })

    // Contexto da biblioteca quando o nome casa — músculo e equipamento fazem a
    // nota falar do aparelho certo em vez de dar conselho genérico. Falhar aqui
    // NÃO derruba a nota: o nome sozinho já produz observação boa (medido).
    let contexto = ''
    try {
      const { data } = await supabase
        .from('exercise_library')
        .select('display_name_pt, primary_muscle, equipment')
        .ilike('display_name_pt', nome)
        .limit(1)
        .maybeSingle()
      if (data) {
        const eq = Array.isArray(data.equipment) ? data.equipment.join(', ') : ''
        contexto = [
          data.primary_muscle ? `Músculo principal: ${data.primary_muscle}` : '',
          eq ? `Equipamento: ${eq}` : '',
        ].filter(Boolean).join('\n')
      }
    } catch { /* biblioteca é enriquecimento, não requisito */ }

    const prompt = [
      'Você escreve a observação técnica de UM exercício de musculação para um app brasileiro.',
      '',
      `Exercício: "${nome}"`,
      contexto,
      '',
      `Escreva UMA observação de execução, 1 a 2 frases, no máximo ${MAX_NOTA_CHARS} caracteres.`,
      'Foque no que o aluno erra na prática: postura, amplitude, ritmo ou o que sentir.',
      'Português do Brasil, tom direto, sem saudação, sem markdown, sem repetir o nome do exercício.',
      'Se o nome não descrever um exercício reconhecível, devolva note como string vazia.',
      '',
      'Responda em JSON: {"note": string}',
    ].filter(Boolean).join('\n')

    const model = getGeminiModel(apiKey, MODEL_ID, exerciseNoteGenerationConfig())
    const geminiResult = await safeGemini('exercise-note', () => model.generateContent(prompt))
    if ('errorResponse' in geminiResult) return geminiResult.errorResponse

    const text = (await geminiResult.value?.response?.text()) || ''
    const json = parseJsonWithSchema(text, z.object({ note: z.string() }).strip())
    // Teto aplicado DEPOIS do parse: structured output não garante maxLength —
    // é a doutrina já registrada no CLAUDE.md (o normalizador é o juiz).
    const note = String(json?.note ?? '').trim().slice(0, MAX_NOTA_CHARS)
    if (!note) return NextResponse.json({ ok: false, error: 'sem_nota' }, { status: 404 })

    return NextResponse.json({ ok: true, note })
  } catch (e: unknown) {
    return handleGeminiError('exercise-note', e)
  }
}
