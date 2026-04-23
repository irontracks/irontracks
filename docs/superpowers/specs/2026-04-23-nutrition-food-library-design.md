# Nutrition Food Library — Design Spec

**Data:** 2026-04-23
**Status:** Aprovado
**Escopo:** Expandir a biblioteca de alimentos da ferramenta de nutrição do IronTracks, integrando TACO (USP), Open Food Facts e scan de código de barras, mantendo o cache de IA por usuário.

---

## Contexto

A ferramenta de nutrição atual possui ~150 alimentos hardcoded em `src/lib/nutrition/food-database.ts`. Qualquer alimento fora dessa base cai imediatamente no fallback Gemini (`/api/ai/nutrition-estimate`), tornando a experiência lenta e dependente de IA para itens comuns. Não há integração com bases públicas externas.

**Problema central:** base de dados insuficiente → recorre a IA desnecessariamente → experiência pobre para o usuário.

---

## Decisões de Design

| Questão | Decisão |
|---|---|
| Cache global de IA? | Não — TACO e Open Food Facts ficam globais, cache de IA continua por usuário |
| Open Food Facts: como buscar? | Texto + scan de código de barras |
| UX com múltiplas fontes | Resultado único silencioso — sistema escolhe, usuário não vê a fonte |
| TACO: onde armazenar? | Tabela no Supabase (`foods_taco`) via migration |

---

## Arquitetura

### Novas Tabelas Supabase

**`foods_taco`** — global, somente leitura pela aplicação
```sql
id            uuid primary key
food_key      text unique not null       -- slug normalizado, ex: "arroz-branco-cozido"
name          text not null              -- nome original TACO
aliases       text[]                     -- variações de nome para busca
category      text                       -- proteinas, carboidratos, frutas, etc.
kcal_per_100g numeric(8,2) not null
protein       numeric(8,2) not null
carbs         numeric(8,2) not null
fat           numeric(8,2) not null
fiber         numeric(8,2)
```
RLS: SELECT público (sem autenticação), INSERT/UPDATE/DELETE bloqueados.

**`foods_off_cache`** — global, populado automaticamente pela aplicação
```sql
id            uuid primary key
barcode       text unique                -- EAN-8 / EAN-13 (nulo para buscas por texto)
food_key      text unique not null       -- slug normalizado; inclui brand quando disponível ex: "whey-gold-standard-optimum"
name          text not null
brand         text
kcal_per_100g numeric(8,2) not null
protein       numeric(8,2) not null
carbs         numeric(8,2) not null
fat           numeric(8,2) not null
fiber         numeric(8,2)
source        text default 'open_food_facts'
created_at    timestamptz default now()
```
RLS: SELECT público; INSERT permitido apenas para `service_role` (via Server Action).

### Fluxo de Resolução — Busca por Texto

```
usuário digita alimento
  └─► resolveFood(query, userId)
        ├─► FASE 1 — Local + Supabase
        │     ├─ 1a. base hardcoded (memória, síncrono, zero latência)
        │     │       ACHOU → retorna imediato
        │     │
        │     └─ 1b. Supabase (único round-trip para as duas tabelas)
        │             foods_taco  ─┐ query paralela
        │             nutrition_learned_foods (usuário) ─┘
        │               ACHOU → retorna FoodResolution
        │
        └─► FASE 2 — Externa (só se Fase 1 falhou)
              ├─ foods_off_cache (Supabase)
              │     ACHOU → retorna FoodResolution
              │
              ├─ Open Food Facts API (timeout 5s)
              │     ACHOU → salva em foods_off_cache (via supabase service_role) → retorna
              │
              └─ Gemini IA
                    ACHOU → salva em nutrition_learned_foods → retorna
                    FALHOU → retorna erro explícito
```

### Fluxo de Resolução — Código de Barras

```
câmera detecta EAN
  └─► barcodeResolver(ean)
        ├─ foods_off_cache WHERE barcode = ean
        │     ACHOU → retorna FoodResolution
        │
        ├─ Open Food Facts API por EAN
        │     ACHOU → salva em foods_off_cache → retorna
        │
        └─ não achou → erro explícito "produto não encontrado no Open Food Facts"
             (sem fallback Gemini — EAN inválido não tem solução via IA)
```

---

## Componentes

### Novos arquivos

**`src/lib/nutrition/food-resolver.ts`**
- Exporta `resolveFood(query: string, userId: string): Promise<FoodResolution>`
- Orquestra Fase 1 e Fase 2
- Substitui a lógica de lookup espalhada no `parser.ts`
- `FoodResolution`: `{ foodName, calories, protein, carbs, fat, source: 'local'|'taco'|'learned'|'off_cache'|'off_api'|'gemini' }`

**`src/lib/nutrition/barcode-resolver.ts`**
- Exporta `resolveBarcode(ean: string): Promise<FoodResolution>`
- Sem fallback Gemini

**`src/lib/nutrition/sources/local-source.ts`**
- Busca na base hardcoded (`food-database.ts`) — sem alterações no arquivo existente

**`src/lib/nutrition/sources/taco-source.ts`**
- Query Supabase em `foods_taco` usando `ilike` com normalização de texto

**`src/lib/nutrition/sources/off-source.ts`**
- Consulta `foods_off_cache` + chama `https://world.openfoodfacts.org/api/v2/product/{barcode}` ou search endpoint
- Salva resultado em `foods_off_cache` via Server Action

**`src/lib/nutrition/sources/gemini-source.ts`**
- Extrai lógica atual de `/api/ai/nutrition-estimate/route.ts` para cá (sem mudança de comportamento)

**`src/components/dashboard/nutrition/BarcodeScanner.tsx`**
- Usa `@capacitor-mlkit/barcode-scanning`
- Abre câmera, detecta EAN-8/EAN-13
- Chama `barcodeResolver`, retorna resultado para `NutritionMixer` via callback
- Mostra estado: scanning → encontrado → erro

### Arquivos modificados

**`src/lib/nutrition/parser.ts`**
- `parseInput()` passa a chamar `resolveFood()` para alimentos desconhecidos (em vez de ir direto para a API de IA)
- Contrato de entrada/saída não muda

**`src/app/api/ai/nutrition-estimate/route.ts`**
- Mantido para compatibilidade, mas passa a delegar para `gemini-source.ts`

**`src/components/dashboard/nutrition/NutritionMixer.tsx`**
- Adiciona botão de câmera que abre `BarcodeScanner`
- Nenhuma outra mudança

---

## Tratamento de Erros

| Cenário | Comportamento |
|---|---|
| Open Food Facts timeout (>5s) | Pula direto para Gemini, sem travar UI |
| EAN não encontrado no OFF | Erro explícito, sem fallback IA |
| `foods_off_cache` com campos nulos | Campos opcionais explicitamente `null`, nunca `0` falso |
| Rate limit Gemini (10 req/hora) | Comportamento atual mantido sem alteração |
| Supabase offline | Fase 1 falha, Fase 2 tenta OFF → Gemini |

---

## Migration TACO

- Script de importação em `scripts/import-taco.ts`
- Fonte: JSON público da TACO USP (domínio público)
- Normalização: `food_key` = slug sem acento, aliases incluem variações comuns (ex: "arroz" → ["arroz branco", "arroz cozido"])
- Migration gerada: `supabase/migrations/YYYYMMDDHHMMSS_create_foods_taco.sql`
- RLS configurado na mesma migration

---

## Testes

**Unit — `food-resolver.test.ts`**
- Acha na base local → retorna `source: 'local'`
- Acha no TACO → retorna `source: 'taco'`
- Acha no cache IA do usuário → retorna `source: 'learned'`
- Acha no `foods_off_cache` → retorna `source: 'off_cache'`
- Acha via Open Food Facts API → salva cache + retorna `source: 'off_api'`
- OFF timeout → cai no Gemini
- Tudo falha → erro explícito

**Unit — `barcode-resolver.test.ts`**
- EAN encontrado no cache → retorna imediato
- EAN encontrado na API → salva + retorna
- EAN inválido → erro sem fallback IA

**Smoke (manter funcionando)**
- `/api/ai/nutrition-estimate` continua respondendo corretamente
- `logMealAction()` continua funcionando end-to-end

---

## O que NÃO muda

- Schema de `nutrition_learned_foods` (cache por usuário — sem alteração)
- Schema de `nutrition_custom_foods` (custom foods por rótulo — sem alteração)
- Schema de `nutrition_meal_entries` e `daily_nutrition_logs`
- Contrato de `logMealAction()`
- Rate limits existentes
- `NutritionMixer.tsx` além do botão de câmera

---

## Dependência nova

```bash
npm install @capacitor-mlkit/barcode-scanning
```
Apenas para mobile (iOS/Android). No web, o botão de câmera fica oculto ou mostra mensagem "disponível apenas no app".
