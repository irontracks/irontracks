import { describe, it, expect } from 'vitest'
import { wizardAnswersToStudentPayload, planToWorkoutDrafts } from '../studentWorkoutWizard'
import type { WorkoutWizardAnswers } from '@/components/dashboard/WorkoutWizardModal'

const baseAnswers: WorkoutWizardAnswers = {
  goal: 'hypertrophy',
  split: 'ppl',
  daysPerWeek: 5,
  timeMinutes: 60,
  equipment: 'gym',
  level: 'intermediate',
  focus: 'balanced',
  constraints: '',
}

describe('wizardAnswersToStudentPayload', () => {
  it('modo single força 1 dia (o Wizard quer um treino só)', () => {
    const p = wizardAnswersToStudentPayload(baseAnswers, 'stu-1', 'single')
    expect(p.daysPerWeek).toBe(1)
    expect(p.studentId).toBe('stu-1')
  })

  it('modo program usa daysPerWeek do questionário', () => {
    const p = wizardAnswersToStudentPayload(baseAnswers, 'stu-1', 'program')
    expect(p.daysPerWeek).toBe(5)
  })

  it('focus carrega o objetivo traduzido e a intenção do questionário', () => {
    const p = wizardAnswersToStudentPayload(baseAnswers, 'stu-1', 'program')
    expect(p.focus).toContain('hipertrofia')
    expect(p.focus).toContain('push/pull/legs')
    expect(p.focus).toContain('intermediário')
    expect(p.focus).toContain('60min')
  })

  it('constraints vira limitations; vazio omite a chave', () => {
    const withC = wizardAnswersToStudentPayload({ ...baseAnswers, constraints: 'lesão no ombro' }, 'stu-1', 'program')
    expect(withC.limitations).toBe('lesão no ombro')
    const withoutC = wizardAnswersToStudentPayload(baseAnswers, 'stu-1', 'program')
    expect('limitations' in withoutC).toBe(false)
  })

  it('daysPerWeek fora do range é clampado (1..7)', () => {
    const p = wizardAnswersToStudentPayload({ ...baseAnswers, daysPerWeek: 9 as unknown as WorkoutWizardAnswers['daysPerWeek'] }, 'stu-1', 'program')
    expect(p.daysPerWeek).toBeLessThanOrEqual(7)
  })
})

describe('planToWorkoutDrafts', () => {
  const plan = {
    planName: 'Plano PPL',
    days: [
      { name: 'Treino A - Push', exercises: [{ name: 'Supino', sets: 4, reps: '8-12', rest: 90, method: 'Normal', notes: 'controlar a descida' }] },
      { name: 'Treino B - Pull', exercises: [{ name: 'Remada', sets: 3, reps: '10', rest: 75, method: 'Drop-set', notes: '' }] },
    ],
  }

  it('um draft por dia, com title = nome do dia', () => {
    const drafts = planToWorkoutDrafts(plan)
    expect(drafts).toHaveLength(2)
    expect(drafts[0].title).toBe('Treino A - Push')
    expect(drafts[1].title).toBe('Treino B - Pull')
  })

  it('mapeia rest → restTime e preserva método/notas', () => {
    const [a] = planToWorkoutDrafts(plan)
    const ex = a.exercises[0] as Record<string, unknown>
    expect(ex.restTime).toBe(90)
    expect(ex.method).toBe('Normal')
    expect(ex.notes).toBe('controlar a descida')
    expect(ex.sets).toBe(4)
    expect(ex.reps).toBe('8-12')
  })

  it('robusto a plan ausente/inválido → []', () => {
    expect(planToWorkoutDrafts(null)).toEqual([])
    expect(planToWorkoutDrafts({})).toEqual([])
    expect(planToWorkoutDrafts({ days: 'nope' })).toEqual([])
  })

  it('ignora dias e exercícios não-objeto sem quebrar', () => {
    const drafts = planToWorkoutDrafts({ days: [null, { name: 'OK', exercises: [null, { name: 'Agacho', sets: 3 }] }] })
    expect(drafts).toHaveLength(1)
    expect(drafts[0].exercises).toHaveLength(1)
  })
})
