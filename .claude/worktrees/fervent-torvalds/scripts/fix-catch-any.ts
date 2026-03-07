import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

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
    const fixed = original.replace(/} catch \((\w+): any\)/g, '} catch ($1)')

    if (fixed !== original) {
      fs.writeFileSync(full, fixed, 'utf-8')
      const count = (original.match(/} catch \(\w+: any\)/g) || []).length
      totalFixed += count
      filesFixed++
      console.log(`  ✅ ${full.replace(SRC, '')} (${count})`)
    }
  }
}

walk(SRC)
console.log(`\nTotal: ${totalFixed} catch(e: any) → catch(e) em ${filesFixed} arquivos`)
