const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const mustExist = [
  'src/app/(app)/dashboard/IronTracksAppClientImpl.tsx',
  'src/components/WorkoutReport.tsx',
  'src/app/api/workouts/finish/route.ts',
  'src/app/api/workouts/history/route.ts',
  'src/app/api/chat/messages/route.ts',
  'src/app/api/chat/send/route.ts',
]

mustExist.forEach((rel) => {
  const abs = path.join(repoRoot, rel)
  assert.ok(fs.existsSync(abs), `missing: ${rel}`)
})

const finishRoute = fs.readFileSync(path.join(repoRoot, 'src/app/api/workouts/finish/route.ts'), 'utf8')
assert.ok(finishRoute.includes('checkRateLimit'), 'finish should rate limit')
assert.ok(finishRoute.includes('insertNotifications'), 'finish should notify')

const reportComp = fs.readFileSync(path.join(repoRoot, 'src/components/WorkoutReport.tsx'), 'utf8')
assert.ok(reportComp.includes('buildReportHTML'), 'report should build HTML')
assert.ok(reportComp.includes('generatePostWorkoutInsights'), 'report should support insights')

process.stdout.write('ok\n')
