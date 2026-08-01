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

/** Avisa o app que a lista de treinos mudou. Seguro fora do browser. */
export function notifyWorkoutsChanged(): void {
    try {
        window.dispatchEvent(new CustomEvent('irontracks:workouts-changed'))
    } catch {
        /* SSR / webview sem window — nada a invalidar nesse contexto */
    }
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

        notifyWorkoutsChanged()
        return { ok: true }
    } catch (e: unknown) {
        const error = e instanceof Error ? e.message : 'Falha ao salvar no plano.'
        return { ok: false, error }
    }
}
