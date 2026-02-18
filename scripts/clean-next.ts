import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const nextDir = path.join(root, '.next')

try {
  fs.rmSync(nextDir, { recursive: true, force: true })
} catch {}

