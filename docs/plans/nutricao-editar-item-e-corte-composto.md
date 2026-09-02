# Plano — Nutrição: editar item lançado, corte composto "coxa e sobrecoxa", e o arroz que não era arroz

**Repo:** IronTracks · **Data:** 02/09/2026 · **Base:** `main` @ `947714766`
**Escopo:** aba NUTRIÇÃO — parser local, base de alimentos, fonte TACO, editor de lançamento.
**Origem:** `/planejamento` (plano por agente Opus; execução planejada para Sonnet).

---

## 0. O que foi MEDIDO antes de planejar (não é hipótese)

### 0.1 Reprodução exata do print, sem IA nenhuma

`analyzeMeal` real do repo, com a entrada da TACO de hoje:

```
250g arroz branco
200g Coxa e sobrecoxa sem osso sem pele grelhado
```

| item | grams | kcal | P | C | G |
|---|---|---|---|---|---|
| `250g arroz branco` | 250 | **384** | **27** | **29** | **18** |
| `200g Coxa` | 200 | **320** | **50** | **0** | **12** |
| `sobrecoxa sem osso sem pele grelhado` | 110 | **182** | **26** | **0** | **8** |
| **total** | | **886** | **103** | **29** | **38** |

Byte a byte o print do dono, inclusive a 3ª linha sem gramatura (110 g vieram de `approx.unidade` da chave `'sobrecoxa'`).

**Conclusão:** os dois defeitos são do **resolvedor local** (`src/lib/nutrition/parser.ts` + tabela `foods_taco`). A IA de `/api/ai/nutrition-estimate` **não participou** — `unknownLines` saiu vazia, então a cascata do `resolveFood` nem chegou lá.

### 0.2 Frente B — por que parte

`src/lib/nutrition/parser.ts:244`:

```ts
.flatMap((l) => String(l || '').split(/\s+e\s+/gi))
```

O comentário acima diz *"No food in the database contains a standalone ' e ', so this is safe."* — **é falso, e já era antes desta tarefa**. Varredura da base inteira:

```
chaves inalcançáveis: 1
legumes e salada -> itens=2 desconhecidas=0
```

`'legumes e salada'` (`food-database.ts:194`) é código morto desde que o split existe. Na `foods_taco` há mais três (`baiao-de-dois-arroz-e-feijao-de-corda`, `acai-polpa-com-xarope-de-guarana-e-glucose`, `cereais-mistura-para-vitamina-trigo-cevada-e-aveia`).

Duas causas somadas no caso do dono:
1. `coxa e sobrecoxa` é **um nome** — e a base nem tem essa chave, então mesmo sem o split não casaria.
2. `sem pele e sem osso` é **qualificador**, não segundo alimento. Corrigir só (1) deixa `"sem osso"` virando `unknownLine` e gastando IA à toa.

### 0.3 Frente C — CONFIRMADA, e maior que o arroz

`250g arroz branco → 384 kcal · P27 C29 G18` é `153,77 kcal/100 g · P10,83 · C11,58 · G7,12`. No banco:

```
food_key = 'arroz-carreteiro' · "Arroz carreteiro"
aliases  = ["arroz carreteiro", "arroz"]
153.77 kcal · P10.83 · C11.58 · G7.12
```

`250 × 1,5377 = 384,4`. É **arroz carreteiro** — arroz com carne moída — servido como arroz branco.

Causa em `src/lib/nutrition/sources/taco-source.ts:44-46`: o mapa de aliases é um objeto e **o último write vence**, sem política de conflito.

| alias | linhas que reivindicam | quem ganha (ordem de heap, sem `ORDER BY`) |
|---|---|---|
| `carne` | **60** | `carne-bovina-seca-crua` — 312,75 kcal · G25,37 |
| `frango` | **25** | `frango-com-acafrao` — 112,78 kcal |
| `feijao` | 16 | — |
| `arroz` | 7 | `arroz-carreteiro` — 153,77 kcal |

Dos ~110 aliases ambíguos, **73 ficam expostos** (a base curada protege o resto): `arroz, carne, batata, pao, queijo, leite, feijao, oleo, chocolate, iogurte, farinha, bolo, biscoito, pastel, porco, presunto, merluza, pescada, peru, coco, cha, cafe…`

```
"200g carne assada"  →  626 kcal · P39 · G51     (carne seca crua; o real é ~400 kcal · G20)
"200g frango"        →  330 kcal · P62 · G8      (correto — 'frango' existe na base estática)
```

**Agravante:** não há `ORDER BY` em `loadTacoFoods`. O vencedor é a ordem física da tabela — um `VACUUM FULL`, um `UPDATE` ou recarga da TACO troca em silêncio o significado de `arroz` de 153 para 359 kcal. O defeito é **instável**, não só errado.

---

## 1. Arquivos exatos

### Editar

| Caminho | Papel |
|---|---|
| `src/lib/nutrition/parser.ts` | Frente B. Extrair leitura de quantidade para função pura; trocar o `split(/\s+e\s+/)` cego por separador que respeita nome composto e qualificador. |
| `src/lib/nutrition/food-database.ts` | Frente B: chaves de corte composto. Frente C: genéricos curados (`arroz`, `arroz branco`, `carne`…). |
| `src/lib/nutrition/sources/taco-source.ts` | Frente C. Política de conflito de alias + `ORDER BY` determinístico. |
| `src/components/dashboard/nutrition/NutritionEntryCard.tsx` | Frente A. Campo de quantidade por item; rótulo via `rotuloItem`, não `label` cru. |
| `src/components/dashboard/nutrition/NutritionMixer.tsx` | Frente A. `abrirEditorDaEntry` semeia `itensOriginais`. **Nada mais** — `onSaveEdit` continua montando `{ food_name, items }`. |
| `src/lib/nutrition/aiEstimate.ts` | Frente B (cinto e suspensório). Uma linha no prompt: corte composto pt-BR é UM item. |

### Criar

| Caminho | Papel |
|---|---|
| `src/lib/nutrition/mealItemQuantity.ts` | **Núcleo puro da frente A.** Ler/reescrever quantidade e reescalar macros. |
| `src/lib/nutrition/__tests__/mealItemQuantity.test.ts` | Unidades (node). |
| `src/lib/nutrition/__tests__/baseAlcancavelPeloParser.test.ts` | **Guard de CLASSE** — toda chave da base é alcançável. Falha HOJE em `legumes e salada`. |
| `src/lib/nutrition/__tests__/parserNomeCompostoComE.test.ts` | Casos do dono + não-regressões (`ovo e banana` = DOIS). |
| `src/lib/nutrition/__tests__/tacoAliasAmbiguo.test.ts` | Alias com macros divergentes não vira chave. |
| `src/components/dashboard/nutrition/__tests__/editarQuantidadeDoItem.test.tsx` | Comportamento do editor (jsdom). |
| `src/components/dashboard/nutrition/__tests__/edicaoNaoVazaCampoNovo.test.ts` | Source-guard: payload segue exatamente `{ food_name, items }`. |

---

## 2. Frente B — "coxa e sobrecoxa" é UM corte

### 2.1 A regra, em duas metades

O split de `" e "` passa a perguntar antes de separar:

1. **O `" e "` está DENTRO do nome de um alimento conhecido?** Se a junção das partes casa na CABEÇA uma chave que contém `" e "`, não separa. Trata a CLASSE: chave composta futura funciona sozinha.
2. **O lado direito abre comida nova?** Se é QUALIFICADOR (`sem osso`, `sem pele`, `sem gordura`, `sem lactose`, `sem açúcar`, `sem sal`, `sem casca`, `com pele`, `ao natural`) — sem dígito e sem alimento na cabeça —, não separa. Mesmo raciocínio do `SOBRA_COM_QUANTIDADE`: **quantidade denuncia comida nova**; qualificador não é comida.

Fora disso, `" e "` separa como hoje: `ovo e banana` → dois, `arroz e feijão` → dois, `200g de frango e 100g de arroz` → dois.

### 2.2 Implementação (`parser.ts`)

**(a) Mover `buildFoodEntries` para ANTES do cálculo de `lines`** — não depende delas; é o que dá acesso às chaves compostas na hora de separar.

**(b) Extrair a leitura de quantidade** (linhas 312-362) para função pura exportada:

```ts
export type QuantidadeDaLinha = { qtd: number; unitUsed: string; foodName: string; wasApprox: boolean }
export function lerQuantidadeDaLinha(normalizedLine: string): QuantidadeDaLinha
```

Não é refactor gratuito: a decisão de separar precisa saber onde o nome começa (`"200g coxa e sobrecoxa…"` só casa depois de tirar `200g`). A suíte `parser*.test.ts` (7 arquivos) é a rede.

**(c) O separador novo, preservando o texto cru:**

```ts
const CONECTOR_E = /(\s+e\s+)/gi   // grupo capturante: separador cru sobrevive
function ehQualificador(trecho: string, entries: FoodEntry[]): boolean
function chavesCompostasComE(entries: FoodEntry[]): string[]   // maior primeiro
export function separarPorConectorE(line: string, entries: FoodEntry[]): string[]
```

Percurso de `"200g Coxa e sobrecoxa sem osso sem pele grelhado"`: partes `200g Coxa` + `sobrecoxa sem osso sem pele grelhado` → junção normalizada `coxa e sobrecoxa sem osso sem pele grelhado` → `matchesAtHead(…, 'coxa e sobrecoxa')` = **true** (padrão gerado: `coxas?\s+es?\s+sobrecoxas?`) → **não separa. Um item, 200 g.**

`"200g Coxa e sobrecoxa sem pele e sem osso"`: 1º `" e "` fica pela regra 1, 2º pela regra 2. Também **um item**. `SOBRA_COM_QUANTIDADE` não dispara (`" sem pele e sem osso"` não tem dígito).

### 2.3 Entradas novas em `food-database.ts`

Referência TACO deste projeto (conferida no banco):

| TACO | kcal/100 g | P | G |
|---|---|---|---|
| Frango, coxa, sem pele, cozida | 167,43 | 26,86 | 5,85 |
| Frango, sobrecoxa, sem pele, assada | 232,88 | 29,18 | 12,01 |
| Frango, coxa, com pele, assada | 215,12 | 28,49 | 10,36 |
| Frango, sobrecoxa, com pele, assada | 259,60 | 28,70 | 15,19 |

⚠️ **A base estática é mais magra que a TACO:** `'coxa'` = 160/25/0/6 e `'sobrecoxa'` = 165/24/0/7. Usar média da TACO no composto faria a mesma tela mostrar `200g coxa = 320 kcal` e `200g coxa e sobrecoxa = 400 kcal` — contradição a três linhas de distância. **Recomendação: coerência interna** (ver decisão 1).

```ts
'coxa e sobrecoxa': { kcal: 163, p: 24.5, c: 0, f: 6.5, approx: { unidade: 210 }, label: 'Coxa e sobrecoxa' },
'sobrecoxa e coxa': { …mesmo item… },
'coxa e sobrecoxa de frango': { …mesmo item… },
'file de coxa e sobrecoxa': { kcal: 163, p: 24.5, c: 0, f: 6.5, approx: { unidade: 90 }, label: 'Filé de coxa e sobrecoxa' },
'file de coxa e sobrecoxa de frango': { …mesmo item… },
'file de sobrecoxa': { kcal: 165, p: 24, c: 0, f: 7, approx: { unidade: 90 }, label: 'Filé de sobrecoxa' },
'file de coxa': { kcal: 160, p: 25, c: 0, f: 6, approx: { unidade: 80 }, label: 'Filé de coxa' },
```

`approx.unidade` diferente (peça com osso ~210 g, filé ~90 g) impede "1 coxa e sobrecoxa" de virar 50 g cegos.

**"Peito e asa", "alcatra e maminha":** varridos na base e na TACO — não existem como corte único; são duas peças. Não entram. Se um dia entrarem, a regra 1 já as atende sem tocar no parser — é a diferença entre tratar a classe e tratar a string.

### 2.4 O guard que fecha a classe

```ts
it('toda chave da base é alcançável pelo parser', () => {
  const inalcancaveis = Object.keys(foodDatabase).filter((k) => {
    const r = analyzeMeal(`100g ${k}`)
    return r.items.length !== 1 || r.unknownLines.length !== 0
  })
  expect(inalcancaveis, 'chave que o separador desmonta é chave morta').toEqual([])
})
```

Reprova HOJE (`legumes e salada`) e reprovaria de novo com as chaves de §2.3 sem a correção. Ancora na base (que vai FICAR e crescer), não em algo que a correção apaga — armadilha nº 6 evitada.

---

## 3. Frente C — o alias genérico da TACO

### 3.1 Correção (`taco-source.ts`)

```ts
.select('food_key, name, aliases, kcal_per_100g, protein, carbs, fat, fiber')
.order('food_key', { ascending: true })   // determinismo: hoje o vencedor é ordem de heap
```

Política: **`food_key` sempre vence; alias ambíguo é DESCARTADO.** Primeira passada conta aliases e guarda assinatura de macros; segunda só escreve alias cujo conjunto de macros é único (ou idêntico entre as linhas que o reivindicam).

Comentário obrigatório no código: por que descartar (número plausível e errado é pior que não reconhecer — ninguém confere o que parece certo), com a medição de 02/09/2026 e o caminho de fallback (vira `unknownLine`, cascata segue).

### 3.2 A rede que impede regressão de custo

Descartar `arroz` sem mais nada joga `"200g arroz"` na IA — troca erro por custo. Por isso a frente C tem segunda metade, chaves curadas:

```ts
'arroz': { kcal: 128, p: 2.5, c: 28.1, f: 0.2, approx: { colher: 25, concha: 100, prato: 180 } },  // = TACO 'Arroz, tipo 1, cozido'
'arroz branco': { …mesmo item…, label: 'Arroz branco' },
'carne': { kcal: 212, p: 26, c: 0, f: 11, approx: { bife: 120, posta: 120, colher: 30 } },         // = 'carne bovina' que já existe
```

Lista completa é decisão do dono (decisão 3).

### 3.3 Guard

```ts
it('alias reivindicado por linhas de macros diferentes não vira chave', async () => {
  const map = await loadTacoFoods(mock([
    { food_key: 'arroz-tipo-1-cozido', aliases: ['arroz'], kcal_per_100g: 128, protein: 2.5, carbs: 28.1, fat: 0.2 },
    { food_key: 'arroz-carreteiro',    aliases: ['arroz'], kcal_per_100g: 153.77, protein: 10.83, carbs: 11.58, fat: 7.12 },
  ]))
  expect(map['arroz']).toBeUndefined()
  expect(map['arroz-carreteiro']).toBeDefined()
})

it('250g arroz branco não pode sair com mais proteína que carboidrato', () => {
  const it0 = analyzeMeal('250g arroz branco', extrasComTacoLimpa).items[0]
  if (it0) expect(it0.protein).toBeLessThan(it0.carbs)
})
```

O 2º caso ancora no **fato físico**, não no número 384 que a correção faz sumir.

---

## 4. Frente A — editar a quantidade de um item já lançado

### 4.1 O que já existe (verificado nas duas pontas)

- **Editor:** `NutritionEntryCard.tsx:158-250` — só REMOVE (`X`, :183) e ADICIONA (`+ Add`, :212).
- **Estado:** `NutritionMixer.tsx:328` (`editDraft`), semeado em `abrirEditorDaEntry` (:831).
- **Escrita online:** `onSaveEdit` (:1651) → `editMealAction` (`actions.ts:141`) → `editEntryCore` (`mutations.ts:166`).
- **Offline:** `queueNutritionEdit` (`offlineSync.ts:449`) → `POST /api/nutrition/edit-entry`.

**`editEntryCore` já regrava `items` inteiro e recalcula totais como SOMA dos itens** (`mutations.ts:179-191`); o `ItemSchema` da rota (`edit-entry/route.ts:13-20`) já aceita os seis campos. **Zero migration, zero mudança de contrato, zero servidor.** A frente A é UI + função pura.

### 4.2 Só gramas, com recálculo proporcional

Não editar nome nem macros:
1. **Editar nome sem re-resolver mente** — "arroz"→"batata doce" mantendo 384 kcal grava batata com macros de arroz. Trocar alimento = REMOVER + ADICIONAR (já existe, passa pela cascata).
2. **Editar macros à mão** estraga o repertório: `mealItemFoods` deriva densidade de `items`; macro errado vira candidato de troca com densidade impossível.
3. **Quantidade é o que o dono pediu**, é reversível e a matemática é exata.

### 4.3 A densidade é derivada, não gravada

O item não guarda `per_100g`, mas guarda `grams` + macros absolutos — é o que `mealItemFoods.toPer100g` (:53) já faz. Na prática o fator é a razão de quantidades, linear inclusive para `unidade`.

**QUATRO formas de item em `items`, e as duas últimas não têm densidade:**

| origem | `label` | `grams` | reescalável? |
|---|---|---|---|
| parser local (`parser.ts:481`) | linha crua **com** quantidade — `"250g arroz branco"` | >0 | **sim** |
| IA (`aiEstimate.ts`) | nome limpo **sem** quantidade | >0 | **sim** (via `grams`) |
| memo (`food-resolver.ts:96-103`) | nome da refeição | **0** | **não** |
| legado semeado (`NutritionMixer.tsx:840`) | `food_name` da refeição | **0** | **não** |

Para os dois sem densidade: **não mostrar o campo**, com nota curta. Inventar 100 g seria afirmar medição que ninguém fez — mesmo motivo pelo qual `rotuloItem` (`dayMeals.ts:127`) se recusa a prefixar gramas com `grams <= 0`.

### 4.4 `src/lib/nutrition/mealItemQuantity.ts`

```ts
export type QuantidadeDoItem = { valor: number; unidade: string; origem: 'rotulo' | 'grams' }
export function lerQuantidadeDoRotulo(label: string): { valor: number; unidade: string; resto: string } | null
export function escreverQuantidadeNoRotulo(label: string, novoValor: number): string
export function quantidadeEditavel(item: MealItem): QuantidadeDoItem | null
export function reescalarItem(item: MealItem, novoValor: number): MealItem
export const QUANTIDADE_MAXIMA = 5000
```

O que a versão ingênua erra e o teste tem que cobrir:
- **`"500ml leite zero lactose"` → 300 vira `"300ml …"`, não `"300g …"`** (o parser grava `grams = qtd` também para ml, :427).
- **`"2 ovos" + grams 100` → 3 vira `"3 ovos"` com 150 g.**
- **Sufixo de preparo sobrevive:** `"200g frango · à milanesa"`.
- **Arredondamento uma vez só, no fim** (como `sanitizeItems`, `mutations.ts:36`).
- **`novoValor <= 0` não apaga o item** — quem remove é o `X`; campo em branco durante digitação não pode zerar a refeição.

### 4.5 UI no `NutritionEntryCard`

```
┌──────────────────────────────────────────────┐
│ [ 250 ] g   arroz branco                 [X] │
│             384 kcal · P27 C29 G18           │
└──────────────────────────────────────────────┘
```

- `inputMode="decimal"`, `{...plainFieldProps}`, `aria-label={`Quantidade de ${nome}`}`.
- ⚠️ **`inputMode` decimal ganha selecionar-ao-focar de graça** via `installNumericSelectOnFocus` (delegado no document, `focusin` borbulha do portal). **Verificar se a página web `/dashboard/nutrition` monta `IronTracksAppClientImpl`** (:173, onde o listener é instalado); se não montar, o campo precisa de `onFocus={handleNumericFocusSelect}` explícito. Sem isso, tocar num campo com `250` e digitar `1` grava `1250` — o bug de 15/08/2026 repetido.
- **Nome exibido sai de `rotuloItem`**, não de `food.label` cru (hoje :180 usa o label direto, e para item da IA isso esconde a quantidade — não dá para editar o que não se vê).
- Manter alvo de 44 px do `X` (`tap-44` + `before:-inset-2`, :190). O campo não pode espremer o botão.
- O total (:224) já é soma dos itens e se atualiza sozinho.

### 4.6 O rascunho ganha a base original

```ts
setEditDraft({ food_name: entry.food_name, items: seeded, itensOriginais: seeded })
```

O handler reescala **sempre a partir de `itensOriginais[i]`** — sem isso, 250 → 150 → 250 não volta ao original (arredondamento acumula).

⚠️ **A armadilha do `planDays` vale aqui:** `onSaveEdit` (:1685) monta o payload campo a campo — `editMealAction(id, { food_name, items })` — e **tem que continuar assim**. `itensOriginais` é estado de tela e não pode vazar para `nutrition_meal_entries.items`. O `.strip()` do Zod protege um lado; o guard de §7 protege o outro.

---

## 5. Sequência, e por que esta ordem

| # | Passo | Por que aqui |
|---|---|---|
| 1 | `baseAlcancavelPeloParser.test.ts` | Nasce **vermelho** (`legumes e salada`) — prova que o guard testa algo antes da correção existir (armadilha nº 5). |
| 2 | Cortes compostos em `food-database.ts` | Aumenta o vermelho. Base antes do parser: é ela que define o que o parser precisa respeitar. |
| 3 | `parser.ts` — `lerQuantidadeDaLinha` extraída | Refactor puro, provado pela suíte existente ficando verde. Isolado do passo 4 para não confundir regressões. |
| 4 | `parser.ts` — `separarPorConectorE` + `ehQualificador` | Passo 1 fica verde. `parserNomeCompostoComE.test.ts` entra junto. |
| 5 | `taco-source.ts` — alias ambíguo + `ORDER BY` | Depois porque o passo 6 é o que impede a regressão de custo. |
| 6 | `food-database.ts` — genéricos curados | Fecha o buraco que o passo 5 abre. |
| 7 | `mealItemQuantity.ts` + testes | Puro. Depois das frentes B/C porque a UI da frente A exibe os itens que elas corrigem — testar editor com dado errado esconde erro. |
| 8 | `NutritionEntryCard.tsx` + `NutritionMixer.tsx` | A UI consome o formato. Por último, sempre. |
| 9 | Linha no prompt de `aiEstimate.ts` + guard de fonte | Independente e barato; por último para não confundir a medição de B/C. |

---

## 6. Fronteiras negativas — o que NÃO tocar

- **`foodSwap.ts`, `swapCandidates.ts`, `mealItemFoods.ts`, `foodItemSanity.ts`** — o motor de troca LÊ `items` e o formato não muda. **Não afrouxar o `\be\b` de `COMPOSITE_PATTERNS`** (`foodItemSanity.ts:36`): ele vai rejeitar "coxa e sobrecoxa" como candidato de substituição, e isso está CERTO — afrouxar reabriria "Pão Francês com Doce de Leite" como substituto.
- **`dietPlanShape.ts` / `planDays()` / `weekPlan.ts` / `dietGenerate.ts` / `importDietJson.ts`** — é PLANO ALIMENTAR, outra tabela (`student_diet_plans`). Chaves novas só melhoram o casamento; ainda assim `importDietJson.test.ts` entra no critério de pronto.
- **`food-profile.ts` e o prompt do gerador de cardápio** — não se mexe em fonte de repertório, só em quem RESOLVE texto.
- **`learned-foods.ts` / `nutrition_learned_foods`** — dado ruim documentado; **nada aqui escreve nele**. `saveMealMemo` só roda no caminho de IA, então o volume novo CAI. Memos antigos seguem consultados só para texto EXATO e sempre DEPOIS da base curada (`food-resolver.ts:86-90`) — as chaves novas passam à frente. Não é preciso limpar tabela.
- **`nutrition_day_flags` / `incompleteDay.ts`** — a marca é do usuário; editar refeição de dia marcado muda a kcal, **não desmarca nada**.
- **Auth, `middleware.ts`, `utils/auth/route.ts`** — rota e action já autenticam e limitam taxa.
- **RevenueCat / cobranças / `checkVipFeatureAccess`** — editar quantidade não chama IA e **não pode** meter cota.
- **`nutrition-chat`, `chatProjection.ts`, `NutritionSimulationCard.tsx`, `applyChatSimulationAction`** — se beneficiam do parser corrigido de graça; nenhum arquivo deles é editado (ver decisão 5).
- **`engine.ts` / `trackMeal`** — a edição passa por `editEntryCore`, e isso é o desenho atual. Não unificar agora.
- **Migrations / schema** — zero. `items` é `jsonb`.

---

## 7. Riscos e casos de borda

1. **Dado gravado não muda retroativamente.** As três linhas erradas do print **continuam erradas até o dono editar** — e agora ele consegue. A correção vale do deploy para frente.
2. **Editar quantidade NÃO re-resolve o alimento** — preserva a densidade gravada, inclusive uma errada. Deliberado: re-resolver produziria número diferente do que o card prometeu.
3. **Item sem densidade (`grams: 0`)** — sem campo. Sem esse tratamento, `fator = novo/0` = `Infinity` e o `Math.round` grava lixo.
4. **Deriva de arredondamento** — resolvida por `itensOriginais`. Teste tem que fazer round-trip 250 → 150 → 250 e exigir o item original.
5. **`items` reconstruído campo a campo — armadilha do `planDays` VALE.** Guard `edicaoNaoVazaCampoNovo.test.ts` lê o arquivo, isola o corpo de `onSaveEdit` e assere que `editMealAction` recebe exatamente `food_name` e `items`, com `expect(bloco).not.toBe('')` para não emudecer se a função for renomeada.
6. **Offline** — os ramos `isOffline()` (:1664) e `pending` precisam receber os itens reescalados iguais ao online. `pendingEditIdempotency.test.ts` cobre a idempotência; o caso novo é "quantidade editada offline chega igual".
7. **Histórico e PDF do nutricionista** — `editEntryCore` chama `recalcAndPersistDayTotals` (`mutations.ts:106`), então **editar refeição de 15 dias atrás muda o relatório daquele período**. É o certo, e precisa ser dito ao dono.
8. **Guard de hora BRT** — não encostar em `horaBrt`/`formatClock` (:68); o source-guard do `timeZone` continua valendo.
9. **Custo de IA** — descartar 73 aliases pode aumentar chamadas para genéricos não cobertos. Mitigação: chaves de §3.2 + medir taxa de `needsAi` antes/depois em ~30 frases reais.
10. **`ORDER BY food_key` muda quem ganha empate TACO×TACO** — de heap para alfabético. Rodar `food-resolver.test.ts` e `taco-source.test.ts`.
11. **`isTitleLine` (:283) depende de `lines.length >= 2`** — ao deixar de separar, uma entrada pode virar uma linha só e mudar o ramo do título. Caso: `"Almoço\ncoxa e sobrecoxa"` mantém nome "Almoço" e UM alimento.
12. **Simulador iOS não serve para digitar português** (dicionário inglês). Conferir TELA injetando dado por SQL na conta de teste; a página `/dashboard/nutrition` **não é alcançável no app nativo** — conferir pelo `NutritionOverlay` e declarar a prova como numérica.

---

## 8. Critério de pronto

```bash
npx tsc --noEmit                                    # zero erros

node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs \
  src/lib/nutrition/parser.ts \
  src/lib/nutrition/food-database.ts \
  src/lib/nutrition/sources/taco-source.ts \
  src/lib/nutrition/mealItemQuantity.ts \
  src/lib/nutrition/aiEstimate.ts \
  src/components/dashboard/nutrition/NutritionEntryCard.tsx \
  src/components/dashboard/nutrition/NutritionMixer.tsx \
  src/lib/nutrition/__tests__/mealItemQuantity.test.ts \
  src/lib/nutrition/__tests__/baseAlcancavelPeloParser.test.ts \
  src/lib/nutrition/__tests__/parserNomeCompostoComE.test.ts \
  src/lib/nutrition/__tests__/tacoAliasAmbiguo.test.ts \
  src/components/dashboard/nutrition/__tests__/editarQuantidadeDoItem.test.tsx \
  src/components/dashboard/nutrition/__tests__/edicaoNaoVazaCampoNovo.test.ts \
  --max-warnings 0                                  # output vazio

npm run test:unit                                   # os DOIS projetos (dom + node)
```

Suítes que precisam continuar verdes: `parser.test.ts`, `parserMealName.test.ts` (← "ovo e banana" = DOIS), `parserFoodMatch`, `parserHeadNoun`, `parserServingUnit`, `parserSobraComQuantidade`, `parserSynonyms`, `food-resolver`, `taco-source`, `importDietJson`, `mutations`, `pendingEditIdempotency`, `foodItemSanity`, `foodSwap`, `nutritionEntryCard`, `nutritionHistoryPdf`.

`npm run test:smoke` não é exigido (nenhuma rota nova) — mas rodar não custa.

### Mutações obrigatórias (`npm run mutar`) — uma por correção

| Frente | Mutação | Esperado |
|---|---|---|
| B — separador | `"separarPorConectorE(l, allFoodEntries)"` → `"l.split(/\s+e\s+/gi)"` contra `parserNomeCompostoComE` | vermelho |
| B — chave composta | `"'coxa e sobrecoxa':"` → `"'coxa sobrecoxa':"` contra `parserNomeCompostoComE` | vermelho |
| B — qualificador | `"ehQualificador(direita, entries)"` → `"false"` contra `parserNomeCompostoComE` | vermelho |
| B — guard de classe | `"separarPorConectorE(l, allFoodEntries)"` → `"l.split(/\s+e\s+/gi)"` contra `baseAlcancavelPeloParser` | vermelho |
| C — alias ambíguo | `"if (ambiguos.has(a)) continue"` → `"if (false) continue"` contra `tacoAliasAmbiguo` | vermelho |
| A — reescala | `"novoValor / q.valor"` → `"1"` contra `mealItemQuantity` | vermelho |
| A — unidade | `"q.unidade"` → `"'g'"` contra `mealItemQuantity` | vermelho |
| A — base original | `"itensOriginais[i]"` → `"d.items[i]"` contra `editarQuantidadeDoItem` | vermelho |
| A — payload | `"{ food_name: draft.food_name, items }"` → `"{ ...draft, items }"` contra `edicaoNaoVazaCampoNovo` | vermelho |

Após cada mutação, confirmar `1 passed` com `vitest -t "<nome do caso>"` — não `0 passed | N skipped`.

### Verificação de ponta a ponta

1. **Rodar a reprodução do §0.1 com o código corrigido.** Esperado: **dois** itens; arroz com C > P; coxa e sobrecoxa como **um** item de 200 g.
2. **Tela:** injetar por SQL uma refeição na conta de teste com as três formas de item (parser / IA / memo `grams: 0`), abrir o `NutritionOverlay` no simulador, editar 250 → 150 e conferir total do card e anel do dia. Declarar que a prova da página web foi numérica.
3. Merge por `npm run pr:merge <n>` — nunca `gh pr merge` direto.

---

## 9. Decisões do dono

1. **Macros de `'coxa e sobrecoxa'`:** (a) média da dupla da base — 163 kcal/P24,5/G6,5, coerente com `'coxa'` na mesma tela *(recomendado)*; (b) média TACO sem pele — 200 kcal/P28/G8,9, mais fiel mas contraditório na tela.
2. **Padrão com osso ou filé:** (a) uma chave, valor do desossado; (b) duas chaves com `approx.unidade` diferente — 210 g com osso, 90 g filé *(recomendado)*; (c) uma chave, valor com pele.
3. **Quantos dos 73 genéricos ganham entrada curada:** (a) só `arroz`, `arroz branco`, `carne` *(recomendado para esta entrega)*; (b) top ~15; (c) todos os 73 (projeto próprio).
4. **`'coxa'`/`'sobrecoxa'` da base estão ~30% abaixo da TACO** — corrigir junto, auditoria separada, ou deixar? **Sem resposta, fica como está** (mudar valor sem pedido mexe na conta de quem já usa).
5. **Editar quantidade também no card de SIMULAÇÃO (antes de lançar)?** (a) só depois de lançado *(recomendado)*; (b) os dois.
6. **Item sem quantidade registrada (memo/legado):** (a) sem campo, com nota *(recomendado)*; (b) campo assumindo 100 g; (c) botão "recalcular com IA".
7. **Layout no iPhone:** (a) campo + `X` na mesma linha, nome truncado; (b) campo em segunda linha; (c) `X` vira deslizar-para-remover.

---

## 10. DECISÕES TOMADAS PELO DONO — 02/09/2026

Estas respostas **substituem** as recomendações do §9. Onde houver divergência, vale esta seção.

### D1+D4 — Corte de frango: base corrigida contra a TACO, composto = média dos valores CORRIGIDOS

O dono escolheu (a) "média da base + duas chaves" **e** (b) "corrigir coxa/sobrecoxa contra a TACO".
As duas juntas resolvem a contradição que o §2.3 apontava: a média passa a ser dos valores novos.

```ts
// Valores TACO deste projeto (conferidos no banco):
'coxa':      { kcal: 167, p: 26.9, c: 0, f: 5.9 }   // era 160/25/0/6   — Frango, coxa, sem pele, cozida
'sobrecoxa': { kcal: 233, p: 29.2, c: 0, f: 12.0 }  // era 165/24/0/7   — Frango, sobrecoxa, sem pele, assada

// Composto = média das duas acima. Duas chaves, com approx.unidade diferente:
'coxa e sobrecoxa':      { kcal: 200, p: 28.0, c: 0, f: 8.9, approx: { unidade: 210 } }  // peça com osso
'file de coxa e sobrecoxa': { kcal: 200, p: 28.0, c: 0, f: 8.9, approx: { unidade: 90 } } // desossado
```

Mais as variantes de escrita: `sobrecoxa e coxa`, `coxa e sobrecoxa de frango`,
`file de coxa e sobrecoxa de frango`, `file de coxa`, `file de sobrecoxa`.

⚠️ **Isto muda a conta de quem já lança "coxa" ou "sobrecoxa"** — refeições FUTURAS,
nunca as gravadas. Decisão consciente do dono.

### D3 — TODOS os 73 aliases genéricos ganham entrada curada

O dono escolheu a opção que o plano classificou como "projeto próprio". Fica registrado
que o aviso foi dado e a decisão foi mantida. Ou seja: a frente C não descarta os aliases
ambíguos e deixa 70 palavras caírem na IA — ela **cura as 73** contra a TACO.

**Método obrigatório para cada alias:** listar as linhas da TACO que o reivindicam e
escolher a que representa o **sentido genérico e mais comum** da palavra em português
brasileiro — preparo básico (cozido/cru/assado simples), nunca preparação composta.
Exemplos do critério: `arroz` → "Arroz, tipo 1, cozido" (não "Arroz carreteiro");
`carne` → corte bovino magro genérico (não "carne bovina seca crua");
`leite` → "Leite de vaca integral" (não leite condensado).

Alias cujo sentido genérico for ambíguo DE VERDADE (a palavra não tem um representante
óbvio) fica **de fora e é reportado** — inventar um representante é o mesmo defeito, com
outra roupa.

### D5 — Execução delegada a subagente Sonnet

O dono está em Opus nesta sessão e escolheu delegar. A execução roda em subagentes
`general-purpose` com `model: "sonnet"`; o Opus revisa o que voltar (tsc, ESLint, suíte,
diff) antes de aceitar — resultado de subagente é insumo, não verdade.

### Decisões não perguntadas — seguem a recomendação do §9

- **D2 (padrão com osso vs filé):** duas chaves, `approx.unidade` 210 g / 90 g. Coberto por D1.
- **D6 (item sem quantidade registrada):** sem campo, com nota "quantidade não registrada — remova e adicione de novo". Não inventar 100 g.
- **D7 (layout no iPhone):** campo + `X` na mesma linha, nome truncado. É reversível e o dono decide vendo na tela.
