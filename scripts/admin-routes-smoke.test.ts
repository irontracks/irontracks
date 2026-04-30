const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const entitlementRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'vip', 'entitlement', 'route.ts')
assert.ok(fs.existsSync(entitlementRoute), 'admin entitlement route missing')
const entitlementText = fs.readFileSync(entitlementRoute, 'utf8')
assert.ok(entitlementText.includes('requireRoleOrBearer'), 'admin entitlement route must require admin role with bearer fallback')
assert.ok(entitlementText.includes("['admin']"), 'admin entitlement route must restrict to admin role')

const deleteTeacherRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'teachers', 'delete', 'route.ts')
assert.ok(fs.existsSync(deleteTeacherRoute), 'teachers/delete route missing')
const deleteTeacherText = fs.readFileSync(deleteTeacherRoute, 'utf8')
assert.ok(deleteTeacherText.includes('requireRoleOrBearer'), 'teachers/delete should support bearer fallback')

// ── Recurring "students" bug guard ─────────────────────────────────────────
// Two errors kept regressing because every admin route reinvented student
// lookup:
//   1. "null value in column 'name' of relation 'students'" — INSERT path
//      forgot to fill `name` (NOT NULL).
//   2. "student_not_found" — AdminUser.id is "pending_<uuid>" (profile
//      fallback) and the route only knew how to match students.id.
//
// Both must go through src/utils/admin/resolveStudent.ts, which:
//   - strips the "pending_" prefix
//   - falls back across id → user_id → email
//   - auto-creates a `students` row with a guaranteed non-null `name`
//     derived from display_name → email local-part → email → "Aluno".
//
// If you delete or bypass the helper, this test fails and the bug returns.

const resolveStudentHelper = path.join(repoRoot, 'src', 'utils', 'admin', 'resolveStudent.ts')
assert.ok(fs.existsSync(resolveStudentHelper), 'resolveStudent helper missing — recurring students bug guard')
const resolveStudentText = fs.readFileSync(resolveStudentHelper, 'utf8')
assert.ok(resolveStudentText.includes('unwrapPendingId'), 'resolveStudent must export unwrapPendingId to handle "pending_<uuid>" AdminUser ids')
assert.ok(resolveStudentText.includes("'pending_'"), 'resolveStudent must strip the "pending_" prefix')
assert.ok(/name:\s*deriveName\(/.test(resolveStudentText), 'resolveStudent INSERT must use deriveName to guarantee non-null name')
assert.ok(/return 'Aluno'/.test(resolveStudentText), 'deriveName must have a final non-empty fallback')

const studentStatusRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'students', 'status', 'route.ts')
const studentStatusText = fs.readFileSync(studentStatusRoute, 'utf8')
assert.ok(studentStatusText.includes('resolveStudentRow'), 'students/status must use the shared resolveStudentRow helper')
assert.ok(!/eq\('id',\s*id\)/.test(studentStatusText), 'students/status must not do raw eq("id", id) lookup — use resolveStudentRow')

const assignTeacherRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'students', 'assign-teacher', 'route.ts')
const assignTeacherText = fs.readFileSync(assignTeacherRoute, 'utf8')
assert.ok(assignTeacherText.includes('resolveStudentRow'), 'students/assign-teacher must use the shared resolveStudentRow helper')
assert.ok(!/from\('students'\)\s*\.insert\(\s*\{\s*email/.test(assignTeacherText), 'students/assign-teacher must not INSERT directly — use resolveStudentRow which guarantees name is filled')

process.stdout.write('ok\n')

