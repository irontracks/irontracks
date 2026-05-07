/**
 * @module conversation
 * Gemini-powered WhatsApp reactivation conversation handler.
 *
 * Each conversation is stored as an array of {role, text} turns in
 * whatsapp_conversations.context. Gemini receives the full history on every
 * reply so context is preserved across messages.
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import { env } from '@/utils/env'
import { createAdminClient } from '@/utils/supabase/admin'
import { logError } from '@/lib/logger'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConversationRole = 'user' | 'model'

export interface ConversationTurn {
  role: ConversationRole
  text: string
}

export interface UserWorkoutContext {
  firstName: string
  daysSinceLastWorkout: number
  totalWorkouts: number
}

export interface GenerateReplyResult {
  message: string
  /** True when Gemini signals the conversation should be closed */
  shouldClose: boolean
}

// ── User context ──────────────────────────────────────────────────────────────

export async function fetchUserContext(userId: string): Promise<UserWorkoutContext> {
  try {
    const admin = createAdminClient()
    const [profileRes, workoutsRes] = await Promise.all([
      admin.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
      admin
        .from('workouts')
        .select('date')
        .eq('user_id', userId)
        .eq('is_template', false)
        .order('date', { ascending: false })
        .limit(200),
    ])

    const rawName = String(profileRes.data?.display_name ?? 'amigo').trim()
    const firstName = rawName.split(' ')[0] || 'amigo'
    const workouts = Array.isArray(workoutsRes.data) ? workoutsRes.data : []
    const lastDate = workouts[0]?.date ? new Date(String(workouts[0].date)) : null
    const daysSince = lastDate
      ? Math.floor((Date.now() - lastDate.getTime()) / (86_400 * 1000))
      : 999

    return { firstName, daysSinceLastWorkout: daysSince, totalWorkouts: workouts.length }
  } catch (e) {
    logError('conversation.fetchUserContext', e)
    return { firstName: 'amigo', daysSinceLastWorkout: 0, totalWorkouts: 0 }
  }
}

// ── Initial message ───────────────────────────────────────────────────────────

export function buildInitialMessage(ctx: UserWorkoutContext): string {
  const days = ctx.daysSinceLastWorkout
  const timeLabel = days === 1 ? '1 dia' : `${days} dias`
  return (
    `Oi ${ctx.firstName}! 👋 Aqui é o Iron, coach do IronTracks.\n\n` +
    `Notei que faz ${timeLabel} que você não aparece por aqui para treinar. ` +
    `Tá tudo bem? 🤔\n\n` +
    `Às vezes a vida complica — qualquer motivo é válido. Queria só dar um oi e saber como você tá 💪`
  )
}

// ── Gemini reply generation ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é o Iron, coach virtual do IronTracks, app de treino fitness brasileiro.

Seu objetivo nessa conversa:
1. Entender por que o usuário parou de treinar
2. Ser empático e não julgá-lo
3. Ajudá-lo a pensar em como voltar de forma leve e gradual
4. Quando demonstrar interesse, incentivá-lo a abrir o app IronTracks

Regras de comportamento:
- Tom: amigável, casual, motivacional — como um amigo que é personal trainer
- Mensagens curtas (máx 4-5 linhas por mensagem)
- Não mande mais de 1 pergunta por vez
- Use emojis com moderação (1-2 por mensagem)
- Nunca pressione o usuário nem seja insistente
- Se o usuário for frio por 2 mensagens seguidas, encerre educadamente

Sinais de encerramento — quando detectar qualquer um destes, encerre a conversa incluindo
a marca exata "ENCERRAR_CONVERSA" em algum lugar da sua resposta (junto com a mensagem final):
- Usuário pediu para não ser incomodado / opt-out
- Usuário disse que não pretende usar o app
- Usuário disse que já voltou a treinar (encerre comemorando)
- Foram mais de 8 trocas de mensagens
- Usuário foi claramente desinteressado por 2 mensagens seguidas`

export async function generateReply(
  userMessage: string,
  history: ConversationTurn[],
  userCtx: UserWorkoutContext,
): Promise<GenerateReplyResult> {
  const genAI = new GoogleGenerativeAI(env.gemini.apiKey)

  const contextBlock = [
    `Contexto do usuário:`,
    `- Nome: ${userCtx.firstName}`,
    `- Dias sem treinar: ${userCtx.daysSinceLastWorkout}`,
    `- Total de treinos registrados no app: ${userCtx.totalWorkouts}`,
  ].join('\n')

  const model = genAI.getGenerativeModel({
    model: env.gemini.fastModelId,
    systemInstruction: `${SYSTEM_PROMPT}\n\n${contextBlock}`,
  })

  // Gemini requires history to start with a 'user' turn — strip any
  // leading 'model' turns (e.g. when the cron sends the initial message
  // before the user replies for the first time).
  const firstUserIdx = history.findIndex((t) => t.role === 'user')
  const geminiHistory = firstUserIdx >= 0 ? history.slice(firstUserIdx) : []

  const chat = model.startChat({
    history: geminiHistory.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
  })

  const result = await chat.sendMessage(userMessage)
  const rawText = result.response.text().trim()

  const shouldClose = rawText.includes('ENCERRAR_CONVERSA')
  const message = rawText.replace('ENCERRAR_CONVERSA', '').trim()

  return { message, shouldClose }
}
