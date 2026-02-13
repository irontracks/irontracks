const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')
const srcRoot = path.join(repoRoot, 'src')

const invalid = []

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.next' || ent.name === '.git') continue
      walk(full)
      continue
    }
    if (!ent.isFile()) continue
    const name = ent.name
    if (/^route \d+\.(ts|tsx|js|jsx)$/.test(name)) invalid.push(full)
    if (/^page \d+(\.(ts|tsx|js|jsx))?$/.test(name)) invalid.push(full)
    if (/^offlineSync \d+$/.test(name)) invalid.push(full)
    if (/^kcalClient \d+$/.test(name)) invalid.push(full)
    if (name === 'route' || /^route \d+$/.test(name)) invalid.push(full)
  }
}

walk(srcRoot)

assert.equal(
  invalid.length,
  0,
  `Found duplicate-style filenames in src:\n${invalid.map((p) => path.relative(repoRoot, p)).join('\n')}`,
)

process.stdout.write('ok\n')
