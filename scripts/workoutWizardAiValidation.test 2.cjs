const assert = require('node:assert/strict')
const validation = require('../src/utils/workoutWizardAiValidation')

const baseDraft = (overrides = {}) => ({
  title: 'Treino',
  exercises: [
    { name: 'Leg press', sets: 3, reps: '8-12', restTime: 90, rpe: '7-8' },
    { name: 'Remada baixa (máquina)', sets: 3, reps: '8-12', restTime: 90, rpe: '7-8' },
    { name: 'Crossover (cabo)', sets: 3, reps: '12-15', restTime: 60, rpe: '7-8' },
    { name: 'Tríceps na polia (corda)', sets: 3, reps: '12-15', restTime: 60, rpe: '7-8' },
    { name: 'Face pull', sets: 3, reps: '12-15', restTime: 60, rpe: '7-8' },
  ],
  ...overrides,
})

const run = () => {
  {
    const r = validation.validateDraftAgainstConstraints(baseDraft(), 'priorizar máquinas smart fit')
    assert.equal(r.ok, true)
  }

  {
    const r = validation.validateDraftAgainstConstraints(
      baseDraft({ exercises: [{ name: 'Desenvolvimento militar', sets: 3, reps: '8-10', restTime: 90, rpe: '7-8' }] }),
      'dor no ombro direito'
    )
    assert.equal(r.ok, false)
    assert.ok(r.errors.join(' ').toLowerCase().includes('ombro'))
  }

  {
    const a = baseDraft({ exercises: [{ name: 'Leg press', sets: 3, reps: '8-12', restTime: 90 }] })
    const b = baseDraft({ exercises: [{ name: 'Leg press', sets: 5, reps: '3-6', restTime: 150 }] })
    const sim = validation.similarityByNames(a, b)
    assert.equal(sim, 1)
  }

  {
    const a = baseDraft()
    const b = baseDraft({ exercises: [{ name: 'Cadeira extensora', sets: 3, reps: '12-15', restTime: 60 }] })
    const sim = validation.similarityByNames(a, b)
    assert.ok(sim < 1)
  }
}

try {
  run()
  process.stdout.write('ok\n')
} catch (e) {
  process.stderr.write(String(e?.stack || e) + '\n')
  process.exitCode = 1
}

