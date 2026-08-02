/**
 * Caminho ÚNICO para gravar mudanças no plano de um treino e avisar o resto do
 * app.
 *
 * Existe porque o mesmo bug apareceu três vezes seguidas, sempre igual: a
 * escrita ia pro banco e a tela não mudava — "precisei reiniciar o app pra ele
 * sumir". A lista de treinos é uma query cacheada; sem invalidar, só um cold
 * start refazia a busca.
 *
 * O canal (`irontracks:workouts-changed`, escutado por `useWorkoutFetch`) já
 * existia. O que faltava era alguém lembrar de despachar — e "lembrar" não é
 * estratégia. Quem grava plano passa por aqui e a invalidação vem junto.
 */

/**
 * Invalidação PENDENTE, guardada para depois do treino ativo.
 *
 * ⚠️ Não invalidar a lista durante a sessão em andamento é decisão de segurança,
 * não preguiça: o refetch substitui o array de treinos por objetos novos (a RPC
 * `save_workout_atomic` recria os exercícios, então até os ids mudam), e isso
 * remontava a tela do treino ativo — o modal fechava sozinho no meio da série.
 * Perder a sessão é o pior estrago possível nesta feature.
 *
 * Então: durante o treino, marca; ao sair, invalida.
 */
let pendingWorkoutsRefresh = false

/**
 * Avisa o app que a lista de treinos mudou. Seguro fora do browser.
 *
 * `defer: true` adia o aviso — use quando a gravação acontece DENTRO do treino
 * ativo. O `flushPendingWorkoutsRefresh()` solta o aviso ao sair da sessão.
 */
export function notifyWorkoutsChanged(options?: { defer?: boolean }): void {
    if (options?.defer) {
        pendingWorkoutsRefresh = true
        return
    }
    try {
        window.dispatchEvent(new CustomEvent('irontracks:workouts-changed'))
    } catch {
        /* SSR / webview sem window — nada a invalidar nesse contexto */
    }
}

/** Solta a invalidação represada durante o treino. No-op quando não há nada pendente. */
export function flushPendingWorkoutsRefresh(): void {
    if (!pendingWorkoutsRefresh) return
    pendingWorkoutsRefresh = false
    notifyWorkoutsChanged()
}

/** Só para teste — zera o estado do módulo entre casos. */
export function __resetPendingWorkoutsRefresh(): void {
    pendingWorkoutsRefresh = false
}

export interface PersistWorkoutPlanResult {
    ok: boolean
    error?: string
}

/**
 * PATCH em /api/workouts/update + invalidação da lista.
 *
 * Só notifica quando a escrita CONFIRMA: avisar depois de uma falha faria a
 * lista recarregar o dado antigo e parecer que a mudança foi revertida sozinha.
 */
export async function persistWorkoutPlan(
    workoutId: string,
    workout: Record<string, unknown>,
    options?: { deferNotify?: boolean },
): Promise<PersistWorkoutPlanResult> {
    const id = String(workoutId || '').trim()
    if (!id) return { ok: false, error: 'Não foi possível salvar: treino sem ID.' }

    try {
        const response = await fetch('/api/workouts/update', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, workout }),
        }).catch((): null => null)

        const result = response ? await response.json().catch((): null => null) : null
        const ok = !!response?.ok && !!(result as Record<string, unknown> | null)?.ok
        if (!ok) {
            const error = String((result as Record<string, unknown> | null)?.error || 'Falha ao salvar no plano.')
            return { ok: false, error }
        }

        notifyWorkoutsChanged({ defer: options?.deferNotify })
        return { ok: true }
    } catch (e: unknown) {
        const error = e instanceof Error ? e.message : 'Falha ao salvar no plano.'
        return { ok: false, error }
    }
}
