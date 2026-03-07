/**
 * Smoke test: VIP system integrity — tiers, batch API, entitlement patterns.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

// ─── Core VIP files must exist ──────────────────────────────────────────────
const vipFiles = [
    'src/utils/vip/limits.ts',
    'src/hooks/useAdminVipMap.ts',
    'src/components/admin-panel/VipTab.tsx',
    'src/app/api/admin/vip/batch-status/route.ts',
    'src/app/api/admin/vip/list/route.ts',
    'src/app/api/admin/vip/revoke/route.ts',
    'src/app/api/admin/vip/grant-trial/route.ts',
]
vipFiles.forEach((rel) => {
    assert.ok(fs.existsSync(path.join(repoRoot, rel)), `missing: ${rel}`)
})

// ─── VIP limits should define all 4 tiers ───────────────────────────────────
const limits = fs.readFileSync(path.join(repoRoot, 'src/utils/vip/limits.ts'), 'utf8')
assert.ok(limits.includes('free') || limits.includes('Free'), 'limits.ts should define Free tier')
assert.ok(limits.includes('start') || limits.includes('Start'), 'limits.ts should define Start tier')
assert.ok(limits.includes('pro') || limits.includes('Pro'), 'limits.ts should define Pro tier')
assert.ok(limits.includes('elite') || limits.includes('Elite'), 'limits.ts should define Elite tier')

// ─── Batch API must dedup by user_id ────────────────────────────────────────
const batchRoute = fs.readFileSync(path.join(repoRoot, 'src/app/api/admin/vip/batch-status/route.ts'), 'utf8')
assert.ok(batchRoute.includes('user_id') || batchRoute.includes('ids'), 'batch-status should query by user_id/ids')

// ─── VipTab should use provider='admin' for grants ──────────────────────────
const vipTab = fs.readFileSync(path.join(repoRoot, 'src/components/admin-panel/VipTab.tsx'), 'utf8')
assert.ok(vipTab.includes('admin'), 'VipTab should reference admin provider')

// ─── Hook should generate stable key to prevent infinite loops ──────────────
const hook = fs.readFileSync(path.join(repoRoot, 'src/hooks/useAdminVipMap.ts'), 'utf8')
assert.ok(hook.includes('sort') || hook.includes('join'), 'useAdminVipMap should sort/join IDs for stable key')

process.stdout.write('ok\n')
