import { describe, it, expect } from 'vitest'
import { buildTeacherExercisesPayload } from '../teacherWorkoutPayload'

/**
 * O treino que o professor monta pro aluno era gravado com
 * `supabase.from('exercises').insert({ sets, reps, rpe, ... })`, mas a tabela `exercises`
 * NÃO tem essas colunas (são normalizadas em `sets`) — o insert falhava inteiro e o
 * exercício sumia. Este helper converte o formato do AdminWorkoutEditor (sets escalar +
 * reps/rpe únicos) OU um template do banco (sets já como array) no payload jsonb que a
 * RPC `save_workout_atomic` espera, gerando linhas na tabela `sets`. Estes testes travam
 * essa conversão.
 */
describe('buildTeacherExercisesPayload', () => {
  it('sets escalar vira N linhas de sets herdando reps/rpe do exercício', () => {
    const [ex] = buildTeacherExercisesPayload([
      { name: 'Supino', sets: 3, reps: '10', rpe: '8', cadence: '2020', restTime: 90, method: 'Normal' },
    ])
    expect(ex.sets).toHaveLength(3)
    expect(ex.sets.map((s) => s.set_number)).toEqual([1, 2, 3])
    expect(ex.sets.every((s) => s.reps === '10' && s.rpe === '8')).toBe(true)
    expect(ex.sets.every((s) => s.set_type === 'working' && s.is_warmup === false)).toBe(true)
    expect(ex.rest_time).toBe(90)
    expect(ex.cadence).toBe('2020')
    expect(ex.method).toBe('Normal')
  })

  it('sets como array (template do banco) preserva as linhas, weight e warmup', () => {
    const [ex] = buildTeacherExercisesPayload([
      {
        name: 'Agachamento',
        sets: [
          { weight: 60, reps: '12', rpe: 7, set_number: 1, is_warmup: true },
          { weight: 100, reps: '8', rpe: 9, set_number: 2 },
        ],
      },
    ])
    expect(ex.sets).toHaveLength(2)
    expect(ex.sets[0]).toMatchObject({ weight: 60, reps: '12', rpe: 7, is_warmup: true, set_type: 'warmup' })
    expect(ex.sets[1]).toMatchObject({ weight: 100, reps: '8', rpe: 9, is_warmup: false, set_type: 'working' })
  })

  it('coachNotes tem prioridade sobre notes (campo de texto do editor do professor)', () => {
    const [ex] = buildTeacherExercisesPayload([
      { name: 'Remada', sets: 2, coachNotes: 'segura 1s no topo', notes: 'nota antiga' },
    ])
    expect(ex.notes).toBe('segura 1s no topo')
  })

  it('coachNotes DEFINIDO-porém-vazio APAGA a nota (professor limpou o campo COACH)', () => {
    // Regressão achada na revisão: o editor duplica ex.notes em notes+coachNotes; limpar o
    // campo COACH tem que apagar a nota, não ressuscitar a antiga do campo escondido.
    const [vazio] = buildTeacherExercisesPayload([{ name: 'Rosca', sets: 2, coachNotes: '', notes: 'Segura 2s embaixo' }])
    expect(vazio.notes).toBe('')
    const [espacos] = buildTeacherExercisesPayload([{ name: 'Rosca', sets: 2, coachNotes: '   ', notes: 'Segura 2s embaixo' }])
    expect(espacos.notes).toBe('')
  })

  it('SEM coachNotes (template do banco) preserva notes', () => {
    const [ex] = buildTeacherExercisesPayload([
      { name: 'Rosca', sets: [{ reps: '10', set_number: 1 }], notes: 'controlar a fase excêntrica' },
    ])
    expect(ex.notes).toBe('controlar a fase excêntrica')
  })

  it('order é sequencial e reindexa exercícios', () => {
    const out = buildTeacherExercisesPayload([
      { name: 'A', sets: 1 },
      { name: 'B', sets: 1 },
      { name: 'C', sets: 1 },
    ])
    expect(out.map((e) => e.order)).toEqual([0, 1, 2])
  })

  it('aceita restTime/rest_time e videoUrl/video_url (formatos mistos)', () => {
    const [a] = buildTeacherExercisesPayload([{ name: 'X', sets: 1, restTime: 45, videoUrl: 'http://v/1' }])
    const [b] = buildTeacherExercisesPayload([{ name: 'Y', sets: 1, rest_time: 30, video_url: 'http://v/2' }])
    expect(a.rest_time).toBe(45)
    expect(a.video_url).toBe('http://v/1')
    expect(b.rest_time).toBe(30)
    expect(b.video_url).toBe('http://v/2')
  })

  it('sets 0 ou ausente → exercício sem linhas (não inventa série)', () => {
    const [a] = buildTeacherExercisesPayload([{ name: 'Cardio', sets: 0 }])
    const [b] = buildTeacherExercisesPayload([{ name: 'Cardio2' }])
    expect(a.sets).toHaveLength(0)
    expect(b.sets).toHaveLength(0)
  })

  it('ignora entradas não-objeto sem quebrar', () => {
    const out = buildTeacherExercisesPayload([null, undefined, 'lixo', { name: 'Válido', sets: 1 }])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Válido')
  })

  it('video_url ausente vira null (não string vazia)', () => {
    const [ex] = buildTeacherExercisesPayload([{ name: 'Z', sets: 1 }])
    expect(ex.video_url).toBeNull()
  })
})
