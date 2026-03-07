/**
 * fix-lib-trivials.ts
 * Script para corrigir padrões simples em lib/ e utils/
 * 
 * Como usar:
 * npx tsx scripts/fix-lib-trivials.ts
 * 
 * O que ele faz:
 * - let json: any = null → let json: unknown = null
 * - const g: any = globalThis → const g = globalThis as Record<string, unknown>
 * - Impacto estimado: ~5 correções
 */

import fs from 'fs'
import path from 'path'

const SRC = path.join(process.cwd(), 'src')
let totalFixed = 0
let filesFixed = 0

const REPLACEMENTS: Array<[RegExp, string]> = [
  // let json: any = null → let json: unknown = null
  [/\blet\s+(\w+):\s*any\s*=\s*null\b/g, 'let $1: unknown = null'],
  
  // const g: any = globalThis → const g = globalThis as Record<string, unknown>
  [/\bconst\s+(\w+):\s*any\s*=\s*globalThis\b/g, 'const $1 = globalThis as Record<string, unknown>'],
  
  // const g: any = window → const g = window (remove tipo desnecessário)
  [/\bconst\s+(\w+):\s*any\s*=\s*(window|document)\b/g, 'const $1 = $2'],
]

function walk(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) {
      continue
    }
    
    // Só aplicar em lib/ e utils/ (mais conservador)
    const relativePath = fullPath.replace(SRC + '/', '')
    if (!relativePath.startsWith('lib/') && !relativePath.startsWith('utils/')) {
      continue
    }

    const original = fs.readFileSync(fullPath, 'utf-8')
    let fixed = original
    let count = 0

    for (const [pattern, replacement] of REPLACEMENTS) {
      const matches = fixed.match(pattern)
      if (matches) {
        count += matches.length
      }
      fixed = fixed.replace(pattern, replacement)
    }

    if (fixed !== original) {
      fs.writeFileSync(fullPath, fixed, 'utf-8')
      totalFixed += count
      filesFixed++
      console.log(`  ✅ ${relativePath} (${count})`)
    }
  }
}

console.log('🔧 Corrigindo padrões triviais em lib/ e utils/...\n')
walk(SRC)
console.log(`\n✅ ${totalFixed} substituições em ${filesFixed} arquivos`)
console.log('\n⚠️  Execute: npx tsc --noEmit')
