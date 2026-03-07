const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations')
const migrationFiles = fs.readdirSync(migrationDir).filter((f) => f.includes('delete_teacher_cascade'))
assert.ok(migrationFiles.length > 0)

const latestMigration = migrationFiles.sort().at(-1)
const sql = fs.readFileSync(path.join(migrationDir, latestMigration), 'utf8')

assert.ok(sql.includes('delete_teacher_cascade'))
assert.ok(sql.includes('audit_events'))
assert.ok(sql.includes('workout_checkins'))
assert.ok(sql.includes('exercise_execution_submissions'))

const routePathTs = path.join(__dirname, '..', 'src', 'app', 'api', 'admin', 'teachers', 'delete', 'route.ts')
const routePathNoExt = path.join(__dirname, '..', 'src', 'app', 'api', 'admin', 'teachers', 'delete', 'route')
const finalRoutePath = fs.existsSync(routePathTs) ? routePathTs : routePathNoExt
const routeText = fs.readFileSync(finalRoutePath, 'utf8')
assert.ok(routeText.includes('delete_teacher_cascade'))

process.stdout.write('ok\n')

