const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')
const p = path.join(repoRoot, 'src', 'app', 'auth', 'login', 'route.ts')
assert.ok(fs.existsSync(p), 'auth/login route missing')

const text = fs.readFileSync(p, 'utf8')
assert.ok(text.includes('IRONTRACKS_PUBLIC_ORIGIN') || text.includes('NEXT_PUBLIC_APP_URL'), 'auth/login should use env public origin')
assert.ok(text.includes('missing_public_origin'), 'auth/login should fail closed when public origin missing')

process.stdout.write('ok\n')

