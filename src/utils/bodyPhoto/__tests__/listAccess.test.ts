import { describe, it, expect } from 'vitest'
import { canSeeAssessment, filterVisibleAssessments } from '@/utils/bodyPhoto/listAccess'

/**
 * A listagem de avaliações por foto tem que enxergar o MESMO que a policy RLS
 * `body_photo_assessments_trainer` (a rota usa service-role, então a RLS não a
 * protege):
 *
 *   auth.uid() = trainer_id AND EXISTS (students s where s.user_id = row.user_id
 *                                        and s.teacher_id = auth.uid())
 *
 * Os dois casos que o filtro antigo (`.or(user_id.eq.X, trainer_id.eq.X)`)
 * deixava passar estão travados abaixo — foto de corpo inteiro é o dado mais
 * sensível do app.
 */
describe('visibilidade da lista de avaliações por foto', () => {
    const me = 'coach-1'
    const aluno = 'aluno-1'
    const estranho = 'pessoa-2'
    const coached = new Set([aluno])

    it('o dono sempre vê a própria avaliação', () => {
        expect(canSeeAssessment({ user_id: me, trainer_id: null }, me, new Set())).toBe(true)
        expect(canSeeAssessment({ user_id: me, trainer_id: 'outro' }, me, new Set())).toBe(true)
    })

    it('personal vê o que ELE gerou para aluno com vínculo vivo', () => {
        expect(canSeeAssessment({ user_id: aluno, trainer_id: me }, me, coached)).toBe(true)
    })

    it('NÃO vê linha forjada {user_id: vítima, trainer_id: self} — a vítima não é aluna dele', () => {
        expect(canSeeAssessment({ user_id: estranho, trainer_id: me }, me, coached)).toBe(false)
    })

    it('EX-personal perde acesso quando o vínculo é desfeito (trainer_id continua gravado)', () => {
        expect(canSeeAssessment({ user_id: aluno, trainer_id: me }, me, new Set())).toBe(false)
    })

    it('não vê a AUTOAVALIAÇÃO do aluno (trainer_id null) — a RLS também não deixa', () => {
        expect(canSeeAssessment({ user_id: aluno, trainer_id: null }, me, coached)).toBe(false)
    })

    it('não vê avaliação de terceiro em que não é nem dono nem trainer', () => {
        expect(canSeeAssessment({ user_id: estranho, trainer_id: 'outro-coach' }, me, coached)).toBe(false)
    })

    it('viewer vazio nunca vê nada (fail-closed)', () => {
        expect(canSeeAssessment({ user_id: me, trainer_id: me }, '', coached)).toBe(false)
        expect(canSeeAssessment({ user_id: '', trainer_id: null }, '   ', coached)).toBe(false)
    })

    it('filterVisibleAssessments preserva a ordem e só deixa o permitido', () => {
        const rows = [
            { id: 'a', user_id: me, trainer_id: null },
            { id: 'b', user_id: estranho, trainer_id: me },   // forjada
            { id: 'c', user_id: aluno, trainer_id: me },      // legítima
            { id: 'd', user_id: aluno, trainer_id: null },    // autoavaliação do aluno
        ]
        expect(filterVisibleAssessments(rows, me, coached).map((r) => r.id)).toEqual(['a', 'c'])
    })
})
