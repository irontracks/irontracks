/**
 * Avisa o ALUNO que o professor montou/enviou um treino novo. Fire-and-forget: o treino
 * já foi salvo com sucesso quando isto é chamado; a notificação é best-effort e nunca deve
 * derrubar o fluxo do professor. A rota `/api/notifications/workout-assigned` faz o gate
 * (canCoachStudent), respeita a preferência do aluno e dispara push + linha in-app.
 *
 * `studentUserId` é o AUTH UID do aluno (selectedStudent.user_id).
 */
export async function notifyStudentWorkoutAssigned(
    studentUserId: string | null | undefined,
    workoutName?: string,
): Promise<void> {
    const target = String(studentUserId || '').trim()
    if (!target) return
    try {
        await fetch('/api/notifications/workout-assigned', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ studentUserId: target, workoutName: workoutName || undefined }),
        })
    } catch {
        /* best-effort: o treino já foi salvo; o aviso não é crítico */
    }
}
