/**
 * @module restoreSessionGate
 *
 * PORTÃO ÚNICO por onde passa toda restauração da sessão de treino guardada no
 * `localStorage`. Existe para que a decisão "esta sessão ainda vale?" seja
 * tomada UMA vez, e não em cada hook que lê a chave.
 *
 * Dois hooks independentes leem o mesmo snapshot e fazem coisas diferentes com
 * ele: `useLocalPersistence` decide a VIEW (abrir o app já dentro do treino) e
 * `useSessionSync` HIDRATA o estado. Com a regra de validade escrita só em um
 * deles, o outro discordaria — e o modo de falhar é feio: a view abre no treino
 * enquanto o estado fica vazio, ou seja, uma tela de treino sem treino.
 *
 * É a mesma classe de erro que o CLAUDE.md chama de "cobrindo as pontas e não a
 * fiação": os dois lados certos isoladamente e ninguém ligando os dois.
 */
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { logWarn } from '@/lib/logger'
import { classifyRestoredSession, lastActivityMs, type RestoredSessionVerdict } from './staleSession'

export const activeSessionStorageKey = (userId: string): string =>
  `irontracks.activeSession.v2.${userId}`

export type RestoreGateResult = {
  verdict: RestoredSessionVerdict
  /** O snapshot cru, já parseado. `null` quando não há nada restaurável. */
  session: Record<string, unknown> | null
  /** Há quanto tempo a sessão está sem atividade, em ms (0 quando desconhecido). */
  ageMs: number
}

const EMPTY: RestoreGateResult = { verdict: 'expired', session: null, ageMs: 0 }

/**
 * Lê o snapshot local e decide o que fazer com ele.
 *
 * Efeito colateral deliberado: quando o veredito é `expired`, a chave é APAGADA
 * aqui mesmo. Se ficasse no disco, o próximo hook a ler encontraria a sessão de
 * novo e a decisão viraria uma corrida entre os dois.
 *
 * `nowMs` é parâmetro, não `Date.now()` interno, para o teste poder fixar o
 * relógio — teste que depende do dia real passa sozinho no dia certo.
 */
export const readRestorableSession = (
  userId: string,
  nowMs: number,
): RestoreGateResult => {
  const uid = String(userId ?? '').trim()
  if (!uid) return EMPTY
  if (typeof window === 'undefined' || !window.localStorage) return EMPTY

  const key = activeSessionStorageKey(uid)
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(key) || window.localStorage.getItem('activeSession')
  } catch (e) {
    logWarn('restoreSessionGate', 'localStorage indisponível', e)
    return EMPTY
  }
  if (!raw) return EMPTY

  const parsed: unknown = parseJsonWithSchema(raw, z.record(z.unknown()))
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

  // Mesma exigência mínima que o restore sempre teve: sem `startedAt` e sem
  // `workout` não há treino a retomar, seja qual for a idade.
  if (!isRecord(parsed) || !parsed.startedAt || !parsed.workout) return EMPTY

  const savedAt = parsed._savedAt ?? parsed._idbSavedAt ?? 0
  const verdict = classifyRestoredSession({
    savedAtMs: savedAt,
    startedAtMs: parsed.startedAt,
    nowMs,
  })

  const last = lastActivityMs(savedAt, parsed.startedAt)
  const ageMs = last > 0 && Number.isFinite(nowMs) ? Math.max(0, nowMs - last) : 0

  if (verdict === 'expired') {
    try {
      window.localStorage.removeItem(key)
      window.localStorage.removeItem('activeSession')
    } catch (e) {
      logWarn('restoreSessionGate', 'falha ao descartar sessão expirada', e)
    }
    return { verdict: 'expired', session: null, ageMs }
  }

  return { verdict, session: parsed, ageMs }
}
