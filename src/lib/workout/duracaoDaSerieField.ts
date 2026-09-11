/**
 * O campo `duration_seconds` de uma linha de `sets` — fonte única para quem
 * monta payload de série.
 *
 * Irmão de `perSetMethodField` e de `unilateralPersistFields`, e existe pelo
 * MESMO motivo: a RPC `save_workout_atomic` **apaga e reinsere** as séries, e
 * nenhum dos oito builders copiava este campo. Ou seja, ele nunca deixou de ser
 * gravado — ele era APAGADO a cada salvamento, sem erro nenhum.
 *
 * ⚠️ MEDIDO em 11/09/2026, na conta do dono: a Esteira do "QUI · Lower B" tinha
 * três blocos com `{speed: 4|5|6, incline: …}` no template e **`duration_seconds`
 * NULL nos três**, enquanto a sessão daquele dia registrava 300s, 600s e 900s.
 * A velocidade sobrevivia (vai dentro de `advanced_config`, que É copiado) e o
 * TEMPO de cada bloco se perdia — um cardio de 30 minutos voltava ao plano como
 * três blocos sem duração.
 *
 * É o mesmo defeito que o `per_set_method` teve, na coluna ao lado, e por isso
 * entra no MESMO guard de classe.
 */

type UnknownRecord = Record<string, unknown>

const isObj = (v: unknown): v is UnknownRecord =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * `{ duration_seconds }` pronto para o spread no payload da série.
 *
 * camelCase (estado do app) vence snake_case (linha do banco), como nos irmãos.
 * Zero e negativo viram `null`: a coluna é `positive()` no schema, e um `0`
 * gravado diria "bloco de zero segundo" — que é diferente de "sem duração
 * definida".
 */
export function duracaoDaSerieField(set: unknown): { duration_seconds: number | null } {
    const s = isObj(set) ? set : {}
    const bruto = s.durationSeconds ?? s.duration_seconds
    const n = Number(bruto)
    return { duration_seconds: Number.isFinite(n) && n > 0 ? Math.round(n) : null }
}
