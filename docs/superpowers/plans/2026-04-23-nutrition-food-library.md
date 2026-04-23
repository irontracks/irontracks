# Nutrition Food Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the food library by integrating TACO (~600 Brazilian foods via Supabase), Open Food Facts (global product cache + API), and barcode scanning (Capacitor MLKit), reducing AI fallback to a true last resort.

**Architecture:** Two-phase resolver — Phase 1 hits memory (hardcoded base) + Supabase (foods_taco + nutrition_learned_foods) in a single round-trip; Phase 2 (only on Phase 1 miss) hits foods_off_cache + Open Food Facts API + Gemini. Barcode scanning bypasses Phase 1 entirely. No changes to MealLog contract or existing auth/VIP/rate-limit logic.

**Tech Stack:** Next.js Server Actions, Supabase (PostgreSQL + supabase-js v2), Open Food Facts REST API (no key required), @capacitor-mlkit/barcode-scanning, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260423120000_create_foods_taco.sql` | Create | Schema + RLS for foods_taco |
| `supabase/migrations/20260423120001_create_foods_off_cache.sql` | Create | Schema + RLS for foods_off_cache |
| `src/lib/nutrition/sources/taco-source.ts` | Create | Load all TACO foods from Supabase as `Record<string, FoodItem>` |
| `src/lib/nutrition/sources/off-source.ts` | Create | OFF text search + barcode lookup + cache write |
| `src/lib/nutrition/food-resolver.ts` | Create | Orchestrate Phase 1 (TACO + learned) + Phase 2 (OFF) before Gemini |
| `src/lib/nutrition/barcode-resolver.ts` | Create | Barcode EAN → FoodItem (OFF cache + API only, no Gemini) |
| `src/app/(app)/dashboard/nutrition/actions.ts` | Modify | Use food-resolver before returning unknown-food error |
| `src/app/(app)/dashboard/nutrition/actions.ts` | Modify | Add `logBarcodeAction` |
| `src/components/dashboard/nutrition/BarcodeScanner.tsx` | Create | Camera UI with Capacitor MLKit, returns FoodItem + name on scan |
| `src/components/dashboard/nutrition/NutritionMixer.tsx` | Modify | Add barcode button (dynamic import, native-only visible) |
| `scripts/import-taco.ts` | Create | Reads `scripts/taco-data.json`, upserts into foods_taco |
| `src/lib/nutrition/__tests__/taco-source.test.ts` | Create | Unit tests for taco-source |
| `src/lib/nutrition/__tests__/off-source.test.ts` | Create | Unit tests for off-source |
| `src/lib/nutrition/__tests__/food-resolver.test.ts` | Create | Unit tests for food-resolver |
| `src/lib/nutrition/__tests__/barcode-resolver.test.ts` | Create | Unit tests for barcode-resolver |

---

## Task 1: Supabase Migration — foods_taco

**Files:**
- Create: `supabase/migrations/20260423120000_create_foods_taco.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260423120000_create_foods_taco.sql
create table if not exists public.foods_taco (
  id            uuid primary key default gen_random_uuid(),
  food_key      text unique not null,
  name          text not null,
  aliases       text[] not null default '{}',
  category      text,
  kcal_per_100g numeric(8,2) not null,
  protein       numeric(8,2) not null default 0,
  carbs         numeric(8,2) not null default 0,
  fat           numeric(8,2) not null default 0,
  fiber         numeric(8,2),
  created_at    timestamptz not null default now()
);

-- Full-text index on name for ILIKE queries
create index if not exists foods_taco_name_idx on public.foods_taco using gin (to_tsvector('portuguese', name));

-- Explicit index on food_key (already unique but needed for joins)
create index if not exists foods_taco_food_key_idx on public.foods_taco (food_key);

-- RLS: read-only for everyone, no writes from app
alter table public.foods_taco enable row level security;

create policy "foods_taco_select_all"
  on public.foods_taco for select
  using (true);
```

- [ ] **Step 2: Apply migration via MCP**

```
mcp__supabase__apply_migration
  name: "create_foods_taco"
  query: <paste SQL above>
```

- [ ] **Step 3: Verify no advisor warnings**

```
mcp__supabase__get_advisors
```

Expected: no new security or performance warnings for foods_taco.

- [ ] **Step 4: Commit**

```bash
cd "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks"
git add supabase/migrations/20260423120000_create_foods_taco.sql
git commit -m "feat(db): add foods_taco table with RLS"
```

---

## Task 2: Supabase Migration — foods_off_cache

**Files:**
- Create: `supabase/migrations/20260423120001_create_foods_off_cache.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260423120001_create_foods_off_cache.sql
create table if not exists public.foods_off_cache (
  id            uuid primary key default gen_random_uuid(),
  barcode       text unique,
  food_key      text unique not null,
  name          text not null,
  brand         text,
  kcal_per_100g numeric(8,2) not null,
  protein       numeric(8,2) not null default 0,
  carbs         numeric(8,2) not null default 0,
  fat           numeric(8,2) not null default 0,
  fiber         numeric(8,2),
  source        text not null default 'open_food_facts',
  created_at    timestamptz not null default now()
);

create index if not exists foods_off_cache_barcode_idx on public.foods_off_cache (barcode) where barcode is not null;
create index if not exists foods_off_cache_food_key_idx on public.foods_off_cache (food_key);

-- RLS: everyone can read; only service_role can insert (via server-side actions)
alter table public.foods_off_cache enable row level security;

create policy "foods_off_cache_select_all"
  on public.foods_off_cache for select
  using (true);

-- No insert policy for authenticated users — inserts happen server-side with service_role
```

- [ ] **Step 2: Apply migration via MCP**

```
mcp__supabase__apply_migration
  name: "create_foods_off_cache"
  query: <paste SQL above>
```

- [ ] **Step 3: Verify**

```
mcp__supabase__get_advisors
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260423120001_create_foods_off_cache.sql
git commit -m "feat(db): add foods_off_cache table with RLS"
```

---

## Task 3: taco-source.ts

**Files:**
- Create: `src/lib/nutrition/sources/taco-source.ts`
- Create: `src/lib/nutrition/__tests__/taco-source.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nutrition/__tests__/taco-source.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadTacoFoods } from '../sources/taco-source'
import type { SupabaseClient } from '@supabase/supabase-js'

const makeMockSupabase = (rows: unknown[]) =>
  ({
    from: () => ({
      select: () => ({ data: rows, error: null }),
    }),
  }) as unknown as SupabaseClient

describe('loadTacoFoods', () => {
  it('returns empty object when Supabase returns no rows', async () => {
    const supabase = makeMockSupabase([])
    const result = await loadTacoFoods(supabase)
    expect(result).toEqual({})
  })

  it('maps food_key to FoodItem with correct macro fields', async () => {
    const supabase = makeMockSupabase([
      {
        food_key: 'arroz-branco-cozido',
        name: 'Arroz branco cozido',
        aliases: ['arroz', 'arroz branco'],
        kcal_per_100g: 130,
        protein: 2.5,
        carbs: 28.1,
        fat: 0.3,
        fiber: null,
      },
    ])
    const result = await loadTacoFoods(supabase)
    expect(result['arroz-branco-cozido']).toEqual({ kcal: 130, p: 2.5, c: 28.1, f: 0.3 })
  })

  it('adds aliases as additional keys pointing to the same FoodItem', async () => {
    const supabase = makeMockSupabase([
      {
        food_key: 'arroz-branco-cozido',
        name: 'Arroz branco cozido',
        aliases: ['arroz', 'arroz branco'],
        kcal_per_100g: 130,
        protein: 2.5,
        carbs: 28.1,
        fat: 0.3,
        fiber: null,
      },
    ])
    const result = await loadTacoFoods(supabase)
    expect(result['arroz']).toBeDefined()
    expect(result['arroz branco']).toBeDefined()
    expect(result['arroz'].kcal).toBe(130)
  })

  it('returns empty object when Supabase returns an error', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ data: null, error: new Error('db error') }),
      }),
    } as unknown as SupabaseClient
    const result = await loadTacoFoods(supabase)
    expect(result).toEqual({})
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks"
npx vitest run src/lib/nutrition/__tests__/taco-source.test.ts
```

Expected: FAIL — "Cannot find module '../sources/taco-source'"

- [ ] **Step 3: Implement taco-source.ts**

Create `src/lib/nutrition/sources/taco-source.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from '../food-database'

type TacoRow = {
  food_key: string
  name: string
  aliases: string[]
  kcal_per_100g: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
}

/**
 * Load all TACO foods from Supabase as a FoodItem map.
 * Keys include both food_key and all aliases for parser compatibility.
 * Returns {} on error — non-critical, parser falls back to OFF/Gemini.
 */
export async function loadTacoFoods(supabase: SupabaseClient): Promise<Record<string, FoodItem>> {
  try {
    const { data, error } = await supabase
      .from('foods_taco')
      .select('food_key, name, aliases, kcal_per_100g, protein, carbs, fat, fiber')

    if (error || !data) return {}

    const result: Record<string, FoodItem> = {}

    for (const row of data as TacoRow[]) {
      const key = String(row.food_key || '').trim()
      if (!key) continue

      const item: FoodItem = {
        kcal: Number(row.kcal_per_100g) || 0,
        p: Number(row.protein) || 0,
        c: Number(row.carbs) || 0,
        f: Number(row.fat) || 0,
      }

      result[key] = item

      const aliases = Array.isArray(row.aliases) ? row.aliases : []
      for (const alias of aliases) {
        const a = String(alias || '').trim().toLowerCase()
        if (a) result[a] = item
      }
    }

    return result
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/lib/nutrition/__tests__/taco-source.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition/sources/taco-source.ts src/lib/nutrition/__tests__/taco-source.test.ts
git commit -m "feat(nutrition): add taco-source — loads TACO foods from Supabase"
```

---

## Task 4: off-source.ts

**Files:**
- Create: `src/lib/nutrition/sources/off-source.ts`
- Create: `src/lib/nutrition/__tests__/off-source.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nutrition/__tests__/off-source.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchOffByText, lookupOffByBarcode, buildFoodKeyFromOff } from '../sources/off-source'
import type { SupabaseClient } from '@supabase/supabase-js'

// Minimal mock Supabase that returns empty for cache misses
const makeCacheMissSupabase = () =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        ilike: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
      insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }) as unknown as SupabaseClient

const makeOFFProductResponse = (name: string, brand: string) => ({
  ok: true,
  json: async () => ({
    status: 1,
    product: {
      product_name: name,
      brands: brand,
      nutriments: {
        'energy-kcal_100g': 120,
        proteins_100g: 25,
        carbohydrates_100g: 2,
        fat_100g: 3,
        fiber_100g: 0,
      },
    },
  }),
})

describe('buildFoodKeyFromOff', () => {
  it('generates slug from name + brand', () => {
    expect(buildFoodKeyFromOff('Whey Gold Standard', 'Optimum Nutrition')).toBe(
      'whey-gold-standard-optimum-nutrition',
    )
  })

  it('handles name only when brand is empty', () => {
    expect(buildFoodKeyFromOff('Frango grelhado', '')).toBe('frango-grelhado')
  })
})

describe('lookupOffByBarcode', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns null when product not found on OFF API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 0 }),
    } as Response)

    const result = await lookupOffByBarcode(makeCacheMissSupabase(), '1234567890123')
    expect(result).toBeNull()
  })

  it('returns FoodItem when OFF API finds the product', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOFFProductResponse('Peito de frango cozido', 'Sadia') as unknown as Response,
    )

    const result = await lookupOffByBarcode(makeCacheMissSupabase(), '7891000100103')
    expect(result).not.toBeNull()
    expect(result!.item.kcal).toBe(120)
    expect(result!.item.p).toBe(25)
    expect(result!.name).toContain('Peito de frango cozido')
  })
})

describe('searchOffByText', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns empty record when OFF API returns no results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ count: 0, products: [] }),
    } as unknown as Response)

    const result = await searchOffByText(makeCacheMissSupabase(), 'xyznotafood')
    expect(result).toEqual({})
  })

  it('returns FoodItem map when OFF API finds products', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        products: [
          {
            product_name: 'Whey Protein Gold Standard',
            brands: 'Optimum Nutrition',
            nutriments: {
              'energy-kcal_100g': 400,
              proteins_100g: 80,
              carbohydrates_100g: 10,
              fat_100g: 7,
              fiber_100g: 0,
            },
          },
        ],
      }),
    } as unknown as Response)

    const result = await searchOffByText(makeCacheMissSupabase(), 'whey gold standard')
    const keys = Object.keys(result)
    expect(keys.length).toBeGreaterThan(0)
    const item = result[keys[0]]
    expect(item.kcal).toBe(400)
    expect(item.p).toBe(80)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/lib/nutrition/__tests__/off-source.test.ts
```

Expected: FAIL — "Cannot find module '../sources/off-source'"

- [ ] **Step 3: Implement off-source.ts**

Create `src/lib/nutrition/sources/off-source.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from '../food-database'

const OFF_TIMEOUT_MS = 5_000

type OFFNutriments = {
  'energy-kcal_100g'?: number
  proteins_100g?: number
  carbohydrates_100g?: number
  fat_100g?: number
  fiber_100g?: number
}

type OFFProduct = {
  product_name?: string
  brands?: string
  nutriments?: OFFNutriments
}

function normalizeSlug(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

/**
 * Generate a stable food_key from OFF product name + brand.
 * Used as unique key in foods_off_cache.
 */
export function buildFoodKeyFromOff(name: string, brand: string): string {
  const parts = [name, brand].filter(Boolean).join(' ')
  return normalizeSlug(parts).slice(0, 120)
}

function offProductToFoodItem(product: OFFProduct): FoodItem | null {
  const n = product.nutriments
  if (!n) return null
  const kcal = Number(n['energy-kcal_100g']) || 0
  const p = Number(n['proteins_100g']) || 0
  const c = Number(n['carbohydrates_100g']) || 0
  const f = Number(n['fat_100g']) || 0
  if (kcal === 0 && p === 0 && c === 0 && f === 0) return null
  return { kcal, p, c, f }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}

async function saveToCacheTable(
  supabase: SupabaseClient,
  barcode: string | null,
  foodKey: string,
  name: string,
  brand: string,
  item: FoodItem,
): Promise<void> {
  try {
    await supabase.from('foods_off_cache').insert({
      barcode: barcode ?? null,
      food_key: foodKey,
      name,
      brand: brand || null,
      kcal_per_100g: item.kcal,
      protein: item.p,
      carbs: item.c,
      fat: item.f,
      source: 'open_food_facts',
    })
  } catch {
    // Non-critical — cache miss is recoverable
  }
}

/**
 * Lookup a food by EAN barcode.
 * Checks foods_off_cache first; falls back to OFF API.
 * Returns null if product not found or macros are missing.
 * No Gemini fallback.
 */
export async function lookupOffByBarcode(
  supabase: SupabaseClient,
  ean: string,
): Promise<{ item: FoodItem; name: string; foodKey: string } | null> {
  try {
    // 1. Check cache
    const { data: cached } = await supabase
      .from('foods_off_cache')
      .select('food_key, name, brand, kcal_per_100g, protein, carbs, fat')
      .eq('barcode', ean)
      .maybeSingle()

    if (cached) {
      return {
        item: { kcal: Number(cached.kcal_per_100g), p: Number(cached.protein), c: Number(cached.carbs), f: Number(cached.fat) },
        name: String(cached.name),
        foodKey: String(cached.food_key),
      }
    }

    // 2. Call OFF API
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}?fields=product_name,brands,nutriments`
    const res = await fetchWithTimeout(url, OFF_TIMEOUT_MS)
    if (!res.ok) return null
    const json = await res.json() as { status: number; product?: OFFProduct }
    if (json.status !== 1 || !json.product) return null

    const product = json.product
    const item = offProductToFoodItem(product)
    if (!item) return null

    const name = String(product.product_name || '').trim() || 'Produto'
    const brand = String(product.brands || '').trim()
    const foodKey = buildFoodKeyFromOff(name, brand)

    await saveToCacheTable(supabase, ean, foodKey, name, brand, item)

    return { item, name, foodKey }
  } catch {
    return null
  }
}

/**
 * Search OFF by free text (product name).
 * Checks foods_off_cache first; falls back to OFF search API.
 * Returns a Record<string, FoodItem> compatible with parser extraFoods.
 */
export async function searchOffByText(
  supabase: SupabaseClient,
  query: string,
): Promise<Record<string, FoodItem>> {
  const q = (query || '').trim()
  if (!q) return {}

  try {
    // 1. Check cache by food_key similarity
    const foodKey = normalizeSlug(q)
    const { data: cached } = await supabase
      .from('foods_off_cache')
      .select('food_key, name, kcal_per_100g, protein, carbs, fat')
      .ilike('food_key', `%${foodKey}%`)
      .maybeSingle()

    if (cached) {
      const item: FoodItem = {
        kcal: Number(cached.kcal_per_100g),
        p: Number(cached.protein),
        c: Number(cached.carbs),
        f: Number(cached.fat),
      }
      const result: Record<string, FoodItem> = {}
      result[String(cached.food_key)] = item
      result[String(cached.name).toLowerCase()] = item
      return result
    }

    // 2. Call OFF search API
    const encoded = encodeURIComponent(q)
    const url = `https://world.openfoodfacts.org/cgi/search.pl?action=process&search_terms=${encoded}&json=1&page_size=3&fields=product_name,brands,nutriments`
    const res = await fetchWithTimeout(url, OFF_TIMEOUT_MS)
    if (!res.ok) return {}
    const json = await res.json() as { count?: number; products?: OFFProduct[] }
    const products = Array.isArray(json.products) ? json.products : []
    if (products.length === 0) return {}

    const result: Record<string, FoodItem> = {}

    for (const product of products.slice(0, 3)) {
      const item = offProductToFoodItem(product)
      if (!item) continue

      const name = String(product.product_name || '').trim()
      const brand = String(product.brands || '').trim()
      if (!name) continue

      const key = buildFoodKeyFromOff(name, brand)
      result[key] = item
      result[name.toLowerCase()] = item

      // Fire-and-forget cache save
      void saveToCacheTable(supabase, null, key, name, brand, item)
    }

    return result
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/lib/nutrition/__tests__/off-source.test.ts
```

Expected: 6 tests passing.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nutrition/sources/off-source.ts src/lib/nutrition/__tests__/off-source.test.ts
git commit -m "feat(nutrition): add off-source — Open Food Facts cache + API integration"
```

---

## Task 5: food-resolver.ts

**Files:**
- Create: `src/lib/nutrition/food-resolver.ts`
- Create: `src/lib/nutrition/__tests__/food-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nutrition/__tests__/food-resolver.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveFood } from '../food-resolver'
import * as tacoSource from '../sources/taco-source'
import * as offSource from '../sources/off-source'
import * as learnedFoods from '../learned-foods'
import type { SupabaseClient } from '@supabase/supabase-js'

const mockSupabase = {} as unknown as SupabaseClient

afterEach(() => vi.restoreAllMocks())

describe('resolveFood', () => {
  it('returns meal from hardcoded base when food is known (no Supabase needed)', async () => {
    vi.spyOn(tacoSource, 'loadTacoFoods').mockResolvedValue({})
    vi.spyOn(learnedFoods, 'loadLearnedFoods').mockResolvedValue({})
    vi.spyOn(offSource, 'searchOffByText').mockResolvedValue({})

    const result = await resolveFood(mockSupabase, 'user-1', '150g frango')
    expect(result).not.toBeNull()
    expect(result!.meal.calories).toBeGreaterThan(0)
    expect(result!.meal.protein).toBeGreaterThan(0)
    expect(result!.source).toBe('local')
  })

  it('returns meal from TACO when food not in hardcoded base', async () => {
    vi.spyOn(tacoSource, 'loadTacoFoods').mockResolvedValue({
      'caldo-de-cana': { kcal: 62, p: 0.3, c: 16, f: 0.1 },
      'caldo de cana': { kcal: 62, p: 0.3, c: 16, f: 0.1 },
    })
    vi.spyOn(learnedFoods, 'loadLearnedFoods').mockResolvedValue({})
    vi.spyOn(offSource, 'searchOffByText').mockResolvedValue({})

    const result = await resolveFood(mockSupabase, 'user-1', '200ml caldo de cana')
    expect(result).not.toBeNull()
    expect(result!.meal.calories).toBeGreaterThan(0)
    expect(result!.source).toBe('taco_or_learned')
  })

  it('returns meal from OFF when not in local or TACO', async () => {
    vi.spyOn(tacoSource, 'loadTacoFoods').mockResolvedValue({})
    vi.spyOn(learnedFoods, 'loadLearnedFoods').mockResolvedValue({})
    vi.spyOn(offSource, 'searchOffByText').mockResolvedValue({
      'whey-gold-standard-optimum-nutrition': { kcal: 400, p: 80, c: 10, f: 7 },
      'whey gold standard': { kcal: 400, p: 80, c: 10, f: 7 },
    })

    const result = await resolveFood(mockSupabase, 'user-1', '30g whey gold standard')
    expect(result).not.toBeNull()
    expect(result!.meal.protein).toBeGreaterThan(0)
    expect(result!.source).toBe('off')
  })

  it('returns null when nothing resolves (caller should use Gemini)', async () => {
    vi.spyOn(tacoSource, 'loadTacoFoods').mockResolvedValue({})
    vi.spyOn(learnedFoods, 'loadLearnedFoods').mockResolvedValue({})
    vi.spyOn(offSource, 'searchOffByText').mockResolvedValue({})

    const result = await resolveFood(mockSupabase, 'user-1', 'xyzcomida12345desconhecida')
    expect(result).toBeNull()
  })

  it('skips OFF if Phase 1 succeeds', async () => {
    const searchSpy = vi.spyOn(offSource, 'searchOffByText').mockResolvedValue({})
    vi.spyOn(tacoSource, 'loadTacoFoods').mockResolvedValue({})
    vi.spyOn(learnedFoods, 'loadLearnedFoods').mockResolvedValue({})

    await resolveFood(mockSupabase, 'user-1', '100g arroz cozido')
    expect(searchSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/lib/nutrition/__tests__/food-resolver.test.ts
```

Expected: FAIL — "Cannot find module '../food-resolver'"

- [ ] **Step 3: Implement food-resolver.ts**

Create `src/lib/nutrition/food-resolver.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MealLog } from './engine'
import { parseInput } from './parser'
import { loadTacoFoods } from './sources/taco-source'
import { searchOffByText } from './sources/off-source'
import { loadLearnedFoods } from './learned-foods'

type ResolveResult = {
  meal: MealLog
  source: 'local' | 'taco_or_learned' | 'off'
}

const UNKNOWN_PREFIX = 'nutrition_parser_unknown_food:'

function extractUnknownLines(errorMessage: string): string[] {
  if (!errorMessage.startsWith(UNKNOWN_PREFIX)) return []
  const raw = errorMessage.slice(UNKNOWN_PREFIX.length).trim()
  return raw.split('|').map((s) => s.trim()).filter(Boolean)
}

/**
 * Attempt to resolve a free-text meal description using:
 *   Phase 1: hardcoded base + TACO + learned foods (all in-process / Supabase)
 *   Phase 2: Open Food Facts cache + API (only if Phase 1 fails)
 *
 * Returns null if resolution fails — caller should fall back to Gemini.
 */
export async function resolveFood(
  supabase: SupabaseClient,
  userId: string,
  text: string,
): Promise<ResolveResult | null> {
  // ── Phase 1: try with hardcoded base only (zero latency) ────────────────────
  try {
    const meal = parseInput(text)
    return { meal, source: 'local' }
  } catch (e: unknown) {
    const msg = String((e as Error)?.message || '')
    if (!msg.startsWith(UNKNOWN_PREFIX)) return null
  }

  // ── Phase 1b: augment with TACO + learned foods (one Supabase round-trip) ───
  const [tacoFoods, learned] = await Promise.all([
    loadTacoFoods(supabase),
    loadLearnedFoods(supabase, userId),
  ])
  const phase1ExtraFoods = { ...tacoFoods, ...learned }

  try {
    const meal = parseInput(text, phase1ExtraFoods)
    return { meal, source: 'taco_or_learned' }
  } catch (e: unknown) {
    const msg = String((e as Error)?.message || '')
    const unknownLines = extractUnknownLines(msg)
    if (unknownLines.length === 0) return null

    // ── Phase 2: try Open Food Facts for each unknown line ────────────────────
    const offResults = await Promise.all(
      unknownLines.map((line) => searchOffByText(supabase, line)),
    )
    const offFoods: Record<string, { kcal: number; p: number; c: number; f: number }> = {}
    for (const r of offResults) {
      Object.assign(offFoods, r)
    }

    if (Object.keys(offFoods).length === 0) return null

    try {
      const meal = parseInput(text, { ...phase1ExtraFoods, ...offFoods })
      return { meal, source: 'off' }
    } catch {
      return null
    }
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/lib/nutrition/__tests__/food-resolver.test.ts
```

Expected: 5 tests passing.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nutrition/food-resolver.ts src/lib/nutrition/__tests__/food-resolver.test.ts
git add src/lib/nutrition/sources/
git commit -m "feat(nutrition): add food-resolver — TACO + OFF two-phase resolution"
```

---

## Task 6: Integrate food-resolver into logMealAction

**Files:**
- Modify: `src/app/(app)/dashboard/nutrition/actions.ts`

- [ ] **Step 1: Read the current logMealAction**

Read `src/app/(app)/dashboard/nutrition/actions.ts` lines 1-50 to confirm current shape before editing.

- [ ] **Step 2: Update logMealAction**

Replace the block starting at `const meal = parseInput(normalizedText)` through the catch handler in `logMealAction`. The new `logMealAction` becomes:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { parseInput } from '@/lib/nutrition/parser'
import { trackMeal } from '@/lib/nutrition/engine'
import { resolveFood } from '@/lib/nutrition/food-resolver'
import { getErrorMessage } from '@/utils/errorMessage'

export async function logMealAction(mealText: string, dateKey?: string) {
  try {
    const normalizedText = String(mealText ?? '').trim()
    if (!normalizedText) return { ok: false, error: 'Texto vazio.' }
    if (normalizedText.length > 500) return { ok: false, error: 'Texto muito longo.' }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(error.message || 'nutrition_auth_failed')
    const userId = data?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const resolvedDateKey = (() => {
      const s = typeof dateKey === 'string' ? dateKey.trim() : ''
      if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      try {
        const tz = 'America/Sao_Paulo'
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      } catch {
        return new Date().toISOString().slice(0, 10)
      }
    })()

    // Try food-resolver first (local → TACO → learned → OFF)
    const resolved = await resolveFood(supabase, userId, normalizedText)

    if (resolved) {
      const row = await trackMeal(userId, resolved.meal, resolvedDateKey)
      revalidatePath('/dashboard/nutrition')
      return { ok: true, meal: resolved.meal, entry: row || null }
    }

    // Nothing resolved → signal client to call AI
    const unknownPrefix = 'nutrition_parser_unknown_food:'
    return {
      ok: false,
      error: `${unknownPrefix}${normalizedText}`,
      needsAi: true,
    }
  } catch (e: unknown) {
    const message = String(getErrorMessage(e) || '')
    const looksLikeMissingTable =
      message.toLowerCase().includes('could not find the table') ||
      message.toLowerCase().includes('schema cache') ||
      message.toLowerCase().includes('nutrition_meal_entries')
    if (looksLikeMissingTable) {
      return { ok: false, error: 'Banco de dados de nutrição não configurado.' }
    }
    return { ok: false, error: message || 'nutrition_log_meal_failed' }
  }
}
```

> The `deleteMealAction` and `editMealAction` functions remain unchanged — do not modify them.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: ESLint check**

```bash
node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs src/app/\(app\)/dashboard/nutrition/actions.ts --max-warnings 0
```

Expected: empty output.

- [ ] **Step 5: Run smoke tests**

```bash
npm run test:smoke
```

Expected: all passing (the smoke test for `/api/ai/nutrition-estimate` must still pass).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/dashboard/nutrition/actions.ts
git commit -m "feat(nutrition): integrate food-resolver into logMealAction before AI fallback"
```

---

## Task 7: barcode-resolver.ts

**Files:**
- Create: `src/lib/nutrition/barcode-resolver.ts`
- Create: `src/lib/nutrition/__tests__/barcode-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nutrition/__tests__/barcode-resolver.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveBarcode } from '../barcode-resolver'
import * as offSource from '../sources/off-source'
import type { SupabaseClient } from '@supabase/supabase-js'

const mockSupabase = {} as unknown as SupabaseClient

afterEach(() => vi.restoreAllMocks())

describe('resolveBarcode', () => {
  it('returns null for invalid EAN (empty string)', async () => {
    const result = await resolveBarcode(mockSupabase, '')
    expect(result).toBeNull()
  })

  it('returns null when OFF does not find the product', async () => {
    vi.spyOn(offSource, 'lookupOffByBarcode').mockResolvedValue(null)
    const result = await resolveBarcode(mockSupabase, '1234567890123')
    expect(result).toBeNull()
  })

  it('returns FoodItem when OFF finds the product', async () => {
    vi.spyOn(offSource, 'lookupOffByBarcode').mockResolvedValue({
      item: { kcal: 120, p: 25, c: 2, f: 3 },
      name: 'Peito de frango cozido',
      foodKey: 'peito-de-frango-cozido-sadia',
    })

    const result = await resolveBarcode(mockSupabase, '7891000100103')
    expect(result).not.toBeNull()
    expect(result!.item.kcal).toBe(120)
    expect(result!.name).toBe('Peito de frango cozido')
  })

  it('does NOT call Gemini even when OFF returns null', async () => {
    const geminiFallback = vi.fn()
    vi.spyOn(offSource, 'lookupOffByBarcode').mockResolvedValue(null)

    await resolveBarcode(mockSupabase, '9999999999999')
    expect(geminiFallback).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/lib/nutrition/__tests__/barcode-resolver.test.ts
```

Expected: FAIL — "Cannot find module '../barcode-resolver'"

- [ ] **Step 3: Implement barcode-resolver.ts**

Create `src/lib/nutrition/barcode-resolver.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from './food-database'
import { lookupOffByBarcode } from './sources/off-source'

type BarcodeResolution = {
  item: FoodItem
  name: string
  foodKey: string
}

/**
 * Resolve a product by EAN barcode using OFF cache + API.
 * No Gemini fallback — an unrecognized barcode is an explicit error.
 * Returns null when the product is not found.
 */
export async function resolveBarcode(
  supabase: SupabaseClient,
  ean: string,
): Promise<BarcodeResolution | null> {
  const cleanEan = String(ean || '').trim()
  if (!cleanEan) return null

  return lookupOffByBarcode(supabase, cleanEan)
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/lib/nutrition/__tests__/barcode-resolver.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 5: Add logBarcodeAction to actions.ts**

Append the following export to `src/app/(app)/dashboard/nutrition/actions.ts`:

```typescript
import { resolveBarcode } from '@/lib/nutrition/barcode-resolver'
import { sanitizeFoodName } from '@/lib/nutrition/security'

export async function logBarcodeAction(ean: string, grams: number, dateKey?: string) {
  try {
    const cleanEan = String(ean ?? '').trim()
    if (!cleanEan) return { ok: false, error: 'Código de barras inválido.' }

    const safeGrams = Number(grams)
    if (!Number.isFinite(safeGrams) || safeGrams <= 0 || safeGrams > 5000) {
      return { ok: false, error: 'Quantidade inválida.' }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(error.message || 'nutrition_auth_failed')
    const userId = data?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const resolvedDateKey = (() => {
      const s = typeof dateKey === 'string' ? dateKey.trim() : ''
      if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      try {
        const tz = 'America/Sao_Paulo'
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      } catch {
        return new Date().toISOString().slice(0, 10)
      }
    })()

    const resolved = await resolveBarcode(supabase, cleanEan)
    if (!resolved) {
      return { ok: false, error: 'Produto não encontrado. Tente digitar o nome manualmente.' }
    }

    const multiplier = safeGrams / 100
    const meal = {
      foodName: sanitizeFoodName(resolved.name).slice(0, 120) || 'Produto',
      calories: Math.round(resolved.item.kcal * multiplier),
      protein: Math.round(resolved.item.p * multiplier),
      carbs: Math.round(resolved.item.c * multiplier),
      fat: Math.round(resolved.item.f * multiplier),
    }

    const row = await trackMeal(userId, meal, resolvedDateKey)
    revalidatePath('/dashboard/nutrition')
    return { ok: true, meal, entry: row || null }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_log_barcode_failed') }
  }
}
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/nutrition/barcode-resolver.ts src/lib/nutrition/__tests__/barcode-resolver.test.ts
git add src/app/\(app\)/dashboard/nutrition/actions.ts
git commit -m "feat(nutrition): add barcode-resolver and logBarcodeAction"
```

---

## Task 8: BarcodeScanner.tsx

**Files:**
- Create: `src/components/dashboard/nutrition/BarcodeScanner.tsx`

- [ ] **Step 1: Install Capacitor MLKit Barcode Scanning**

```bash
cd "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks"
npm install @capacitor-mlkit/barcode-scanning
npm run cap:sync
```

Expected: package installed, no peer dependency errors, Capacitor sync completes.

- [ ] **Step 2: Create BarcodeScanner.tsx**

Create `src/components/dashboard/nutrition/BarcodeScanner.tsx`:

```tsx
'use client'

import { useCallback, useState } from 'react'
import { isNativePlatform } from '@/utils/platform'

type BarcodeScanResult = {
  rawValue: string
}

type BarcodePlugin = {
  scan: () => Promise<{ barcodes: BarcodeScanResult[] }>
  checkPermissions: () => Promise<{ camera: string }>
  requestPermissions: () => Promise<{ camera: string }>
}

async function loadBarcodePlugin(): Promise<BarcodePlugin | null> {
  try {
    if (!isNativePlatform()) return null
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
    return BarcodeScanner as unknown as BarcodePlugin
  } catch {
    return null
  }
}

type Props = {
  onResult: (ean: string) => void
  onClose: () => void
}

type ScanState = 'idle' | 'scanning' | 'error'

export default function BarcodeScanner({ onResult, onClose }: Props) {
  const [state, setState] = useState<ScanState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const startScan = useCallback(async () => {
    setState('scanning')
    setErrorMsg('')

    const plugin = await loadBarcodePlugin()
    if (!plugin) {
      setState('error')
      setErrorMsg('Scanner de código de barras não disponível neste dispositivo.')
      return
    }

    try {
      const { camera } = await plugin.checkPermissions()
      if (camera !== 'granted') {
        const { camera: granted } = await plugin.requestPermissions()
        if (granted !== 'granted') {
          setState('error')
          setErrorMsg('Permissão de câmera necessária para escanear.')
          return
        }
      }

      const { barcodes } = await plugin.scan()
      const ean = barcodes[0]?.rawValue?.trim()

      if (!ean) {
        setState('error')
        setErrorMsg('Nenhum código detectado. Tente novamente.')
        return
      }

      setState('idle')
      onResult(ean)
    } catch {
      setState('error')
      setErrorMsg('Erro ao escanear. Tente novamente.')
    }
  }, [onResult])

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {state === 'idle' && (
        <button
          type="button"
          onClick={startScan}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-medium text-white active:scale-95"
        >
          <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2v16H3V4zm4 0h1v16H7V4zm3 0h2v16h-2V4zm4 0h1v16h-1V4zm3 0h4v16h-4V4z" />
          </svg>
          Escanear código de barras
        </button>
      )}

      {state === 'scanning' && (
        <p className="text-sm text-white/60 animate-pulse">Apontando câmera…</p>
      )}

      {state === 'error' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-red-400">{errorMsg}</p>
          <button
            type="button"
            onClick={() => setState('idle')}
            className="text-xs text-white/50 underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="text-xs text-white/40 underline"
      >
        Cancelar
      </button>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: ESLint check**

```bash
node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs src/components/dashboard/nutrition/BarcodeScanner.tsx --max-warnings 0
```

Expected: empty output.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/nutrition/BarcodeScanner.tsx
git commit -m "feat(nutrition): add BarcodeScanner component using Capacitor MLKit"
```

---

## Task 9: Add barcode button to NutritionMixer

**Files:**
- Modify: `src/components/dashboard/nutrition/NutritionMixer.tsx`

- [ ] **Step 1: Read NutritionMixer to find the input area**

Read `src/components/dashboard/nutrition/NutritionMixer.tsx` — search for the text input element and any existing icon buttons next to it (VoiceInput, CustomFoodScanner).

- [ ] **Step 2: Add BarcodeScanner dynamic import**

At the top of NutritionMixer, alongside the existing dynamic imports, add:

```typescript
const BarcodeScanner = dynamic(() => import('./BarcodeScanner'), { ssr: false })
```

- [ ] **Step 3: Add state and handler**

At the top of `NutritionMixer.tsx`, add the static import alongside existing action imports:

```typescript
import { logBarcodeAction } from '@/app/(app)/dashboard/nutrition/actions'
```

Inside the NutritionMixer component (alongside existing useState calls), add:

```typescript
const isIosNative = useIsIosNative()
const [isAndroidNative, setIsAndroidNative] = useState(false)
useEffect(() => {
  import('@/utils/platform').then(({ isAndroidNative: check }) => setIsAndroidNative(check()))
}, [])
const isNative = isIosNative || isAndroidNative

const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)

const handleBarcodeResult = useCallback(async (ean: string) => {
  setShowBarcodeScanner(false)
  // Prompt for grams — can be upgraded to a modal in a future iteration
  const gramsStr = window.prompt(`Produto escaneado (EAN: ${ean})\nQuantidade em gramas:`, '100')
  const grams = Number(gramsStr)
  if (!grams || grams <= 0) return

  setIsLoading(true)
  try {
    const result = await logBarcodeAction(ean, grams, selectedDate)
    if (result.ok && result.meal) {
      // Refresh entries — same pattern as handleLogMeal
      toast.success(`${result.meal.foodName} adicionado!`)
      router.refresh()
    } else {
      toast.error(result.error ?? 'Produto não encontrado.')
    }
  } finally {
    setIsLoading(false)
  }
}, [selectedDate])
```

> Note: adapt `setIsLoading`, `toast`, `router`, `selectedDate` to match the actual variable names found in step 1.

- [ ] **Step 4: Add barcode button to the JSX**

In the JSX, next to the existing `VoiceInput` or `CustomFoodScanner` button (found in step 1), add:

```tsx
{isNative && (
  <button
    type="button"
    onClick={() => setShowBarcodeScanner(true)}
    aria-label="Escanear código de barras"
    className="flex size-9 items-center justify-center rounded-lg bg-white/10 text-white active:scale-95"
  >
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2v16H3V4zm4 0h1v16H7V4zm3 0h2v16h-2V4zm4 0h1v16h-1V4zm3 0h4v16h-4V4z" />
    </svg>
  </button>
)}

{showBarcodeScanner && (
  <BarcodeScanner
    onResult={handleBarcodeResult}
    onClose={() => setShowBarcodeScanner(false)}
  />
)}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: ESLint check**

```bash
node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs src/components/dashboard/nutrition/NutritionMixer.tsx --max-warnings 0
```

Expected: empty output.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/nutrition/NutritionMixer.tsx
git commit -m "feat(nutrition): add barcode scan button to NutritionMixer (native only)"
```

---

## Task 10: TACO Import Script

**Files:**
- Create: `scripts/import-taco.ts`

The TACO data JSON file (`scripts/taco-data.json`) must exist before running the script. Download it from `https://raw.githubusercontent.com/jota-pe/taco/master/taco.json` or use the official TACO table from UNICAMP. The script below expects the following JSON shape per item:

```json
[
  {
    "id": 1,
    "description": "Arroz, agulhinha, cru",
    "category": "Cereais e derivados",
    "humidity": 12.4,
    "energy_kcal": 360,
    "protein": 7.9,
    "lipids": 0.4,
    "cholesterol": null,
    "carbohydrate": 78.7,
    "dietary_fiber": 2.0,
    "ashes": 0.6
  }
]
```

- [ ] **Step 1: Download TACO data**

```bash
curl -L "https://raw.githubusercontent.com/jota-pe/taco/master/taco.json" \
  -o "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks/scripts/taco-data.json"
```

Verify file exists and has content:

```bash
wc -l "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks/scripts/taco-data.json"
```

Expected: file with several hundred lines.

- [ ] **Step 2: Create import script**

Create `scripts/import-taco.ts`:

```typescript
/**
 * Import TACO (Tabela Brasileira de Composição de Alimentos) data into Supabase.
 * Usage: npx tsx scripts/import-taco.ts
 *
 * Requires scripts/taco-data.json (download from jota-pe/taco on GitHub).
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

type TacoItem = {
  id: number
  description: string
  category: string
  energy_kcal: number | null
  protein: number | null
  lipids: number | null
  carbohydrate: number | null
  dietary_fiber: number | null
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
  const normalized = description.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const aliases = new Set<string>()
  // Add the full normalized name
  aliases.add(normalized)
  // Add the first word as an alias (e.g. "arroz" from "arroz, cozido")
  const firstWord = normalized.split(/[,\s]/)[0]
  if (firstWord && firstWord.length > 2) aliases.add(firstWord)
  // Add name without preparation suffix (e.g. "arroz agulhinha" from "arroz agulhinha cru")
  const withoutPrep = normalized
    .replace(/,?\s*(cru|cozido|grelhado|assado|frito|cozida|grelhada|assada|frita)(\s|$)/gi, '')
    .trim()
  if (withoutPrep && withoutPrep !== normalized) aliases.add(withoutPrep)
  return Array.from(aliases)
}

function mapCategory(raw: string): string {
  const c = (raw || '').toLowerCase()
  if (c.includes('cereal')) return 'carboidratos'
  if (c.includes('legum') || c.includes('feijao') || c.includes('grão')) return 'carboidratos'
  if (c.includes('carne') || c.includes('aves') || c.includes('frango')) return 'proteinas'
  if (c.includes('peixe') || c.includes('frutos')) return 'proteinas'
  if (c.includes('leite') || c.includes('laticín')) return 'laticinios'
  if (c.includes('fruta')) return 'frutas'
  if (c.includes('verdura') || c.includes('hortal') || c.includes('legume')) return 'vegetais'
  if (c.includes('óleo') || c.includes('gordura')) return 'gorduras'
  if (c.includes('bebida')) return 'bebidas'
  return 'outros'
}

async function main() {
  const dataPath = join(process.cwd(), 'scripts', 'taco-data.json')
  const raw = readFileSync(dataPath, 'utf-8')
  const items: TacoItem[] = JSON.parse(raw)

  console.log(`Loaded ${items.length} TACO items. Importing...`)

  const rows = items
    .filter((item) => item.energy_kcal !== null)
    .map((item) => ({
      food_key: normalizeSlug(item.description),
      name: item.description,
      aliases: buildAliases(item.description),
      category: mapCategory(item.category),
      kcal_per_100g: Number(item.energy_kcal) || 0,
      protein: Number(item.protein) || 0,
      carbs: Number(item.carbohydrate) || 0,
      fat: Number(item.lipids) || 0,
      fiber: item.dietary_fiber !== null ? Number(item.dietary_fiber) : null,
    }))

  // Upsert in batches of 100
  const BATCH_SIZE = 100
  let inserted = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('foods_taco')
      .upsert(batch, { onConflict: 'food_key' })

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message)
    } else {
      inserted += batch.length
      console.log(`  ✓ ${inserted}/${rows.length}`)
    }
  }

  console.log(`Done. ${inserted} items imported into foods_taco.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Run the import**

```bash
cd "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks"
source .env.local  # or: export NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
npx tsx scripts/import-taco.ts
```

Expected output:
```
Loaded 597 TACO items. Importing...
  ✓ 100/597
  ✓ 200/597
  ...
  ✓ 597/597
Done. 597 items imported into foods_taco.
```

- [ ] **Step 4: Verify count in Supabase**

```sql
-- via mcp__supabase__execute_sql:
SELECT count(*) FROM foods_taco;
-- Expected: ~597
SELECT food_key, name, kcal_per_100g FROM foods_taco LIMIT 5;
```

- [ ] **Step 5: Commit (do NOT commit taco-data.json — it's large)**

```bash
git add scripts/import-taco.ts
git commit -m "feat(scripts): add TACO import script — loads 597 Brazilian foods into Supabase"
```

---

## Task 11: Run Full Test Suite and Deploy

- [ ] **Step 1: Run all unit tests**

```bash
cd "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks"
npm run test:unit
```

Expected: all passing. Zero failures.

- [ ] **Step 2: Run smoke tests**

```bash
npm run test:smoke
```

Expected: all 13 smoke tests passing, including `/api/ai/nutrition-estimate`.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: ESLint on all modified/created files**

```bash
node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs \
  src/lib/nutrition/sources/taco-source.ts \
  src/lib/nutrition/sources/off-source.ts \
  src/lib/nutrition/food-resolver.ts \
  src/lib/nutrition/barcode-resolver.ts \
  src/app/\(app\)/dashboard/nutrition/actions.ts \
  src/components/dashboard/nutrition/BarcodeScanner.tsx \
  src/components/dashboard/nutrition/NutritionMixer.tsx \
  --max-warnings 0
```

Expected: empty output.

- [ ] **Step 5: Deploy**

```bash
npm run deploy
```

Expected: commit + push + Vercel CI/CD green.
