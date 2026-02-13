const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const payloadPath = path.join(repoRoot, 'src', 'lib', 'finishWorkoutPayload.ts')
assert.ok(fs.existsSync(payloadPath), 'finishWorkoutPayload.ts missing')
const payloadText = fs.readFileSync(payloadPath, 'utf8')
assert.ok(payloadText.includes('buildFinishWorkoutPayload'), 'buildFinishWorkoutPayload export missing')

const activeWorkoutPath = path.join(repoRoot, 'src', 'components', 'ActiveWorkout.js')
assert.ok(fs.existsSync(activeWorkoutPath), 'ActiveWorkout.js missing')
const activeText = fs.readFileSync(activeWorkoutPath, 'utf8')
assert.ok(activeText.includes("buildFinishWorkoutPayload"), 'ActiveWorkout must call buildFinishWorkoutPayload')

process.stdout.write('ok\n')
