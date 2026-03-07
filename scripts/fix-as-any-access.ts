import fs from 'fs'
import path from 'path'

const SRC = path.join(process.cwd(), 'src')
let totalFixed = 0
let filesFixed = 0

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue

    const original = fs.readFileSync(full, 'utf-8')
    let fixed = original

    fixed = fixed.replace(/\((\w+) as any\)\?\./g, '($1 as Record<string, unknown>)?.')
    fixed = fixed.replace(/\((\w+) as any\)\./g, '($1 as Record<string, unknown>).')

    if (fixed !== original) {
      const count = (original.match(/\(\w+ as any\)[?.]/g) ?? []).length
      fs.writeFileSync(full, fixed, 'utf-8')
      totalFixed += count
      filesFixed++
      console.log(`  ✅ ${full.replace(SRC, '')} (${count})`)
    }
  }
}

walk(SRC)
console.log(`\nTotal: ${totalFixed} substituições em ${filesFixed} arquivos`)
