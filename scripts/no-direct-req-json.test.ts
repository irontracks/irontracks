const assert = require('node:assert/strict')
const cp = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')
const srcRoot = path.join(repoRoot, 'src')

const allowed = new Set([
  path.join(srcRoot, 'utils', 'zod.ts'),
])

const walk = (dir, out) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else out.push(p)
  }
}

const files = []
walk(srcRoot, files)

const tracked = new Set(
  cp
    .execSync('git ls-files src', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .map((p) => path.join(repoRoot, p)),
)

const candidates = files.filter((p) => tracked.has(p) && (p.endsWith('.ts') || p.endsWith('.tsx')))

const re = /await\s+(req|request)\.json\s*\(/g
const offenders = []

for (const p of candidates) {
  if (allowed.has(p)) continue
  const text = fs.readFileSync(p, 'utf8')
  if (re.test(text)) offenders.push(path.relative(repoRoot, p))
}

assert.equal(offenders.length, 0, `Found direct req.json() usage:\n${offenders.join('\n')}`)

process.stdout.write('ok\n')
