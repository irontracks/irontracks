const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')
const vipDir = path.join(repoRoot, 'src', 'app', 'api', 'vip')

const files = [
  path.join(vipDir, 'access', 'route.ts'),
  path.join(vipDir, 'chat', 'thread', 'route.ts'),
  path.join(vipDir, 'chat', 'messages', 'route.ts'),
  path.join(vipDir, 'profile', 'route.ts'),
  path.join(vipDir, 'weekly-summary', 'route.ts'),
  path.join(vipDir, 'welcome-status', 'route.ts'),
  path.join(vipDir, 'welcome-seen', 'route.ts'),
]

files.forEach((p) => assert.ok(fs.existsSync(p), `missing: ${path.relative(repoRoot, p)}`))

for (const p of files) {
  const text = fs.readFileSync(p, 'utf8')
  assert.ok(text.includes('getVipPlanLimits'), `vip route should use getVipPlanLimits: ${path.relative(repoRoot, p)}`)
  assert.ok(!text.includes(".from('app_subscriptions')"), `vip route must not query app_subscriptions directly: ${path.relative(repoRoot, p)}`)
  assert.ok(!text.includes(".from('marketplace_subscriptions')"), `vip route must not query marketplace_subscriptions directly: ${path.relative(repoRoot, p)}`)
  assert.ok(!text.includes('computeVipAccess'), `vip route must not include computeVipAccess: ${path.relative(repoRoot, p)}`)
}

process.stdout.write('ok\n')
