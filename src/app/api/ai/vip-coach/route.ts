import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { safePg } from '@/utils/safePgFilter'

export const dynamic = 'force-dynamic'

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const BodySchema = z
  .object({
    message: z.string().min(1).max(2000),
    mode: z.enum(['coach', 'planner', 'diagnostic']).default('coach'),
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

// ── Main handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
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

    const access = await checkVipFeatureAccess(supabase, userId, 'chat_daily')
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: 'limit_reached', upgradeRequired: true, message: 'Limite de mensagens atingido. Faça upgrade para continuar.' },
        { status: 403 },
      )
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { message, mode } = parsedBody.data!

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'API de IA não configurada. Configure GOOGLE_GENERATIVE_AI_API_KEY na Vercel e faça Redeploy.' },
        { status: 500 },
      )
    }

    // ── Fetch user context in parallel ────────────────────────────────────
    const [workoutsRes, assessmentRes, settingsRes, profileRes] = await Promise.all([
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
        .from('user_settings')
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle(),
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

    // Settings
    const settings = (settingsRes.data as AnyObj | null)?.preferences
    if (settings && typeof settings === 'object') {
      const s = settings as AnyObj
      const parts: string[] = []
      if (s.units) parts.push(`Unidade: ${s.units}`)
      if (s.biologicalSex) parts.push(`Sexo: ${s.biologicalSex}`)
      if (s.uiMode) parts.push(`Nível: ${s.uiMode}`)
      if (parts.length) contextParts.push(`Perfil: ${parts.join(', ')}`)
    }

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

    const prompt = [system, '', modeHint, '', '═══ DADOS DO USUÁRIO ═══', contextStr, '', '═══ MENSAGEM DO USUÁRIO ═══', message].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })
    const result = await model.generateContent([{ text: prompt }] as Parameters<typeof model.generateContent>[0])
    const answer = String((await result?.response?.text()) || '').trim()
    if (!answer) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    await incrementVipUsage(supabase, userId, 'chat')
    return NextResponse.json({ ok: true, answer, dataUsed: dataSources, followUps: [], actions: [] })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) ?? String(e) }, { status: 500 })
  }
}
