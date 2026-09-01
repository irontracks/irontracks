/**
 * O campo `per_set_method` de uma linha de `sets` — fonte única para quem monta
 * payload de série.
 *
 * Irmão de `unilateralPersistFields`, e existe pelo MESMO motivo: a RPC
 * `save_workout_atomic` **apaga e reinsere** as séries do treino, então um
 * builder que não copia o campo não deixa de gravá-lo — ele APAGA o que já
 * estava lá. O método salvo para a 3ª série sumiria na primeira vez que o
 * usuário salvasse o treino por qualquer outro caminho (editor completo, ação
 * de servidor, sync professor→aluno), sem erro nenhum.
 *
 * É a mesma armadilha do `planDays` da nutrição: quem reconstrói campo a campo
 * descarta o que não declara.
 */

type UnknownRecord = Record<string, unknown>

const isObj = (v: unknown): v is UnknownRecord =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * `{ per_set_method }` pronto para o spread no payload da série.
 *
 * camelCase (estado do app) vence snake_case (linha do banco), como no helper
 * do unilateral. Vazio vira `null` — string vazia cairia de volta na inferência
 * por nota/config e desfaria a escolha do usuário em silêncio.
 */
export function perSetMethodField(set: unknown): { per_set_method: string | null } {
    const s = isObj(set) ? set : {}
    const raw = s.perSetMethod ?? s.per_set_method
    const value = String(raw ?? '').trim()
    return { per_set_method: value || null }
}
