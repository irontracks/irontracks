const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const payloadPath = path.join(repoRoot, 'src', 'lib', 'finishWorkoutPayload.ts')
assert.ok(fs.existsSync(payloadPath), 'finishWorkoutPayload.ts missing')
const payloadText = fs.readFileSync(payloadPath, 'utf8')
assert.ok(payloadText.includes('buildFinishWorkoutPayload'), 'buildFinishWorkoutPayload export missing')

// buildFinishWorkoutPayload may be called from ActiveWorkout or its finish hook
const activeWorkoutPath = path.join(repoRoot, 'src', 'components', 'ActiveWorkout.tsx')
assert.ok(fs.existsSync(activeWorkoutPath), 'ActiveWorkout.tsx missing')
const useFinishHookPath = path.join(repoRoot, 'src', 'components', 'workout', 'hooks', 'useWorkoutFinish.ts')
const finishCallerPath = fs.existsSync(useFinishHookPath) ? useFinishHookPath : activeWorkoutPath
const finishCallerText = fs.readFileSync(finishCallerPath, 'utf8')
assert.ok(finishCallerText.includes('buildFinishWorkoutPayload'), 'ActiveWorkout (or its finish hook) must call buildFinishWorkoutPayload')

const reportHtmlPath = path.join(repoRoot, 'src', 'utils', 'report', 'buildHtml.ts')
assert.ok(fs.existsSync(reportHtmlPath), 'buildHtml.ts missing')
const reportHtmlText = fs.readFileSync(reportHtmlPath, 'utf8')
assert.ok(reportHtmlText.includes('log.notes'), 'buildHtml must include per-set notes')

const workoutReportPath = path.join(repoRoot, 'src', 'components', 'WorkoutReport.tsx')
assert.ok(fs.existsSync(workoutReportPath), 'WorkoutReport.tsx missing')
const workoutReportText = fs.readFileSync(workoutReportPath, 'utf8')
assert.ok(
  workoutReportText.includes('logObj?.notes') || workoutReportText.includes('logObj.notes') ||
  workoutReportText.includes('db?.notes') || workoutReportText.includes('db.notes') ||
  workoutReportText.includes('e?.notes') || workoutReportText.includes('.notes'),
  'WorkoutReport must display per-set notes'
)

process.stdout.write('ok\n')
