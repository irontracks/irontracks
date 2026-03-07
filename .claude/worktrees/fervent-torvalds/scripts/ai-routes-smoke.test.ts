const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const routes = [
  'src/app/api/ai/coach-chat/route.ts',
  'src/app/api/ai/vip-coach/route.ts',
  'src/app/api/ai/workout-wizard/route.ts',
]

for (const rel of routes) {
  const abs = path.join(repoRoot, rel)
  assert.ok(fs.existsSync(abs), `missing: ${rel}`)
  const text = fs.readFileSync(abs, 'utf8')
  assert.ok(text.includes('requireUser'), `route must requireUser: ${rel}`)
  assert.ok(text.includes('checkVipFeatureAccess'), `route must enforce VIP limits: ${rel}`)
  assert.ok(text.includes('incrementVipUsage'), `route must increment usage: ${rel}`)
  assert.ok(text.includes('checkRateLimit'), `route must rate limit: ${rel}`)
  assert.ok(text.includes('upgradeRequired'), `route must support upgradeRequired: ${rel}`)
}

process.stdout.write('ok\n')

