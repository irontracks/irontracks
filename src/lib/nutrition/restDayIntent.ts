/**
 * Leitura/escrita da resposta diária "vai treinar hoje?" (modo dia de descanso).
 * Client-safe: usa o supabase do browser; a RLS garante que cada usuário só
 * toca as próprias linhas. O date_key é sempre o dia no fuso BRT (mesmo usado
 * pela página de nutrição e pelo cron matinal) pra leitura e escrita casarem.
 */
import { createClient } from '@/utils/supabase/client'

const BRT_TZ = 'America/Sao_Paulo'

/** Dia atual (YYYY-MM-DD) no fuso BRT — chave canônica da tabela. */
export function brtDateKey(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: BRT_TZ })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export type RestDayIntent = { willTrain: boolean } | null

/** Resposta do usuário para HOJE, ou null se ainda não respondeu. */
export async function getTodayRestDayIntent(userId: string): Promise<RestDayIntent> {
  if (!userId) return null
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('rest_day_intents')
      .select('will_train')
      .eq('user_id', userId)
      .eq('date_key', brtDateKey())
      .maybeSingle()
    if (!data) return null
    return { willTrain: Boolean((data as { will_train?: boolean }).will_train) }
  } catch {
    return null
  }
}

/** Grava (upsert) a resposta do usuário para HOJE. Retorna sucesso. */
export async function setRestDayIntent(userId: string, willTrain: boolean): Promise<boolean> {
  if (!userId) return false
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('rest_day_intents')
      .upsert(
        { user_id: userId, date_key: brtDateKey(), will_train: willTrain, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date_key' },
      )
    return !error
  } catch {
    return false
  }
}

// ── Resposta pendente (push → app) ───────────────────────────────────────────
// Ao tocar o botão no push, o app pode abrir "a frio" antes da sessão carregar.
// Guardamos a resposta localmente na hora (síncrono, sem depender de login) e
// gravamos no banco assim que o userId estiver disponível (flush).
const PENDING_KEY = 'irontracks.pendingRestDay'

/** Guarda a resposta do push localmente, carimbada com o dia BRT. */
export function savePendingRestDayAnswer(willTrain: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(PENDING_KEY, JSON.stringify({ willTrain: Boolean(willTrain), dateKey: brtDateKey() }))
  } catch { /* storage indisponível — ignora */ }
}

/**
 * Grava no banco uma resposta pendente do push, se houver e for de hoje.
 * Chamar quando o userId estiver disponível. Limpa a pendência após gravar
 * (ou se for de um dia anterior). Retorna a resposta gravada, ou null.
 */
export async function flushPendingRestDayIntent(userId: string): Promise<{ willTrain: boolean } | null> {
  if (!userId) return null
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { willTrain?: boolean; dateKey?: string }
    // Pendência de outro dia não vale mais — descarta.
    if (parsed?.dateKey !== brtDateKey()) { localStorage.removeItem(PENDING_KEY); return null }
    const ok = await setRestDayIntent(userId, Boolean(parsed.willTrain))
    if (ok) { localStorage.removeItem(PENDING_KEY); return { willTrain: Boolean(parsed.willTrain) } }
    return null
  } catch {
    return null
  }
}
