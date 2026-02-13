const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const entitlementRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'vip', 'entitlement', 'route.ts')
assert.ok(fs.existsSync(entitlementRoute), 'admin entitlement route missing')
const entitlementText = fs.readFileSync(entitlementRoute, 'utf8')
assert.ok(entitlementText.includes("requireRole(['admin'])"), 'admin entitlement route must require admin role')
assert.ok(entitlementText.includes('requireRoleWithBearer'), 'admin entitlement route must allow bearer fallback')

const deleteTeacherRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'teachers', 'delete', 'route.ts')
assert.ok(fs.existsSync(deleteTeacherRoute), 'teachers/delete route missing')
const deleteTeacherText = fs.readFileSync(deleteTeacherRoute, 'utf8')
assert.ok(deleteTeacherText.includes('requireRoleWithBearer'), 'teachers/delete should support bearer fallback')

process.stdout.write('ok\n')
