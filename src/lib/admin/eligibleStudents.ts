/**
 * Alunos aptos a RECEBER um treino do professor numa aplicação em massa.
 *
 * Só entram os alunos DO professor (students.teacher_id === teacherId) que já têm conta no
 * app (user_id preenchido = auth uid). O user_id é o que vira `workouts.user_id` no
 * saveTeacherWorkout, e a RLS (*_insert_silo via is_teacher_of) só deixa gravar pra aluno
 * com vínculo real — aluno sem conta nunca recebe. Filtrar aqui evita oferecer no seletor
 * quem não pode receber (e evita gravações que a RLS barraria).
 */
export interface EligibleStudentLike {
    teacher_id?: string | null
    user_id?: string | null
}

export function eligibleStudentsForApply<T extends EligibleStudentLike>(
    users: T[] | null | undefined,
    teacherId: string | null | undefined,
): T[] {
    const tid = String(teacherId || '').trim()
    if (!tid) return []
    const list = Array.isArray(users) ? users : []
    return list.filter(
        (u) => String(u?.teacher_id || '').trim() === tid && String(u?.user_id || '').trim() !== '',
    )
}
