/**
 * APNs Live Activity Push (Feature 11)
 *
 * Updates an iOS Dynamic Island / Lock Screen Live Activity remotely via APNs.
 * Tokens come from the `live_activity_push_tokens` table populated by the iOS
 * plugin's pushTokenUpdates observer (see useLiveActivityPushSync.ts).
 *
 * APNs requirements for Live Activities (different from regular pushes):
 *   • apns-topic: <bundleId>.push-type.liveactivity
 *   • apns-push-type: liveactivity
 *   • aps.event: "update" | "end"
 *   • aps.timestamp: Unix seconds
 *   • aps.content-state: object matching ContentState in Swift
 *
 * The `kind` argument selects which ActivityAttributes to target:
 *   • "rest"    → RestTimerAttributes
 *   • "workout" → WorkoutLiveActivityAttributes
 *
 * ContentState shape MUST match the Swift struct exactly (camelCase keys).
 */
import * as http2 from 'http2'
import { getApnsConfig, getJwt, type ApnsConfig } from '@/lib/push/apnsJwt'
import { createAdminClient } from '@/utils/supabase/admin'
import { logInfo, logError } from '@/lib/logger'
import { env } from '@/utils/env'

export type LiveActivityKind = 'rest' | 'workout'
export type LiveActivityEvent = 'update' | 'end'

/**
 * RestTimer ContentState — keep in sync with RestTimerAttributes.ContentState in Swift.
 *  endDate         — ISO string converted to seconds-since-1970 by APNs decoder
 *  targetSeconds   — original rest duration
 *  isFinished      — countdown reached zero
 */
export interface RestTimerContentState {
  endDate: string            // ISO 8601, e.g. new Date().toISOString()
  targetSeconds: number
  isFinished: boolean
}

/**
 * Workout ContentState — keep in sync with WorkoutLiveActivityAttributes.ContentState.
 */
export interface WorkoutContentState {
  currentExerciseName: string
  currentSetIndex: number
  totalSetsForExercise: number
  totalSetsCompleted: number
  totalVolumeKg: number
}

type ContentStateForKind<K extends LiveActivityKind> =
  K extends 'rest' ? RestTimerContentState :
  K extends 'workout' ? WorkoutContentState :
  Record<string, unknown>

interface SendLiveActivityArgs<K extends LiveActivityKind> {
  /** APNs push token (lower-case hex) — usually loaded by user_id below. */
  token: string
  kind: K
  event: LiveActivityEvent
  contentState: ContentStateForKind<K>
  /** Optional dismissal date for `event: "end"` (ISO string). When omitted iOS
   *  uses the activity's current staleDate. */
  dismissalDate?: string
  /** Optional alert payload to surface a banner alongside the LA update. */
  alert?: { title: string; body: string }
}

/** Segundos entre 1970-01-01 (Unix) e 2001-01-01 (Apple reference date). */
export const APPLE_REF_EPOCH_SECONDS = 978307200

/**
 * Converte uma data (ISO string | ms epoch | s epoch) para o formato que o iOS
 * usa ao decodificar `Date` num content-state de push: `timeIntervalSinceReferenceDate`
 * = SEGUNDOS desde 2001-01-01 (estratégia padrão do Swift `.deferredToDate`).
 * Retorna null se não der pra parsear.
 */
export function dateToAppleRefSeconds(v: unknown): number | null {
  if (v == null) return null
  const ms = typeof v === 'number'
    ? (v > 1e11 ? v : v * 1000) // > ~1e11 já é ms; senão trata como segundos
    : new Date(String(v)).getTime()
  return Number.isFinite(ms) ? ms / 1000 - APPLE_REF_EPOCH_SECONDS : null
}

/**
 * Normaliza o content-state antes de enviar por push: campos de data (endDate)
 * precisam virar segundos-desde-2001, senão o iOS falha a decodificação do
 * content-state INTEIRO e descarta o update em silêncio (o bug do "card travado").
 */
export function normalizeContentStateDates(state: unknown): Record<string, unknown> {
  const out = state && typeof state === 'object' ? { ...(state as Record<string, unknown>) } : {}
  if (out.endDate != null) {
    const ref = dateToAppleRefSeconds(out.endDate)
    if (ref != null) out.endDate = ref
  }
  return out
}

async function sendOneLiveActivity<K extends LiveActivityKind>(
  args: SendLiveActivityArgs<K>,
  cfg: ApnsConfig,
  jwt: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      // ⚠️ Datas DENTRO do content-state (ex.: endDate do descanso) são decodificadas
      // pelo iOS com a estratégia PADRÃO do Swift (`.deferredToDate`) →
      // `Date(timeIntervalSinceReferenceDate:)` = segundos desde 2001-01-01, um NÚMERO.
      // Enviar ISO 8601 (ou segundos-1970) faz o content-state INTEIRO falhar a
      // decodificação e o iOS DESCARTA o update silenciosamente (APNs devolve 200):
      // o alerta chega mas a Live Activity nunca vira ("card travado"). Convertendo aqui.
      // (Os campos aps-level `timestamp`/`stale-date`/`dismissal-date` são segundos-1970,
      // tratados pelo próprio ActivityKit — esses NÃO passam por aqui.)
      const aps: Record<string, unknown> = {
        timestamp,
        event: args.event,
        'content-state': normalizeContentStateDates(args.contentState),
      }
      if (args.event === 'end' && args.dismissalDate) {
        aps['dismissal-date'] = Math.floor(new Date(args.dismissalDate).getTime() / 1000)
      }
      if (args.alert) {
        aps.alert = { title: args.alert.title, body: args.alert.body }
      }

      const payload = JSON.stringify({ aps })

      // M2: usa env.apns.production (com .trim()) igual ao push normal (apns.ts) — leitura
      // crua de process.env.APNS_PRODUCTION causava drift sandbox/prod se houvesse espaço.
      const isProduction = env.apns.production
      const host = isProduction
        ? 'https://api.push.apple.com'
        : 'https://api.sandbox.push.apple.com'

      const client = http2.connect(host)
      let settled = false
      const safeResolve = (r: { ok: boolean; error?: string }) => {
        if (settled) return
        settled = true
        try { client.close() } catch { /* ignore */ }
        resolve(r)
      }

      client.on('error', (err) => safeResolve({ ok: false, error: err.message }))

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${args.token}`,
        'authorization': `bearer ${jwt}`,
        'apns-topic': `${cfg.bundleId}.push-type.liveactivity`,
        'apns-push-type': 'liveactivity',
        'apns-priority': '10',
        // Live Activity updates are time-critical by definition (counters tick).
        // 1-hour TTL is plenty — anything older than that is obsolete.
        'apns-expiration': String(timestamp + 3600),
        'content-type': 'application/json',
      })

      req.on('response', (headers) => {
        const status = headers[':status']
        let data = ''
        req.on('data', (chunk) => { data += chunk })
        req.on('end', () => {
          if (status === 200) {
            safeResolve({ ok: true })
          } else {
            let reason = data
            try { reason = JSON.parse(data).reason || data } catch { reason = data || `HTTP ${status}` }
            // Auto-clean stale tokens (activity ended on device, token revoked)
            if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
              const admin = createAdminClient()
              Promise.resolve(admin.from('live_activity_push_tokens').delete().eq('token', args.token))
                .catch((delErr) => logError('apns-la', '[APNs LA] Failed to remove stale token', delErr))
            }
            safeResolve({ ok: false, error: String(reason) })
          }
        })
      })
      req.on('error', (err) => safeResolve({ ok: false, error: err.message }))
      req.write(payload)
      req.end()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      resolve({ ok: false, error: msg })
    }
  })
}

/**
 * Look up the Live Activity push tokens for a user + kind and send the update
 * to all matching activities. Most users have at most one active LA per kind,
 * but we send to all stored tokens to be safe (multi-device, stale-token race).
 *
 * Returns one result per token; never throws.
 */
export async function sendLiveActivityUpdate<K extends LiveActivityKind>(args: {
  userId: string
  kind: K
  event: LiveActivityEvent
  contentState: ContentStateForKind<K>
  dismissalDate?: string
  alert?: { title: string; body: string }
}): Promise<Array<{ token: string; ok: boolean; error?: string }>> {
  const cfg = getApnsConfig()
  if (!cfg) {
    logError('apns-la', '[APNs LA] Missing config — set APNS_KEY_ID/APNS_TEAM_ID/APNS_KEY_P8')
    return []
  }
  if (!args.userId || !args.kind || !args.event) return []

  let jwt: string
  try {
    jwt = await getJwt(cfg)
  } catch (e) {
    logError('apns-la', '[APNs LA] JWT generation failed', e)
    return []
  }

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('live_activity_push_tokens')
    .select('token')
    .eq('user_id', args.userId)
    .eq('kind', args.kind)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (error) {
    // Table missing (migration not applied) — fail soft instead of crashing
    if (String(error.code || '').toLowerCase() === '42p01' || /does not exist/i.test(error.message)) {
      return []
    }
    logError('apns-la', '[APNs LA] Failed to fetch tokens', error)
    return []
  }
  if (!Array.isArray(rows) || rows.length === 0) return []

  const tokens = rows.map((r) => String(r.token || '').trim()).filter(Boolean)
  logInfo('apns-la', `[APNs LA] Sending ${args.event} to ${tokens.length} ${args.kind} activity token(s) for user=${args.userId.slice(0, 8)}`)

  const results = await Promise.all(
    tokens.map((token) =>
      sendOneLiveActivity(
        {
          token,
          kind: args.kind,
          event: args.event,
          contentState: args.contentState,
          dismissalDate: args.dismissalDate,
          alert: args.alert,
        },
        cfg,
        jwt,
      ).then((r) => ({ token, ...r })),
    ),
  )
  return results
}

/**
 * Convenience wrapper for the workout LA — used by the report-generated /
 * coach-feedback flows to surface live insights on the Dynamic Island while
 * the user is still training. Pure pass-through to sendLiveActivityUpdate.
 */
export async function updateWorkoutActivity(args: {
  userId: string
  contentState: WorkoutContentState
  alert?: { title: string; body: string }
}) {
  return sendLiveActivityUpdate({
    userId: args.userId,
    kind: 'workout',
    event: 'update',
    contentState: args.contentState,
    alert: args.alert,
  })
}
