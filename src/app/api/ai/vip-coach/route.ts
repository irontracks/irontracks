import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, refundVipUsage } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { logInfo, logError } from '@/lib/logger'
import { safePg } from '@/utils/safePgFilter'
import { env } from '@/utils/env'
import { getGeminiModel, type GeminiModelShim } from '@/utils/ai/gemini'
import { safeGemini, handleGeminiError } from '@/utils/ai/handleGeminiError'
import { buildUserContextBlock } from '@/utils/ai/userContext'
import { encodeSseEvent } from '@/utils/ai/sse'

export const dynamic = 'force-dynamic'

const MODEL = env.gemini.modelId

const BodySchema = z
  .object({
    message: z.string().min(1).max(2000),
    mode: z.enum(['coach', 'planner', 'diagnostic']).default('coach'),
    // Streaming SSE: o client vê a resposta nascendo (time-to-first-token <1s
    // em vez de esperar a resposta inteira). false = contrato antigo, intacto.
    stream: z.boolean().optional().default(false),
  })
  .strict()

// ── Helpers to build compact context ────────────────────────────────────────

type AnyObj = Record<string, unknown>

/** Summarise workout notes into a compact string for the LLM */
function summariseWorkout(row: AnyObj): string {
  const name = String(row.name || 'Treino').trim()
  const date = String(row.date || row.created_at || '').slice(0, 10)
  const notes = row.notes && typeof row.notes === 'object' ? (row.notes as AnyObj) : null
  if (!notes) return `${date} — ${name} (sem dados)`

  const exercises = Array.isArray(notes.exercises) ? (notes.exercises as AnyObj[]) : []
  const exList = exercises.slice(0, 8).map((ex) => {
    const exName = String(ex.name || '').trim()
    const sets = Array.isArray(ex.sets) ? (ex.sets as AnyObj[]) : []
    const setsInfo = sets.map(s => {
      const w = Number(s.weight || 0)
      const r = Number(s.reps || 0)
      return w > 0 ? `${w}kg×${r}` : `${r}rep`
    }).join(', ')
    return `  • ${exName}: ${setsInfo}`
  }).join('\n')

  const duration = notes.durationMinutes || notes.duration
  const volume = notes.totalVolume || notes.volume
  const parts: string[] = [`${date} — ${name}`]
  if (duration) parts.push(`Duração: ${duration}min`)
  if (volume) parts.push(`Volume: ${Math.round(Number(volume))}kg`)
  if (exList) parts.push(`Exercícios:\n${exList}`)
  return parts.join(' | ')
}

/** Summarise assessment into compact context */
function summariseAssessment(row: AnyObj): string {
  const date = String(row.assessment_date || row.created_at || '').slice(0, 10)
  const parts: string[] = [`Data: ${date}`]
  const add = (label: string, key: string, unit = '') => {
    const v = Number(row[key] || 0)
    if (v > 0) parts.push(`${label}: ${v}${unit}`)
  }
  add('Peso', 'weight', 'kg')
  add('Altura', 'height', 'cm')
  add('BF%', 'body_fat_percentage', '%')
  add('IMC', 'bmi')
  add('TMB', 'bmr', 'kcal')
  add('Massa magra', 'lean_mass', 'kg')
  add('Massa gorda', 'fat_mass', 'kg')
  add('Cintura', 'waist_circ', 'cm')
  add('Quadril', 'hip_circ', 'cm')
  add('Braço', 'arm_circ', 'cm')
  add('Coxa', 'thigh_circ', 'cm')
  return parts.join(' | ')
}

/**
 * Extração de treino estruturado da resposta (best-effort, 2ª chamada rápida).
 * Compartilhada entre o caminho JSON e o streaming — era inline e duplicaria.
 */
async function extractWorkout(model: GeminiModelShim, answer: string): Promise<Record<string, unknown> | null> {
  const lowerAnswer = answer.toLowerCase()
  const signals = [
    lowerAnswer.includes('exercício') || lowerAnswer.includes('exercicio') || lowerAnswer.includes('exercícios'),
    lowerAnswer.includes('série') || lowerAnswer.includes('series') || lowerAnswer.includes('séries'),
    lowerAnswer.includes('rep') || lowerAnswer.includes('repetições') || lowerAnswer.includes('repetiç'),
    /\d+\s*x\s*\d+/.test(lowerAnswer),
    lowerAnswer.includes('descanso') || lowerAnswer.includes('intervalo'),
    lowerAnswer.includes('treino de') || lowerAnswer.includes('treino para'),
    lowerAnswer.includes('supino') || lowerAnswer.includes('agachamento') || lowerAnswer.includes('rosca') || lowerAnswer.includes('remada') || lowerAnswer.includes('puxada') || lowerAnswer.includes('leg press'),
  ]
  const signalCount = signals.filter(Boolean).length
  const shouldExtract = signalCount >= 2 || (answer.length > 300 && signalCount >= 1)
  if (!shouldExtract) return null

  try {
    const extractPrompt = [
      'Dado o texto abaixo, extraia o treino como JSON.',
      'Responda APENAS com o JSON, sem explicação, sem markdown, sem blocos de código.',
      'Formato obrigatório:',
      '{"title":"Nome do Treino","exercises":[{"name":"Supino Reto","sets":4,"reps":"8-12","rest_time":60,"method":"Normal","notes":""}]}',
      'Se não houver treino estruturado no texto, responda apenas: null',
      '',
      'Texto:',
      answer,
    ].join('\n')
    const extractGemini = await safeGemini('vip-coach:extract', () =>
      model.generateContent([{ text: extractPrompt }] as Parameters<typeof model.generateContent>[0]),
    )
    if ('errorResponse' in extractGemini) {
      // Best-effort — falhou, devolve a resposta principal sem treino.
      logError('api:ai:vip-coach', 'extract step failed; skipping workout extraction')
      return null
    }
    const jsonStr = String((await extractGemini.value?.response?.text()) || '').trim()
    if (jsonStr && jsonStr !== 'null' && jsonStr !== '{}') {
      const cleaned = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').replace(/^\s*json\s*/i, '').trim()
      const parsed = JSON.parse(cleaned)
      if (parsed?.title && Array.isArray(parsed?.exercises) && parsed.exercises.length > 0) {
        logInfo('api:ai:vip-coach', 'Workout extracted', { title: parsed.title, exercises: parsed.exercises.length })
        return parsed
      }
    }
  } catch (extractErr) {
    logError('api:ai:vip-coach', extractErr)
  }
  return null
}

// ── Main handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Reembolso da cota: consumimos no gate (meter) e, se NÃO entregarmos resposta (limite,
  // falha do Gemini, config ausente), devolvemos no finally. Assim o usuário só é cobrado
  // por mensagens que recebeu — sem reabrir o TOCTOU (o gate segue atômico e bloqueia o
  // excedente antes de chamar o modelo). Free tem só 5 msg/semana: perder uma por falha
  // transitória do Gemini seria 20% da cota.
  let delivered = false
  let refund: (() => Promise<void>) | null = null
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:vip-coach:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { message, mode, stream } = parsedBody.data!

    // Cota consumida ATÔMICA aqui (meter), depois do parse e antes do Gemini: fecha a
    // janela TOCTOU do antigo check-then-act (que deixava requests paralelos furarem o
    // limite e queimarem cota de IA paga). Um corpo malformado é rejeitado acima, sem
    // consumir cota. Consome uma única vez — não há incremento pós-resposta.
    const access = await checkVipFeatureAccess(supabase, userId, 'chat_daily', { meter: true })
    // A partir daqui a cota já foi consumida; o finally reembolsa se não entregarmos.
    refund = () => refundVipUsage(supabase, userId, 'chat')
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: 'limit_reached', upgradeRequired: true, message: 'Limite de mensagens atingido. Faça upgrade para continuar.' },
        { status: 403 },
      )
    }

    const apiKey = env.gemini.apiKey
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'API de IA não configurada. Configure GOOGLE_GENERATIVE_AI_API_KEY na Vercel e faça Redeploy.' },
        { status: 500 },
      )
    }

    // ── Fetch user context in parallel ────────────────────────────────────
    const [workoutsRes, assessmentRes, profileRes] = await Promise.all([
      supabase
        .from('workouts')
        .select('name, date, created_at, notes')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(5),
      supabase
        .from('assessments')
        .select('assessment_date, created_at, weight, height, age, gender, body_fat_percentage, bmi, bmr, lean_mass, fat_mass, waist_circ, hip_circ, arm_circ, thigh_circ')
        .or(`student_id.eq.${safePg(userId)},user_id.eq.${safePg(userId)}`)
        .order('assessment_date', { ascending: false })
        .limit(1),
      supabase
        .from('profiles')
        .select('display_name, email, role')
        .eq('id', userId)
        .maybeSingle(),
    ])

    // ── Build compact context string ──────────────────────────────────────
    const contextParts: string[] = []

    // Profile
    const profile = profileRes.data as AnyObj | null
    if (profile) {
      const name = String(profile.display_name || '').trim()
      if (name) contextParts.push(`Nome do usuário: ${name}`)
    }

    // O PERFIL não é montado aqui: `buildUserContextBlock(['profile', …])` mais
    // abaixo já traz sexo, antropometria, objetivo, nível de TREINO e unidade, pelo
    // leitor único. O bloco que existia aqui mandava o sexo uma SEGUNDA vez e — pior
    // — rotulava `uiMode` (modo da INTERFACE: beginner/intermediate/advanced) como
    // "Nível", competindo com o `fitnessLevel` do outro bloco. Os dois enums têm os
    // mesmos valores e divergem em 23 das 37 contas: o coach recebia dois "Nível"
    // contraditórios e nada dizia qual era o de treino.

    // Assessment
    const assessments = Array.isArray(assessmentRes.data) ? assessmentRes.data : []
    if (assessments.length > 0) {
      contextParts.push(`\nÚltima avaliação física:\n${summariseAssessment(assessments[0] as AnyObj)}`)
    }

    // Workouts
    const workouts = Array.isArray(workoutsRes.data) ? workoutsRes.data : []
    if (workouts.length > 0) {
      const summaries = workouts.map((w) => summariseWorkout(w as AnyObj))
      contextParts.push(`\nÚltimos ${workouts.length} treinos:\n${summaries.join('\n\n')}`)

      // Calculate streak
      let streak = 0
      const now = new Date()
      const dates = workouts
        .map((w) => {
          const d = new Date(String((w as AnyObj).date || (w as AnyObj).created_at || ''))
          return Number.isNaN(d.getTime()) ? null : d
        })
        .filter(Boolean) as Date[]

      if (dates.length > 0) {
        const dayMs = 86400000
        let checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        for (const d of dates) {
          const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
          const diff = Math.round((checkDate.getTime() - dDay.getTime()) / dayMs)
          if (diff <= 1) {
            streak++
            checkDate = dDay
          } else {
            break
          }
        }
      }
      if (streak > 0) contextParts.push(`Streak atual: ${streak} dia${streak > 1 ? 's' : ''} consecutivo${streak > 1 ? 's' : ''}`)
    }

    const contextStr = contextParts.length > 0
      ? contextParts.join('\n')
      : 'Nenhum dado disponível ainda — o usuário é novo.'

    const dataSources: string[] = []
    if (workouts.length) dataSources.push(`${workouts.length} treinos`)
    if (assessments.length) dataSources.push('avaliação física')
    if (profile) dataSources.push('perfil')

    // ── Build prompt ──────────────────────────────────────────────────────
    const system = [
      'Você é o Iron Coach, o coach de musculação premium do app IronTracks.',
      'Responda SEMPRE em pt-BR, com tom direto, motivacional e prático.',
      'Você tem acesso completo aos dados do usuário abaixo. USE esses dados para dar respostas personalizadas.',
      'Cite exercícios, cargas e métricas do usuário quando relevante.',
      'Evite conselhos médicos. Se houver dor/lesão, recomende procurar profissional.',
      'Não invente números — use apenas dados reais do contexto fornecido.',
      'Formate sua resposta de forma clara, usando listas quando apropriado.',
    ].join('\n')

    const modeHint =
      mode === 'planner'
        ? 'O usuário está no modo PLANEJADOR. Foque em periodização, montagem de treinos, progressão e organização semanal. Use os dados para sugerir baseado no histórico real.'
        : mode === 'diagnostic'
          ? 'O usuário está no modo DIAGNÓSTICO. Analise os dados com profundidade, identifique pontos fracos, padrões de volume crescente/decrescente, e sugira correções baseadas nos treinos reais.'
          : 'O usuário está no modo COACH GERAL. Ajude com treino, progressão, recuperação, dúvidas gerais. Personalize as respostas com base nos dados disponíveis.'

    const userCtx = await buildUserContextBlock(supabase, userId, ['profile', 'assessment', 'training', 'nutrition', 'labs'])

    const prompt = [
      ...(userCtx ? [userCtx, ''] : []),
      system,
      'Personalize pelo CONTEXTO DO USUÁRIO acima (objetivo, avaliação, exames, treino, nutrição).',
      '', modeHint, '', '═══ DADOS DO USUÁRIO ═══', contextStr, '', '═══ MENSAGEM DO USUÁRIO ═══', message,
    ].join('\n')

    const model = getGeminiModel(apiKey, MODEL)

    // ── Caminho STREAMING (SSE) ───────────────────────────────────────────
    if (stream) {
      // O ciclo entrega/reembolso passa a viver DENTRO do stream: o handler
      // retorna a Response já, mas a geração continua no start() abaixo.
      // Se nada foi emitido e deu erro → reembolsa lá; o finally externo não
      // pode decidir (delivered=true aqui evita reembolso duplo).
      delivered = true
      const refundFn = refund
      const encoder = new TextEncoder()
      const sseBody = new ReadableStream<Uint8Array>({
        async start(controller) {
          let sentAny = false
          try {
            let full = ''
            for await (const piece of model.generateContentStream([{ text: prompt }] as Parameters<typeof model.generateContent>[0])) {
              full += piece
              sentAny = true
              controller.enqueue(encoder.encode(encodeSseEvent({ type: 'chunk', text: piece })))
            }
            const answer = full.trim()
            if (!answer) throw new Error('empty_ai_answer')
            const workout = await extractWorkout(model, answer)
            controller.enqueue(encoder.encode(encodeSseEvent({ type: 'done', dataUsed: dataSources, followUps: [], actions: [], workout })))
          } catch (e) {
            logError('api:ai:vip-coach', e)
            if (!sentAny && refundFn) {
              try { await refundFn() } catch { /* refund é best-effort, já logado dentro */ }
            }
            try {
              controller.enqueue(encoder.encode(encodeSseEvent({ type: 'error', error: 'Falha ao consultar a IA.' })))
            } catch { /* stream pode já ter fechado */ }
          } finally {
            try { controller.close() } catch { /* já fechado */ }
          }
        },
      })
      return new Response(sseBody, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      })
    }

    const geminiResult = await safeGemini('vip-coach', () =>
      model.generateContent([{ text: prompt }] as Parameters<typeof model.generateContent>[0]),
    )
    if ('errorResponse' in geminiResult) return geminiResult.errorResponse
    const result = geminiResult.value
    const answer = String((await result?.response?.text()) || '').trim()
    if (!answer) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    // ── Server-side workout extraction (compartilhada com o streaming) ────
    const workout = await extractWorkout(model, answer)

    delivered = true
    return NextResponse.json({ ok: true, answer, dataUsed: dataSources, followUps: [], actions: [], workout })
  } catch (e: unknown) {
    return handleGeminiError('vip-coach', e)
  } finally {
    // Consumiu a cota mas não entregou resposta (limite, falha do Gemini, config) →
    // reembolsa. Best-effort: falha no reembolso é logada dentro de refundVipUsage.
    if (refund && !delivered) await refund()
  }
}
