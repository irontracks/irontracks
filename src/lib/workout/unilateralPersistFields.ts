/**
 * Campos de exercício unilateral/alternado no formato que a RPC
 * `save_workout_atomic` (e a tabela `exercises`) SEMPRE souberam ler:
 * `is_unilateral`, `side_rest_time`, `transition_time`, `is_alternating`.
 *
 * Bug real (relato de usuário, 14/08/2026): o toggle "Exercício Unilateral"
 * era salvo na SESSÃO, mas o caminho "Atualizar plano de treino" descartava os
 * campos — o builder de payload da rota /api/workouts/update (e o do save
 * direto do editor completo) mapeava só name/notes/video_url/rest_time/cadence/
 * method/sets. Como a RPC apaga e reinsere os exercícios, cada save dessas
 * rotas REGRAVAVA o exercício como bilateral: "toda vez que eu vou lá e salvo,
 * ele não salva". O banco e a RPC nunca foram o problema; o furo era o payload.
 *
 * Fonte única: TODO builder que persiste exercícios espalha `...unilateralPersistFields(ex)`.
 * O guard de classe em `__tests__/unilateralPersiste.test.ts` varre os arquivos
 * que persistem exercício e reprova quem construir payload sem passar por aqui.
 */
export function unilateralPersistFields(ex: Record<string, unknown>): {
    is_unilateral: boolean
    side_rest_time: number | null
    transition_time: number | null
    is_alternating: boolean
} {
    const sideRaw = Number(ex?.sideRestTime ?? ex?.side_rest_time)
    const transitionRaw = Number(ex?.transitionTime ?? ex?.transition_time)
    return {
        is_unilateral: !!(ex?.isUnilateral ?? ex?.is_unilateral),
        side_rest_time: Number.isFinite(sideRaw) && sideRaw > 0 ? sideRaw : null,
        transition_time: Number.isFinite(transitionRaw) && transitionRaw > 0 ? transitionRaw : null,
        is_alternating: !!(ex?.isAlternating ?? ex?.is_alternating),
    }
}
