/**
 * Import TACO (Tabela Brasileira de Composição de Alimentos) data into Supabase.
 * Usage: cd to worktree and run: npx tsx scripts/import-taco.ts
 *
 * Requires scripts/taco-data.json (downloaded from marcelosanto/tabela_taco on GitHub).
 * Source format: each item has id, description, category, energy_kcal, protein_g,
 * lipid_g, carbohydrate_g, fiber_g — numeric values or "NA"/"Tr"/"*" strings.
 *
 * Reads env vars from ../.env.local (project root).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'

// Load .env.local from project root.
// Worktree is at .worktrees/nutrition-food-library — root is two levels up.
config({ path: join(process.cwd(), '..', '..', '.env.local') })
// Also try one level up and current dir as fallbacks
config({ path: join(process.cwd(), '..', '.env.local') })
config({ path: join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  console.error('Looked in: ../.env.local and .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Real JSON format from marcelosanto/tabela_taco
type TacoItem = {
  id: number
  description: string
  category: string
  energy_kcal: number | string | null
  protein_g: number | string | null
  lipid_g: number | string | null
  carbohydrate_g: number | string | null
  fiber_g: number | string | null
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '' || value === 'NA' || value === '*') {
    return null
  }
  // "Tr" (traços/trace) → 0
  if (value === 'Tr') return 0
  const n = Number(value)
  return isNaN(n) ? null : n
}

function normalizeSlug(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 120)
}

function buildAliases(description: string): string[] {
  const normalized = description
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const aliases = new Set<string>()
  aliases.add(normalized)
  const firstWord = normalized.split(/[,\s]/)[0]
  if (firstWord && firstWord.length > 2) aliases.add(firstWord)
  const withoutPrep = normalized
    .replace(/,?\s*(cru|cozido|grelhado|assado|frito|cozida|grelhada|assada|frita)(\s|$)/gi, '')
    .trim()
  if (withoutPrep && withoutPrep !== normalized) aliases.add(withoutPrep)
  return Array.from(aliases)
}

function mapCategory(raw: string): string {
  const c = (raw || '').toLowerCase()
  if (c.includes('cereal')) return 'carboidratos'
  if (c.includes('legum')) return 'carboidratos'
  if (c.includes('carne') || c.includes('aves')) return 'proteinas'
  if (c.includes('peixe') || c.includes('pescado') || c.includes('frutos do mar')) return 'proteinas'
  if (c.includes('ovos')) return 'proteinas'
  if (c.includes('leite') || c.includes('laticín')) return 'laticinios'
  if (c.includes('fruta')) return 'frutas'
  if (c.includes('verdura') || c.includes('hortal')) return 'vegetais'
  if (c.includes('óleo') || c.includes('gordura')) return 'gorduras'
  if (c.includes('bebida')) return 'bebidas'
  if (c.includes('nozes') || c.includes('sementes')) return 'gorduras'
  return 'outros'
}

async function main() {
  const dataPath = join(process.cwd(), 'scripts', 'taco-data.json')
  const raw = readFileSync(dataPath, 'utf-8')
  const items: TacoItem[] = JSON.parse(raw)

  console.log(`Loaded ${items.length} TACO items.`)

  const rows = items
    .map((item) => {
      const kcal = toNumber(item.energy_kcal)
      // Skip items with no caloric value
      if (kcal === null) return null
      return {
        food_key: normalizeSlug(item.description),
        name: item.description,
        aliases: buildAliases(item.description),
        category: mapCategory(item.category),
        kcal_per_100g: kcal,
        protein: toNumber(item.protein_g) ?? 0,
        carbs: toNumber(item.carbohydrate_g) ?? 0,
        fat: toNumber(item.lipid_g) ?? 0,
        fiber: toNumber(item.fiber_g),
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  console.log(`Importing ${rows.length} items (${items.length - rows.length} skipped — no kcal)...`)

  const BATCH_SIZE = 100
  let inserted = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('foods_taco')
      .upsert(batch, { onConflict: 'food_key' })

    if (error) {
      console.error(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message)
    } else {
      inserted += batch.length
      process.stdout.write(`\r  ${inserted}/${rows.length}`)
    }
  }

  console.log(`\nDone. ${inserted} items imported into foods_taco.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
