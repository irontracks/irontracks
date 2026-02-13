import fs from 'node:fs/promises'
import path from 'node:path'

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function listInvalidRouteFiles(appDir) {
  const invalid = []

  const walk = async (dir) => {
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.next' || ent.name === '.git') continue
        await walk(full)
        continue
      }
      if (!ent.isFile()) continue

      const name = ent.name
      if (name === 'route') {
        invalid.push(full)
        continue
      }
      if (/^route \d+$/.test(name)) {
        invalid.push(full)
        continue
      }
      if (/^route \d+\.(ts|tsx|js|jsx)$/.test(name)) {
        invalid.push(full)
      }
    }
  }

  await walk(appDir)
  return invalid
}

async function main() {
  const commanderDir = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'compiled', 'commander')
  const commanderIndex = path.join(commanderDir, 'index.js')

  const appDir = path.join(process.cwd(), 'src', 'app')
  const invalidRoutes = await listInvalidRouteFiles(appDir)
  if (invalidRoutes.length) {
    const rel = invalidRoutes.map((p) => path.relative(process.cwd(), p))
    throw new Error(`INVALID_ROUTE_FILES:\n${rel.join('\n')}\n\nRename to route.ts (or remove) to avoid Next.js route issues.`)
  }

  if (await fileExists(commanderIndex)) return

  await fs.mkdir(commanderDir, { recursive: true })
  await fs.writeFile(commanderIndex, "module.exports = require('commander')\n", 'utf8')
}

main().catch((err) => {
  const msg = String(err?.message || '')
  if (msg.startsWith('INVALID_ROUTE_FILES:')) {
    console.error(msg)
    process.exit(1)
  }
  process.exit(0)
})
