const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const limitsPath = path.join(repoRoot, 'src', 'utils', 'vip', 'limits.ts')
assert.ok(fs.existsSync(limitsPath), 'limits.ts missing')
const limitsText = fs.readFileSync(limitsPath, 'utf8')

assert.ok(limitsText.includes('export type VipEntitlementSource'), 'VipEntitlementSource type missing')
assert.ok(limitsText.includes('app_subscriptions'), 'app_subscriptions lookup missing')
assert.ok(limitsText.includes('marketplace_subscriptions'), 'marketplace_subscriptions lookup missing')
assert.ok(limitsText.includes('free_no_subscription'), 'free_no_subscription source missing')
assert.ok(limitsText.includes('app_subscription_missing_plan'), 'missing plan source for app_subscriptions missing')
assert.ok(limitsText.includes('marketplace_subscription_missing_plan'), 'missing plan source for marketplace_subscriptions missing')

const vipStatusPath = path.join(repoRoot, 'src', 'app', 'api', 'vip', 'status', 'route.ts')
assert.ok(fs.existsSync(vipStatusPath), 'vip status route missing')
const vipStatusText = fs.readFileSync(vipStatusPath, 'utf8')
assert.ok(vipStatusText.includes('source'), 'vip status should include source in response')

process.stdout.write('ok\n')
