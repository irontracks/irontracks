/**
 * Recorte de visibilidade da LISTA de avaliações por foto.
 *
 * Espelha, em código, a policy RLS `body_photo_assessments_trainer` (conferida
 * no banco em 31/07/2026):
 *
 *   auth.uid() = trainer_id
 *   AND EXISTS (select 1 from students s
 *               where s.user_id = body_photo_assessments.user_id
 *                 and s.teacher_id = auth.uid())
 *
 * Ou seja: ser o `trainer_id` gravado na linha NÃO basta — o vínculo precisa
 * estar VIVO. A rota usa service-role (RLS desligada), então a regra tem que ser
 * repetida aqui; e ela vive numa função pura justamente para poder ser testada
 * sem subir Supabase.
 *
 * O filtro antigo (`.or(user_id.eq.X, trainer_id.eq.X)`) tinha duas falhas:
 *  1. linha forjada {user_id: vítima, trainer_id: self} aparecia na listagem;
 *  2. o EX-personal continuava enxergando tudo depois de o vínculo ser desfeito
 *     — mesmo modo de falha que vazou exames laboratoriais (auditoria 2026-07-28).
 */

export interface AssessmentAccessRow {
    user_id: string
    trainer_id: string | null
}

/** Uma linha é visível para o dono, ou para o personal que a gerou E ainda tem o aluno. */
export function canSeeAssessment(row: AssessmentAccessRow, viewerId: string, coachedUserIds: ReadonlySet<string>): boolean {
    const viewer = String(viewerId || '').trim()
    if (!viewer) return false
    if (row?.user_id === viewer) return true
    return row?.trainer_id === viewer && coachedUserIds.has(row.user_id)
}

export function filterVisibleAssessments<T extends AssessmentAccessRow>(
    rows: readonly T[],
    viewerId: string,
    coachedUserIds: Iterable<string>,
): T[] {
    const coached = new Set(coachedUserIds)
    return rows.filter((r) => canSeeAssessment(r, viewerId, coached))
}
