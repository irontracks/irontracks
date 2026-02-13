const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const loginRoute = path.join(repoRoot, 'src', 'app', 'auth', 'login', 'route.ts')
const callbackRoute = path.join(repoRoot, 'src', 'app', 'auth', 'callback', 'route.ts')

assert.ok(fs.existsSync(loginRoute), 'auth/login/route.ts missing')
assert.ok(fs.existsSync(callbackRoute), 'auth/callback/route.ts missing')

const loginText = fs.readFileSync(loginRoute, 'utf8')
const callbackText = fs.readFileSync(callbackRoute, 'utf8')

assert.ok(loginText.includes('resolvePublicOrigin'), 'auth/login should use resolvePublicOrigin')
assert.ok(callbackText.includes('resolvePublicOrigin'), 'auth/callback should use resolvePublicOrigin')
assert.ok(loginText.includes('IRONTRACKS_PUBLIC_ORIGIN') && loginText.includes('NEXT_PUBLIC_APP_URL'), 'auth/login should prioritize env origin')
assert.ok(callbackText.includes('IRONTRACKS_PUBLIC_ORIGIN') && callbackText.includes('NEXT_PUBLIC_APP_URL'), 'auth/callback should prioritize env origin')

process.stdout.write('ok\n')
