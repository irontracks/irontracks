/**
 * fix-any-arrays.ts
 * Script para substituir any[] por unknown[] automaticamente
 * 
 * Como usar:
 * npx tsx scripts/fix-any-arrays.ts
 * 
 * O que ele faz:
 * - Procura padrões como: const lista: any[] = []
 * - Substitui por: const lista: unknown[] = []
 * - Impacto estimado: ~30 correções
 */

import fs from 'fs'
import path from 'path'

const SRC = path.join(process.cwd(), 'src')
let totalFixed = 0
let filesFixed = 0

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
    
    const original = fs.readFileSync(fullPath, 'utf-8')
    
    // Padrão: const/let X: any[] = []
    const fixed = original.replace(
      /\b(const|let)\s+(\w+):\s*any\[\]\s*=\s*\[\]/g,
      '$1 $2: unknown[] = []'
    )
    
    if (fixed !== original) {
      const matches = original.match(/\b(const|let)\s+\w+:\s*any\[\]\s*=\s*\[\]/g)
      const count = matches ? matches.length : 0
      
      fs.writeFileSync(fullPath, fixed, 'utf-8')
      totalFixed += count
      filesFixed++
      
      const relativePath = fullPath.replace(SRC + '/', '')
      console.log(`  ✅ ${relativePath} (${count})`)
    }
  }
}

console.log('🔧 Substituindo any[] em todo o projeto...\n')
walk(SRC)
console.log(`\n✅ ${totalFixed} substituições em ${filesFixed} arquivos`)
console.log('\n⚠️  Execute: npx tsc --noEmit')
