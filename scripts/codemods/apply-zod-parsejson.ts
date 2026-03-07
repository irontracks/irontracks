import fs from 'node:fs'
import path from 'node:path'

type Target = { abs: string; requestVar: 'req' | 'request' }

const repoRoot = process.cwd()
const appRoot = path.join(repoRoot, 'src', 'app')

const walk = (dir: string, out: string[]) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (p.endsWith(`${path.sep}route.ts`)) out.push(p)
  }
}

const findTargets = (): Target[] => {
  const files: string[] = []
  walk(appRoot, files)

  const re = /await\s+(req|request)\.json\s*\(\)/g
  const targets: Target[] = []

  for (const abs of files) {
    const text = fs.readFileSync(abs, 'utf8')
    if (text.includes('parseJsonBody')) continue
    let m: RegExpExecArray | null = null
    let found: 'req' | 'request' | null = null
    while ((m = re.exec(text))) {
      const v = m[1] as 'req' | 'request'
      if (v === 'req' || v === 'request') {
        found = v
        break
      }
    }
    if (!found) continue
    targets.push({ abs, requestVar: found })
  }
  return targets
}

const ensureImports = (text: string) => {
  let out = text

  if (!out.includes("from 'zod'")) {
    out = out.replace(
      /import\s+\{\s*NextResponse\s*\}\s+from\s+'next\/server'\s*\n/,
      (m) => `${m}import { z } from 'zod'\n`,
    )
  }

  if (!out.includes("from '@/utils/zod'")) {
    out = out.replace(
      /import\s+\{\s*NextResponse\s*\}\s+from\s+'next\/server'\s*\n/,
      (m) => `${m}import { parseJsonBody } from '@/utils/zod'\n`,
    )
  }

  return out
}

const ensureSchema = (text: string) => {
  if (text.includes('const ZodBodySchema')) return text

  const insertAfter = (() => {
    const dynamicIdx = text.indexOf("export const dynamic")
    if (dynamicIdx !== -1) {
      const lineEnd = text.indexOf('\n', dynamicIdx)
      return lineEnd !== -1 ? lineEnd + 1 : -1
    }
    const runtimeIdx = text.indexOf("export const runtime")
    if (runtimeIdx !== -1) {
      const lineEnd = text.indexOf('\n', runtimeIdx)
      return lineEnd !== -1 ? lineEnd + 1 : -1
    }
    return -1
  })()

  if (insertAfter === -1) return text

  const snippet = `\nconst ZodBodySchema = z.object({}).passthrough()\n`
  return text.slice(0, insertAfter) + snippet + text.slice(insertAfter)
}

const replaceBodyParse = (text: string, requestVar: 'req' | 'request') => {
  const lines = text.split('\n')
  const out: string[] = []

  const bodyLineRe = new RegExp(String.raw`^\s*const\s+body[^=]*=\s*await\s+${requestVar}\.json\s*\(\)[^;]*;?\s*$`)
  const bodyLineAnyRe = new RegExp(String.raw`^\s*let\s+body[^=]*=\s*await\s+${requestVar}\.json\s*\(\)[^;]*;?\s*$`)

  for (const line of lines) {
    if (bodyLineRe.test(line) || bodyLineAnyRe.test(line)) {
      const indent = line.match(/^\s*/)?.[0] ?? ''
      out.push(`${indent}const parsedBody = await parseJsonBody(${requestVar}, ZodBodySchema)`)
      out.push(`${indent}if (parsedBody.response) return parsedBody.response`)
      out.push(`${indent}const body = parsedBody.data!`)
      continue
    }
    out.push(line)
  }

  return out.join('\n')
}

const main = () => {
  const targets = findTargets()
  const changed: string[] = []

  for (const t of targets) {
    const before = fs.readFileSync(t.abs, 'utf8')
    let next = before
    next = ensureImports(next)
    next = ensureSchema(next)
    next = replaceBodyParse(next, t.requestVar)

    if (next !== before) {
      fs.writeFileSync(t.abs, next, 'utf8')
      changed.push(path.relative(repoRoot, t.abs))
    }
  }

  process.stdout.write(`updated ${changed.length} files\n`)
  for (const f of changed) process.stdout.write(`${f}\n`)
}

main()

