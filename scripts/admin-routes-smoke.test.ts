const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const entitlementRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'vip', 'entitlement', 'route.ts')
assert.ok(fs.existsSync(entitlementRoute), 'admin entitlement route missing')
const entitlementText = fs.readFileSync(entitlementRoute, 'utf8')
assert.ok(entitlementText.includes('requireRoleOrBearer'), 'admin entitlement route must use requireRoleOrBearer')
assert.ok(entitlementText.includes("['admin']"), 'admin entitlement route must require admin role')

const deleteTeacherRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'teachers', 'delete', 'route.ts')
assert.ok(fs.existsSync(deleteTeacherRoute), 'teachers/delete route missing')
const deleteTeacherText = fs.readFileSync(deleteTeacherRoute, 'utf8')
assert.ok(deleteTeacherText.includes('requireRoleOrBearer'), 'teachers/delete should use requireRoleOrBearer')

process.stdout.write('ok\n')

