/**
 * Modo de preparo → ajuste de macros.
 *
 * O parser casa o alimento pela CABEÇA do nome ("frango frito" → chave 'frango'),
 * o que é certo pra identificar O QUE foi comido e errado pra saber QUANTO isso
 * pesa em gordura: "150g de frango frito" recebia os macros do frango grelhado
 * (4 g de gordura/100 g) e subestimava a refeição inteira. Este módulo lê o
 * MODIFICADOR que sobrou no nome e devolve o delta por 100 g do alimento.
 *
 * ── Calibragem (por 100 g do alimento) ──────────────────────────────────────
 * Os números foram conferidos contra a própria TACO (tabela `foods_taco` deste
 * projeto), comparando o mesmo alimento cru/cozido vs. preparado:
 *
 *   fritura        Δgordura observada na TACO, por 100 g de produto:
 *                  ovo 11→18,6 (+7,6) · camarão 0,3→15,6 (+15,3)
 *                  mandioca 0,3→11,2 (+10,9) · batata 0→13,1 (+13,1)
 *                  sardinha 11→12,7 (+1,7) · merluza filé frito 8,5
 *                  → +10 g é a mediana da faixa observada (1,7–15,3).
 *   à milanesa     frango filé à milanesa 7,8 g gord. / 7,5 g carbo (vs. 4/0 do
 *                  grelhado) · contra-filé à milanesa 24 g gord. / 12,2 g carbo
 *                  (vs. 10/0 do contra-filé) → faixa +3,8 a +14 de gordura e
 *                  +7,5 a +12 de carbo. Adotado +12/+8 (perfil da carne, que é o
 *                  caso dominante de "à milanesa" no lançamento do usuário).
 *                  ⚠ Para frango à milanesa isso superestima ~4 g de gordura.
 *   parmegiana     = milanesa + queijo/molho gratinado: +6 g de proteína além do
 *                  empanamento (≈40 g de mussarela por porção de 200 g).
 *   refogado/      gordura de panela: ~1 colher de azeite (13 g → 13 g de gord.)
 *   salteado       distribuída em ~250 g de alimento → +5 g/100 g.
 *   com molho      molho de tomate pronto (~60 g por porção de 200 g):
 *                  +3 g carbo, +2 g gordura por 100 g de alimento.
 *   creme/branco/  molho branco ou maionese (~30 g por porção de 200 g,
 *   maionese       ≈70% lipídio): +6 g gordura, +2 g carbo.
 *
 * LIMITE CONHECIDO: fritura também CONCENTRA o alimento (perda de água), o que
 * na TACO aparece como salto de carboidrato (batata cozida 11,9 → frita 35,6).
 * O modelo aqui só adiciona a gordura absorvida; para amidos fritos ele continua
 * subestimando. Quando a TACO tiver a entrada exata ("batata, inglesa, frita"),
 * ela ganha — e o ajuste não é aplicado (ver `keyEncodesPreparation`).
 *
 * As calorias NUNCA vêm de uma constante própria: saem dos macros por Atwater
 * (4/4/9) somados ao kcal curado do alimento (ver `applyPreparation`).
 */

/** Macros por 100 g — o mesmo formato do `FoodItem` da base. */
export type Macros100g = {
  kcal: number
  p: number
  c: number
  f: number
}

/** Um modificador de preparo reconhecido no nome do alimento. */
export type PreparationMatch = {
  /** Id estável (normalizado, sem acento). */
  id: string
  /** Rótulo curto pro usuário ("frito", "à milanesa"). */
  label: string
  /** Trecho do texto que casou ("fritos", "empanada"). */
  matchedText: string
  /** Delta de proteína por 100 g do alimento. */
  protein: number
  /** Delta de carboidrato por 100 g do alimento. */
  carbs: number
  /** Delta de gordura por 100 g do alimento. */
  fat: number
  /** Só reconhecimento, sem ajuste (grelhado, cozido, air fryer...). */
  neutral: boolean
  /**
   * Cancela os modificadores que ADICIONAM gordura. "2 ovos fritos sem óleo" e
   * "frango frito na air fryer" não podem ganhar os +10 g da fritura — o usuário
   * disse explicitamente que não teve gordura.
   */
  cancels: boolean
}

type Modifier = {
  id: string
  label: string
  /** Alternativas já NORMALIZADAS (minúsculas, sem acento e sem pontuação). */
  tokens: readonly string[]
  protein?: number
  carbs?: number
  fat?: number
  cancels?: boolean
}

/**
 * Ordem não importa: quem vence é o de MAIOR impacto calórico (ver
 * `detectPreparation`), com os canceladores tendo prioridade absoluta.
 *
 * Os tokens já estão na forma que `normalizeFoodText` (parser.ts) produz — sem
 * acento e sem pontuação: "à dorê" → "a dore", "à milanesa" → "a milanesa".
 * Variações de gênero/número entram como alternativas explícitas em vez de
 * regex solta, pra não casar dentro de outra palavra.
 */
const MODIFIERS: readonly Modifier[] = [
  // ── Adicionam gordura ─────────────────────────────────────────────────────
  {
    id: 'frito',
    label: 'frito',
    tokens: [
      'frito', 'frita', 'fritos', 'fritas',
      'a dore', 'dore',
      'crocante', 'crocantes',
    ],
    fat: 10,
  },
  {
    id: 'milanesa',
    label: 'à milanesa',
    tokens: [
      'a milanesa', 'milanesa',
      'empanado', 'empanada', 'empanados', 'empanadas',
    ],
    fat: 12,
    carbs: 8,
  },
  {
    id: 'parmegiana',
    label: 'à parmegiana',
    tokens: [
      'a parmegiana', 'parmegiana', 'parmegianas',
      'a parmigiana', 'parmigiana',
      'a parmeggiana', 'parmeggiana',
    ],
    fat: 12,
    carbs: 8,
    protein: 6,
  },
  {
    id: 'refogado',
    label: 'refogado',
    tokens: [
      'refogado', 'refogada', 'refogados', 'refogadas',
      'salteado', 'salteada', 'salteados', 'salteadas',
      'na manteiga', 'com manteiga',
      'no azeite', 'com azeite',
    ],
    fat: 5,
  },
  {
    // Só o molho NOMEADO. "com molho" seco é ambíguo em PT-BR (molho da própria
    // carne, molho de salada, shoyu...) e é exatamente a frase do caso reportado
    // "300g carne picada com molho", cujo teste de regressão fixa os macros da
    // carne pura — ver `parserSynonyms.test.ts`. Fica reconhecido como neutro
    // logo abaixo, e o ajuste só entra quando o usuário diz QUAL molho.
    id: 'molho de tomate',
    label: 'ao molho de tomate',
    tokens: [
      'com molho de tomate', 'ao molho de tomate', 'no molho de tomate',
      'molho de tomate',
      'ao sugo', 'com sugo',
      'a bolonhesa', 'com bolonhesa', 'bolonhesa',
    ],
    carbs: 3,
    fat: 2,
  },
  {
    id: 'creme',
    label: 'com creme',
    tokens: [
      'com creme', 'ao creme',
      'molho branco', 'ao molho branco', 'com molho branco',
      'com maionese', 'na maionese',
    ],
    fat: 6,
    carbs: 2,
  },

  // ── Neutros: reconhecidos, sem ajuste ─────────────────────────────────────
  {
    id: 'grelhado',
    label: 'grelhado',
    tokens: ['grelhado', 'grelhada', 'grelhados', 'grelhadas'],
  },
  {
    id: 'cozido',
    label: 'cozido',
    tokens: ['cozido', 'cozida', 'cozidos', 'cozidas'],
  },
  {
    id: 'assado',
    label: 'assado',
    tokens: ['assado', 'assada', 'assados', 'assadas', 'no forno'],
  },
  {
    id: 'cru',
    label: 'cru',
    tokens: ['cru', 'crua', 'crus', 'cruas'],
  },
  {
    id: 'vapor',
    label: 'no vapor',
    tokens: ['no vapor', 'a vapor'],
  },
  {
    id: 'light',
    label: 'light',
    tokens: ['light', 'diet'],
  },
  {
    id: 'desnatado',
    label: 'desnatado',
    tokens: ['desnatado', 'desnatada', 'desnatados', 'desnatadas'],
  },
  {
    // "com molho" sem dizer qual: reconhecido, mas sem ajuste (ver o modificador
    // 'molho de tomate' acima). Existe pra que o molho genérico não seja
    // silenciosamente ignorado nem vire estimativa inventada.
    id: 'molho generico',
    label: 'com molho',
    tokens: ['com molho', 'ao molho', 'no molho'],
  },

  // ── Neutros que CANCELAM a gordura de fritura ─────────────────────────────
  {
    id: 'air fryer',
    label: 'na air fryer',
    tokens: ['na air fryer', 'air fryer', 'airfryer', 'na airfryer'],
    cancels: true,
  },
  {
    id: 'sem oleo',
    label: 'sem óleo',
    tokens: ['sem oleo', 'sem azeite', 'sem manteiga', 'sem gordura'],
    cancels: true,
  },
]

/** Escapa o token pra virar regex literal. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Regex de PALAVRA inteira, sem lookbehind de propósito: o app roda dentro do
 * WKWebView do iOS do usuário e lookbehind só existe do Safari 16.4 em diante.
 * O grupo 1 é o trecho casado.
 */
const TOKEN_PATTERNS: ReadonlyArray<{ modifier: Modifier; regex: RegExp }> = MODIFIERS.flatMap(
  (modifier) =>
    modifier.tokens.map((token) => ({
      modifier,
      regex: new RegExp(`(?:^|\\s)(${escapeRegex(token)})(?=\\s|$)`),
    })),
)

function toMatch(modifier: Modifier, matchedText: string): PreparationMatch {
  const protein = modifier.protein ?? 0
  const carbs = modifier.carbs ?? 0
  const fat = modifier.fat ?? 0
  return {
    id: modifier.id,
    label: modifier.label,
    matchedText,
    protein,
    carbs,
    fat,
    neutral: protein === 0 && carbs === 0 && fat === 0,
    cancels: modifier.cancels === true,
  }
}

/** Peso calórico do ajuste — serve só pra escolher o modificador dominante. */
function impactOf(match: PreparationMatch): number {
  return Math.abs(match.protein) * 4 + Math.abs(match.carbs) * 4 + Math.abs(match.fat) * 9
}

/**
 * Acha o modo de preparo no nome JÁ NORMALIZADO do alimento (minúsculo, sem
 * acento e sem pontuação — a saída de `normalizeFoodText` no parser).
 *
 * Regras quando mais de um casa:
 *  1. Cancelador ganha de tudo ("2 ovos fritos sem oleo" → sem óleo, zero ajuste).
 *  2. Senão vence o de maior impacto calórico ("frango grelhado com molho" →
 *     com molho; o neutro só ganha quando é o único).
 *  3. Empate → o trecho de texto mais longo (mais específico).
 */
export function detectPreparation(normalizedFoodName: string): PreparationMatch | null {
  const text = String(normalizedFoodName || '').trim()
  if (!text) return null

  const found: PreparationMatch[] = []
  for (const { modifier, regex } of TOKEN_PATTERNS) {
    const m = text.match(regex)
    if (m && m[1]) found.push(toMatch(modifier, m[1]))
  }
  if (found.length === 0) return null

  const canceller = found.find((f) => f.cancels)
  if (canceller) return canceller

  let best = found[0]!
  for (const candidate of found) {
    const better =
      impactOf(candidate) > impactOf(best) ||
      (impactOf(candidate) === impactOf(best) &&
        candidate.matchedText.length > best.matchedText.length)
    if (better) best = candidate
  }
  return best
}

/**
 * A chave do alimento que casou JÁ codifica este preparo?
 *
 * A base tem 'frango grelhado', 'ovo cozido', 'batata cozida', 'arroz cozido',
 * 'peixe grelhado'... — nesses casos os macros curados já são os do preparo e
 * aplicar o delta contaria duas vezes. Mesma coisa pra TACO ("batata, inglesa,
 * frita"), que tem o número medido de verdade.
 */
export function keyEncodesPreparation(normalizedKey: string, prep: PreparationMatch): boolean {
  const key = String(normalizedKey || '').trim()
  if (!key) return false
  return TOKEN_PATTERNS.some(
    ({ modifier, regex }) => modifier.id === prep.id && regex.test(key),
  )
}

/**
 * Aplica o delta do preparo sobre os macros por 100 g.
 *
 * As calorias NÃO são um número próprio da tabela: são o kcal curado do alimento
 * + o delta dos macros por Atwater (4/4/9). Manter o kcal curado como base evita
 * jogar fora a energia medida da TACO (que já considera fibra e álcool); só o
 * que o preparo ACRESCENTA é estimado.
 */
export function applyPreparation(macrosPer100g: Macros100g, prep: PreparationMatch): Macros100g {
  const num = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  const baseP = num(macrosPer100g?.p)
  const baseC = num(macrosPer100g?.c)
  const baseF = num(macrosPer100g?.f)
  const baseKcal = num(macrosPer100g?.kcal)

  if (!prep || prep.neutral) {
    return { kcal: baseKcal, p: baseP, c: baseC, f: baseF }
  }

  const dp = num(prep.protein)
  const dc = num(prep.carbs)
  const df = num(prep.fat)

  return {
    kcal: Math.max(0, baseKcal + dp * 4 + dc * 4 + df * 9),
    p: Math.max(0, baseP + dp),
    c: Math.max(0, baseC + dc),
    f: Math.max(0, baseF + df),
  }
}
