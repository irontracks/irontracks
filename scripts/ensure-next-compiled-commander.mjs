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

async function main() {
  const commanderDir = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'compiled', 'commander')
  const commanderIndex = path.join(commanderDir, 'index.js')

  if (await fileExists(commanderIndex)) return

  await fs.mkdir(commanderDir, { recursive: true })
  await fs.writeFile(commanderIndex, "module.exports = require('commander')\n", 'utf8')
}

main().catch(() => {
  process.exit(0)
})
