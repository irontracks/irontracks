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

/**
 * Avisa o ALUNO que o professor AJUSTOU um treino que ele já tinha.
 *
 * Irmão do `notifyStudentWorkoutAssigned`, e separado dele de propósito: são
 * dois avisos diferentes para o aluno ("montei um treino novo" × "mexi no seu")
 * e dois toggles diferentes nas Configurações. Fire-and-forget pelo mesmo
 * motivo: o treino já foi salvo quando isto roda.
 *
 * A janela de agrupamento fica no SERVIDOR (`coachChangeNotice`): o coach que
 * salva cinco vezes seguidas gera um push, não cinco — e a decisão não pode
 * depender do cliente, que é justamente quem repete a chamada.
 */
export async function notifyStudentWorkoutUpdated(
    studentUserId: string | null | undefined,
    workoutName?: string,
): Promise<void> {
    const target = String(studentUserId || '').trim()
    if (!target) return
    try {
        await fetch('/api/notifications/coach-change', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ studentUserId: target, kind: 'workout_updated', nome: workoutName || undefined }),
        })
    } catch {
        /* best-effort: o treino já foi salvo; o aviso não é crítico */
    }
}
