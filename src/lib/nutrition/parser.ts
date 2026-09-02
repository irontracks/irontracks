import { foodDatabase } from './food-database'
import type { FoodItem } from './food-database'
import type { MealLog } from './engine'
import { detectPreparation, keyEncodesPreparation, applyPreparation } from './preparation'

function normalizeFoodText(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Preserva o decimal com v\u00edrgula ("1,5" \u2192 "1.5") ANTES de tirar a pontua\u00e7\u00e3o \u2014
    // sen\u00e3o "1,5 prato" virava "1 5 prato" e o parser lia qtd=5 (~3,3\u00d7 a mais).
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-zA-Z0-9.\s]/g, ' ') // mant\u00e9m o ponto (separador decimal)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Pre-computed entries from the static food database. */
const normalizedFoodEntries = Object.entries(foodDatabase).map(([key, item]) => {
  const normalizedKey = normalizeFoodText(key)
  return { key, normalizedKey, item, normalizedKeyLength: normalizedKey.length }
})

/**
 * Tira o conector "de" que SOBRA depois de remover a quantidade:
 * "2 fatias de pão" → (remove "2 fatias") → " de pão" → "pão".
 *
 * Ancorado no início de propósito. Antes era `.replace(' de ', ' ')` — String.replace
 * sem âncora, que troca a PRIMEIRA ocorrência onde quer que ela esteja. Quando o
 * resto não começava com " de ", ele comia o " de " que é parte do NOME:
 *   "1 pao de queijo"  → "pao queijo"  → não casa nada        → refeição rejeitada
 *   "1 clara de ovo"   → "clara ovo"   → não casa 'clara de ovo',
 *                                        mas CASA 'ovo'       → ovo inteiro, 4,5×
 * A inconsistência que denunciava o bug: "1 unidade de pao de queijo" funcionava
 * (aí o resto começa com " de ", e o replace fazia o que devia).
 */
function stripLeadingDe(text: string): string {
  return text.trim().replace(/^de\s+/i, '').trim()
}

/** Escapa o texto pra virar regex literal. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Regex da chave, exigindo PALAVRA inteira. O match era `foodName.includes(key)`, e
 * substring cru deixava alimento curto roubar o longo: "macarrao" contém "maca", e
 * macarrão virava MAÇÃ (78 kcal). Depois de "maca" vem "r", não "s" nem espaço —
 * a borda de palavra mata isso sem quebrar plural.
 */
function buildKeyPattern(key: string): string {
  // Plural OPCIONAL em cada palavra, não só na última: o usuário escreve
  // "3 claraS de ovo" e a chave é 'clara de ovo'. Com o -s só no fim, isso não
  // casava a clara e casava 'ovo' — ovo inteiro, 4,5×. Mesmo caso de
  // "castanhaS de caju".
  return key
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${escapeRegex(word)}s?`)
    .join('\\s+')
}

/**
 * A chave é a CABEÇA do nome — o prato em si, não um ingrediente citado depois?
 *
 * Em português o substantivo principal vem primeiro: "esfirra de frango com
 * requeijão" é uma ESFIRRA; "frango com alho" é FRANGO. O parser elegia a maior
 * chave que aparecesse em QUALQUER lugar da frase, e aí o prato perdia pro
 * ingrediente mais bem-nomeado:
 *   "1 esfirra de frango com requeijao" → 'requeijao'(9) ganhava de 'esfirra'(7)
 *                                       → 15g de requeijão = 39 kcal (real: 224)
 *   "1 torta de banana"                 → 'banana' → 71 kcal
 *   "1 sanduiche com bacon"             → 'bacon'  → 81 kcal
 * A cabeça agora tem prioridade absoluta sobre qualquer match no meio.
 */
function matchesAtHead(foodName: string, key: string): boolean {
  if (!key) return false
  const pattern = buildKeyPattern(key)
  if (!pattern) return false
  return new RegExp(`^${pattern}(\\s|$)`).test(foodName)
}

/**
 * A chave é a FRASE INTEIRA, não só a cabeça — reservado para chaves
 * genéricas (`FoodItem.generic`).
 *
 * Uma palavra genérica ("arroz", "carne", "batata"…) representa UM alimento
 * específico escolhido por curadoria (ver `food-database.ts`), e casar por
 * CABEÇA a deixava sequestrar qualquer frase que começasse com ela:
 * "leite condensado" virava "leite" (1/5 da caloria real), "batata doce"
 * virava a batata inglesa, "arroz com frango" perdia o frango. A palavra só
 * pode responder pela frase quando é a frase inteira — sobrando qualquer
 * coisa, quem resolve é a TACO ou a IA, que leem o resto.
 */
function matchesEntirePhrase(foodName: string, key: string): boolean {
  if (!key) return false
  const pattern = buildKeyPattern(key)
  if (!pattern) return false
  return new RegExp(`^${pattern}$`).test(foodName)
}

type FoodEntry = { key: string; normalizedKey: string; item: FoodItem; normalizedKeyLength: number }

/**
 * Lista de alimentos: a base estática + os extras (TACO/customizados do usuário).
 * Não há precedência por origem — quem vence é a maior chave que casa na CABEÇA do
 * nome (ver o loop do match). O comentário antigo aqui dizia "static always wins",
 * o que nunca foi verdade.
 */
function buildFoodEntries(extraFoods?: Record<string, FoodItem>): FoodEntry[] {
  if (!extraFoods || Object.keys(extraFoods).length === 0) return normalizedFoodEntries
  const extras = Object.entries(extraFoods).map(([key, item]) => {
    const normalizedKey = normalizeFoodText(key)
    return { key, normalizedKey, item, normalizedKeyLength: normalizedKey.length }
  })
  return [...normalizedFoodEntries, ...extras]
}

// Pesos-por-porção TÍPICOS (g) para alimentos externos (TACO/OFF/aprendidos) que
// não trazem tabela `approx`. Antes tudo caía num fixo de 50 g — "1 prato" e "1
// fatia" pesavam igual, errando muito (fatia de pão ~2× a mais, prato ~5× a menos).
// Continua sendo estimativa (o ideal é o alimento ter `approx`), mas erra bem menos.
const TYPICAL_GRAMS_PER_UNIT: Record<string, number> = {
  colher: 15,
  concha: 80,
  bife: 100,
  fatia: 25,
  pedaco: 50,
  lata: 150,
  scoop: 30,
  xicara: 120,
  copo: 200,
  prato: 250,
  rodela: 20,
  espiga: 100,
  posta: 120,
  medalhao: 80,
  espetinho: 80,
  unidade: 50,
}

/**
 * Ordem de "quão porção é esta unidade", da refeição inteira pro tempero.
 *
 * Serve pra responder "quanto pesa UM/UMA <alimento>?" quando o alimento NÃO declara
 * `unidade`. A base omite `unidade` de propósito em quem não tem unidade natural —
 * "1 picanha" não significa nada —, mas declara em que o alimento É medido:
 *   'arroz cozido'   → { colher: 25, concha: 100, prato: 180 }
 *   'leite integral' → { copo: 250, xicara: 240 }
 *   'atum em lata'   → { lata: 120 }
 * Antes, esse sinal era ignorado e virava 50g de qualquer coisa. Agora pegamos a
 * porção mais representativa que o PRÓPRIO alimento declara — nenhum número novo é
 * inventado aqui, só escolhido entre os que já foram curados.
 */
const SERVING_UNIT_PRIORITY: readonly string[] = [
  'prato',
  'concha',
  'copo',
  'xicara',
  'lata',
  'bife',
  'posta',
  'medalhao',
  'espiga',
  'espetinho',
  'fatia',
  'pedaco',
  'rodela',
  'scoop',
  'colher',
]

/** Peso de uma porção do alimento, escolhido entre as unidades que ele declara. */
function servingGramsOf(approx: Record<string, number> | undefined): number | undefined {
  if (!approx) return undefined
  for (const unit of SERVING_UNIT_PRIORITY) {
    const g = approx[unit]
    if (typeof g === 'number' && Number.isFinite(g) && g > 0) return g
  }
  return undefined
}

type MacroTotals = { p: number; c: number; f: number; kcal: number }

/** A single recognized food line, with its resolved grams and macros. */
export type ParsedMealItem = {
  label: string
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
  /**
   * Modo de preparo detectado no texto e que ALTEROU os macros ("frito",
   * "à milanesa"). Ausente quando não há preparo, quando ele é neutro
   * (grelhado/cozido) ou quando a chave do alimento já o codifica — nesses casos
   * nada foi somado. Opcional de propósito: quem consome o item continua válido
   * sem ele.
   */
  preparation?: string
  /**
   * O peso foi CHUTADO pelo app, não informado pelo usuário.
   *
   * `true` quando a quantidade veio em unidade ("1 pizza", "2 fatias") e o app
   * converteu para gramas — inclusive pelo último recurso de 50g, que é o que
   * já produziu "uma pizza grande = 50g = 133 kcal". `false` quando o usuário
   * escreveu o peso ("140g de atum").
   *
   * Quem usa isso é o prompt do chat: pedir para a IA "citar o peso assumido"
   * em TODA resposta fazia ela escrever "(que o app assumiu como 140g)" para um
   * peso que a própria pessoa tinha acabado de digitar — ruído que mina a
   * confiança no número. O aviso existe para o CHUTE, não para o dado.
   */
  assumedWeight?: boolean
}

/** Full breakdown of a meal: totals, per-item detail and unrecognized lines. */
export type MealAnalysis = {
  meal: MealLog
  items: ParsedMealItem[]
  unknownLines: string[]
}

/**
 * Like {@link parseInput}, but never throws: returns the recognized totals,
 * the per-item breakdown and the list of lines we couldn't match. Used by the
 * live "simulação" preview so the user sees partial macros while typing.
 */
/**
 * Uma quantidade sobrando depois do alimento que casou: "…mais 70g de soja",
 * "…com 400ml de leite", "…e 2 ovos".
 *
 * Exige número + unidade + ALGO DEPOIS. As duas condições foram medidas:
 *
 *  - sem a unidade, nome de produto com dígito ("whey 100%", "coca zero 350")
 *    viraria desconhecido e gastaria uma chamada paga à toa;
 *  - sem o "algo depois", `1 fatia de pão integral 50g` regredia — ali o 50g
 *    QUALIFICA a fatia, não abre uma segunda comida. (Medido: 74 kcal antes,
 *    desconhecido depois. Era falso positivo meu.)
 *
 * "com 30g de whey" casa; "…pão integral 50g" não.
 */
const SOBRA_COM_QUANTIDADE = /\b\d+(?:[.,]\d+)?\s*(?:g|gr|kg|ml|l|colher(?:es)?|conchas?|fatias?|unidades?|un|scoops?|doses?|copos?|latas?|pedacos?)\b\s+\S/i

/** A quantidade e o nome do alimento, lidos de uma linha já normalizada. */
export type QuantidadeDaLinha = { qtd: number; unitUsed: string; foodName: string; wasApprox: boolean }

const APPROX_UNIT_REGEX =
  /(\d+(?:[.,]\d+)?)\s*(colher(?:es)?|conchas?|bifes?|fatias?|pedacos?|latas?|scoops?|doses?|unidades?|xicaras?|copos?|pratos?|rodelas?|espigas?|postas?|medalh(?:ao|oes)?|espetinhos?|un|unid)\b/i
const GRAM_UNIT_REGEX = /(\d+(?:[.,]\d+)?)\s*(g|gr|ml)\b/i
const COUNT_UNIT_REGEX = /^(\d+(?:[.,]\d+)?)\s+(.+)$/i

function parseQtdNum(raw: string): number {
  return Number.parseFloat(String(raw || '0').replace(',', '.'))
}

/**
 * Lê QUANTO e O QUE de uma linha já normalizada ("200g coxa e sobrecoxa" →
 * qtd 200, unitUsed 'g', foodName "coxa e sobrecoxa").
 *
 * Extraída do corpo de `analyzeMeal` (era inline) porque `separarPorConectorE`
 * também precisa saber onde a quantidade termina e o NOME começa — sem isso,
 * "200g Coxa e sobrecoxa" seria testado como "200g coxa" + "e" + "sobrecoxa",
 * e o "200g" ficaria colado à palavra errada na hora de checar se a frase
 * bate com uma chave composta.
 */
export function lerQuantidadeDaLinha(normalizedLine: string): QuantidadeDaLinha {
  const approxMatch = normalizedLine.match(APPROX_UNIT_REGEX)
  const gramMatch = normalizedLine.match(GRAM_UNIT_REGEX)
  const countMatch = normalizedLine.match(COUNT_UNIT_REGEX)

  let qtd = 0
  let foodName = ''
  let unitUsed = 'g'
  let wasApprox = false

  // "ovo(s)" is deliberately NOT a unit here: it's an actual food in the
  // database, and treating it as a unit ate the food name ("2 ovos cozidos"
  // → unit "ovos" + name "cozidos" → no match). Let count-parsing handle it.
  if (approxMatch) {
    qtd = parseQtdNum(approxMatch[1] || '0')
    const unitRaw = (approxMatch[2] || '').toLowerCase()

    if (unitRaw.startsWith('colher')) unitUsed = 'colher'
    else if (unitRaw.startsWith('concha')) unitUsed = 'concha'
    else if (unitRaw.startsWith('bife')) unitUsed = 'bife'
    else if (unitRaw.startsWith('fatia')) unitUsed = 'fatia'
    else if (unitRaw.startsWith('pedaco')) unitUsed = 'pedaco'
    else if (unitRaw.startsWith('lata')) unitUsed = 'lata'
    else if (unitRaw.startsWith('scoop') || unitRaw.startsWith('dose')) unitUsed = 'scoop'
    else if (unitRaw.startsWith('xicara')) unitUsed = 'xicara'
    else if (unitRaw.startsWith('copo')) unitUsed = 'copo'
    else if (unitRaw.startsWith('prato')) unitUsed = 'prato'
    else if (unitRaw.startsWith('rodela')) unitUsed = 'rodela'
    else if (unitRaw.startsWith('espiga')) unitUsed = 'espiga'
    else if (unitRaw.startsWith('posta')) unitUsed = 'posta'
    else if (unitRaw.startsWith('medalh')) unitUsed = 'medalhao'
    else if (unitRaw.startsWith('espetinho')) unitUsed = 'espetinho'
    else unitUsed = 'unidade'

    foodName = stripLeadingDe(normalizedLine.replace(approxMatch[0] || '', '')).toLowerCase()
    // When the unit IS the food ("2 ovos" → unit "ovos", empty name), fall back
    // to the unit word as the food name so it still matches the database.
    if (!foodName) foodName = (approxMatch[2] || '').trim().toLowerCase()
    wasApprox = true
  } else if (gramMatch) {
    qtd = parseQtdNum(gramMatch[1] || '0')
    unitUsed = String(gramMatch[2] || '').toLowerCase() === 'ml' ? 'ml' : 'g'
    foodName = stripLeadingDe(normalizedLine.replace(gramMatch[0] || '', '')).toLowerCase()
  } else if (countMatch) {
    qtd = parseQtdNum(countMatch[1] || '0')
    unitUsed = 'unidade'
    foodName = stripLeadingDe(countMatch[2] || '').toLowerCase()
    wasApprox = true
  } else {
    qtd = 1
    unitUsed = 'unidade'
    foodName = normalizedLine
    wasApprox = true
  }

  return { qtd, unitUsed, foodName, wasApprox }
}

/**
 * Qualificadores que NÃO abrem alimento novo depois de " e " — mesmo
 * raciocínio de `SOBRA_COM_QUANTIDADE`: quantidade denuncia comida nova,
 * qualificador não é comida. Lista FECHADA de propósito: texto sem dígito e
 * fora desta lista continua separando ("ovo e banana", "arroz e feijão" —
 * "banana"/"feijão" não estão aqui, então seguem abrindo item novo).
 */
const QUALIFICADORES = [
  'sem osso',
  'sem pele',
  'sem gordura',
  'sem lactose',
  'sem acucar',
  'sem sal',
  'sem casca',
  'com pele',
  'ao natural',
]

function ehQualificador(trecho: string): boolean {
  const normalized = normalizeFoodText(trecho)
  if (!normalized) return false
  if (/\d/.test(normalized)) return false
  return QUALIFICADORES.some((q) => normalized === q || normalized.startsWith(`${q} `))
}

/**
 * Chaves compostas que contêm um " e " literal (ex. 'coxa e sobrecoxa'),
 * ordenadas da mais longa pra mais curta — para achar o casamento mais
 * específico primeiro.
 */
function chavesCompostasComE(entries: FoodEntry[]): string[] {
  const set = new Set<string>()
  for (const e of entries) {
    if (e.normalizedKey.includes(' e ')) set.add(e.normalizedKey)
  }
  return Array.from(set).sort((a, b) => b.length - a.length)
}

/**
 * Separador de " e " que RESPEITA nome composto e qualificador.
 *
 * O comentário antigo aqui dizia "nenhum alimento da base contém um ' e '
 * solitário, então é seguro separar cegamente" — e isso já era FALSO antes
 * desta correção: 'legumes e salada' virava DOIS alimentos (legumes + salada)
 * em vez de um, código morto por causa disso desde que o split existe. "Coxa
 * e sobrecoxa" é o mesmo problema com um corte de frango real, reportado
 * pelo dono.
 *
 * Duas perguntas, nesta ordem:
 *  1. A CABEÇA da linha (depois de tirar a quantidade) casa uma chave
 *     composta com " e " (ex. 'coxa e sobrecoxa')? Então essa chave DEFINE o
 *     alimento e o " e " dela não separa — mesma filosofia de `matchesAtHead`
 *     (quem manda é o INÍCIO do nome). Isso só é testado UMA VEZ, contra a
 *     cabeça da linha inteira: depois de resolvido, um " e " SUBSEQUENTE
 *     (ex. "coxa e sobrecoxa E banana") não reabre essa pergunta — senão
 *     "banana" seria engolido pelo corte de frango.
 *  2. Não sendo isso, o lado direito é um QUALIFICADOR (ver acima)? Então
 *     também não separa — "sem pele e sem osso" é uma coisa só.
 *
 * Fora dessas duas, separa como sempre: "ovo e banana" → dois; "arroz e
 * feijão" → dois; "200g de frango e 100g de arroz" → dois.
 */
export function separarPorConectorE(line: string, entries: FoodEntry[]): string[] {
  const raw = String(line || '')
  const matches = Array.from(raw.matchAll(/\s+e\s+/gi))
  if (matches.length === 0) return [raw]

  const segments: string[] = []
  let cursor = 0
  for (const m of matches) {
    const idx = m.index ?? 0
    segments.push(raw.slice(cursor, idx))
    cursor = idx + m[0].length
  }
  segments.push(raw.slice(cursor))

  const composed = chavesCompostasComE(entries)
  const result: string[] = []
  let current = segments[0] ?? ''
  let nomeCompostoResolvido = false

  for (let i = 0; i < matches.length; i += 1) {
    const connectorText = matches[i][0]
    const rightSeg = segments[i + 1] ?? ''
    const joined = `${current}${connectorText}${rightSeg}`

    if (!nomeCompostoResolvido) {
      const { foodName } = lerQuantidadeDaLinha(normalizeFoodText(joined))
      const chave = composed.find((c) => matchesAtHead(foodName, c))
      if (chave) {
        current = joined
        nomeCompostoResolvido = true
        continue
      }
    }

    if (ehQualificador(rightSeg)) {
      current = joined
      continue
    }

    result.push(current)
    current = rightSeg
    nomeCompostoResolvido = false
  }
  result.push(current)
  return result
}

export function analyzeMeal(text: string, extraFoods?: Record<string, FoodItem>): MealAnalysis {
  const rawText = typeof text === 'string' ? text : ''
  const empty: MealAnalysis = {
    meal: { foodName: 'Refeição', calories: 0, protein: 0, carbs: 0, fat: 0 },
    items: [],
    unknownLines: [],
  }
  if (!rawText.trim()) return empty

  // Fora do loop, e ANTES do cálculo de `lines`: o separador de " e " precisa
  // conhecer as chaves compostas (`chavesCompostasComE`) para decidir se um
  // conector separa ou não — ver `separarPorConectorE`.
  const allFoodEntries = buildFoodEntries(extraFoods)

  const lines = rawText
    .split('\n')
    .flatMap((l) => String(l || '').split(/\s*\+\s*/g))
    .flatMap((l) => String(l || '').split(/\s*;\s*/g))
    // Comma followed by whitespace is an item separator ("arroz, frango"),
    // but a comma between digits is a decimal ("1,5 colher") — keep that intact.
    .flatMap((l) => String(l || '').split(/,\s+/g))
    // " e " between items is also a separator ("banana e iogurte") — mas NÃO
    // cegamente: nome composto ("coxa e sobrecoxa") e qualificador ("sem pele
    // e sem osso") não separam. Ver `separarPorConectorE`.
    .flatMap((l) => separarPorConectorE(String(l || ''), allFoodEntries))
    // " mais " idem ("140g de atum mais 70g de soja") — ninguém escreve um
    // alimento com "mais" no meio do nome.
    //
    // ⚠️ " com " fica de FORA de propósito: ele costuma ligar o PRATO ao seu
    // ingrediente ("esfirra de frango com requeijão", "sanduíche com bacon"), e
    // separar reintroduziria o bug que o `matchesAtHead` existe para matar — o
    // ingrediente ganhando do prato e devolvendo 39 kcal no lugar de 224. Quem
    // cuida do "com" é a desconfiança de sobra, abaixo.
    .flatMap((l) => String(l || '').split(/\s+mais\s+/gi))
    .map((l) => String(l || '').trim())
    .filter(Boolean)
  let mealName = 'Refeição'
  const totals: MacroTotals = { p: 0, c: 0, f: 0, kcal: 0 }
  const unknownLines: string[] = []
  const items: ParsedMealItem[] = []

  // Primeira linha FÍSICA (antes dos splits de item). Ver isTitleLine.
  const firstPhysicalLine = (rawText.split('\n')[0] || '').trim()

  /**
   * A primeira linha é o NOME da refeição ("Almoço", "Café da manhã")?
   *
   * Antes bastava "index 0, sem dígito, tem mais linhas" — e isso perdia comida em
   * SILÊNCIO: o split de " e "/vírgula/"+" também produz "linhas", então
   * "ovo e banana" virava nome="ovo" e o ovo era descartado sem virar nem
   * unknownLine. Por isso "200g de frango e 100g de arroz" funcionava (tem dígito,
   * escapava da heurística) e "ovo e banana" não.
   *
   * Duas condições agora:
   *  1. Tem que ser a primeira linha FÍSICA inteira — se veio de um separador de
   *     item, não é título, é comida.
   *  2. Não pode ser um alimento conhecido. Comparação EXATA de propósito: o match
   *     de alimento é por substring, e "café da manhã" contém "café" — com
   *     substring, o nome da refeição viraria 200g de café.
   */
  const isTitleLine = (index: number, rawLine: string): boolean => {
    if (index !== 0 || lines.length < 2) return false
    if (rawLine !== firstPhysicalLine) return false
    if (/\d/.test(rawLine)) return false
    const normalized = normalizeFoodText(rawLine)
    return !allFoodEntries.some((e) => e.normalizedKey === normalized)
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const rawLine = (line || '').trim()
    if (!rawLine) continue

    if (isTitleLine(index, rawLine)) {
      mealName = rawLine
      continue
    }

    const normalizedLine = normalizeFoodText(rawLine)
    if (!normalizedLine) continue

    const { qtd, unitUsed, foodName, wasApprox } = lerQuantidadeDaLinha(normalizedLine)

    if (!Number.isFinite(qtd) || qtd <= 0) {
      unknownLines.push(rawLine)
      continue
    }

    // SÓ a cabeça do nome. Entre as que casam na cabeça, a chave maior vence.
    //
    // Não há fallback pra "casou em algum lugar da frase", e isso é deliberado: era
    // ele que fazia o INGREDIENTE ganhar do PRATO, sempre em silêncio —
    //   "1 esfirra de frango com requeijao" → 15g de requeijão  = 39 kcal (real 224)
    //   "1 sanduiche com bacon"             → 15g de bacon      = 81 kcal
    //   "1 torta de banana"                 → uma banana        = 71 kcal
    // Um número plausível e errado é pior que não reconhecer: ninguém confere o que
    // parece certo. Sem cabeça conhecida, a linha vira unknownLine e a cascata
    // resolve com quem sabe mais — TACO (590 alimentos com alias curto) e, no fim,
    // a IA, que lê a frase inteira ("de banana", "com requeijão") e acerta onde uma
    // tabela estática não tem como.
    // Chave GENÉRICA ('arroz', 'carne', 'batata'…) é um caso à parte: ela só
    // pode responder pela linha INTEIRA, nunca pela cabeça — ver
    // `matchesEntirePhrase`. Sem isso "batata doce" caía em 'batata' (a
    // inglesa) e "arroz com frango" perdia o frango pro 'arroz' sozinho.
    let matchedItem: FoodItem | null = null
    let dbKeyMatched = ''
    for (const entry of allFoodEntries) {
      if (!entry.normalizedKey) continue
      const matches = entry.item.generic
        ? matchesEntirePhrase(foodName, entry.normalizedKey)
        : matchesAtHead(foodName, entry.normalizedKey)
      if (!matches) continue
      if (!matchedItem || entry.normalizedKeyLength > dbKeyMatched.length) {
        dbKeyMatched = entry.normalizedKey
        matchedItem = entry.item
      }
    }

    if (!matchedItem) {
      unknownLines.push(rawLine)
      continue
    }

    /**
     * A cabeça casou — mas sobrou COMIDA COM QUANTIDADE no resto da linha?
     *
     * O match é pela cabeça e ignora o resto, o que está certo para modo de
     * preparo ("frango GRELHADO") e para prato composto ("esfirra de frango COM
     * requeijão", que é um item só). O que ele não via era uma SEGUNDA porção
     * escondida ali dentro:
     *
     *   "140g de atum sólido ao natural mais 70g de proteína de soja
     *    com 400ml de leite desnatado"  →  casava 'atum', 140g, 162 kcal
     *
     * — o mesmo valor de comer só o atum, e sem sobrar `unknownLine` para a
     * cascata desconfiar. Ou seja: falha SILENCIOSA com cara de sucesso, e o
     * usuário recebia o botão "Lançar no diário" com ~1/3 das calorias reais
     * (relatado no iPhone, 25/08/2026). Um número plausível e errado é pior que
     * não reconhecer — ninguém confere o que parece certo.
     *
     * Aqui a linha vira `unknownLine` e a cascata segue para TACO/OFF/IA, que
     * leem a frase inteira. Nada é inventado: o parser só admite que não é o
     * dono desta linha.
     */
    const restoDaLinha = foodName.replace(new RegExp(`^${dbKeyMatched}`), '')
    if (SOBRA_COM_QUANTIDADE.test(restoDaLinha)) {
      unknownLines.push(rawLine)
      continue
    }

    let grams = 0
    if (unitUsed === 'g') {
      grams = qtd
    } else if (unitUsed === 'ml') {
      grams = qtd
    } else if (wasApprox) {
      const approx = matchedItem?.approx
      const gramsPerUnit =
        approx?.[unitUsed] ??
        approx?.[`${unitUsed}s`] ??
        approx?.['unidade'] ??
        // O alimento não declara `unidade`? Então "1 <alimento>" vale uma PORÇÃO dele,
        // medida na unidade que ele mesmo declara — e não 50g cegos. Era daqui que
        // saía "uma pizza grande = 50g = 133 kcal": 'pizza' declara { fatia: 120 } e
        // o parser ignorava. Só vale quando o usuário não nomeou a unidade; se ele
        // disse "2 colheres", respeita-se a colher (acima) mesmo que não exista.
        (unitUsed === 'unidade' ? servingGramsOf(approx) : undefined)
      if (typeof gramsPerUnit === 'number' && Number.isFinite(gramsPerUnit) && gramsPerUnit > 0) {
        grams = qtd * gramsPerUnit
      } else {
        // Último recurso: o alimento não declara NADA (TACO/OFF/customizado só têm
        // valores por 100g). Aqui o chute é inevitável — a UI mostra o peso assumido
        // pra ficar corrigível.
        grams = qtd * (TYPICAL_GRAMS_PER_UNIT[unitUsed] ?? 50)
      }
    } else {
      grams = qtd
    }

    // MODO DE PREPARO: a cabeça do nome diz O QUE é ("frango"), o resto diz COMO
    // foi feito ("frito") — e isso vale 10 g de gordura por 100 g que a base curada
    // não tem. Só ajusta quando o preparo NÃO está embutido na chave que casou:
    // 'frango grelhado', 'ovo cozido', 'batata cozida' e as entradas da TACO
    // ("batata, inglesa, frita") já trazem o número do preparo, e somar de novo
    // contaria duas vezes. Preparo neutro (grelhado/cozido/air fryer) é
    // reconhecido só pra não virar ajuste indevido — delta zero.
    const prep = detectPreparation(foodName)
    const prepApplies = !!prep && !prep.neutral && !keyEncodesPreparation(dbKeyMatched, prep)
    const effective = prep && prepApplies ? applyPreparation(matchedItem, prep) : matchedItem

    const multiplier = grams / 100
    const p = Math.round(Number(effective.p) * multiplier)
    const c = Math.round(Number(effective.c) * multiplier)
    const f = Math.round(Number(effective.f) * multiplier)
    const kcal = Math.round(Number(effective.kcal) * multiplier)

    const sp = Number.isFinite(p) ? p : 0
    const sc = Number.isFinite(c) ? c : 0
    const sf = Number.isFinite(f) ? f : 0
    const skcal = Number.isFinite(kcal) ? kcal : 0
    totals.p += sp
    totals.c += sc
    totals.f += sf
    totals.kcal += skcal
    items.push({
      // O preparo entra no label pro usuário VER por que a gordura subiu — o item
      // é o que a UI, o histórico e o prompt do chat mostram.
      label: prep && prepApplies ? `${rawLine} · ${prep.label}` : rawLine,
      grams: Math.max(0, Math.round(Number.isFinite(grams) ? grams : 0)),
      calories: Math.max(0, skcal),
      protein: Math.max(0, sp),
      carbs: Math.max(0, sc),
      fat: Math.max(0, sf),
      ...(prep && prepApplies ? { preparation: prep.label } : {}),
      ...(wasApprox ? { assumedWeight: true } : {}),
    })
  }

  return {
    meal: {
      foodName: mealName,
      calories: Math.max(0, Math.round(totals.kcal)),
      protein: Math.max(0, Math.round(totals.p)),
      carbs: Math.max(0, Math.round(totals.c)),
      fat: Math.max(0, Math.round(totals.f)),
    },
    items,
    unknownLines,
  }
}

export function parseInput(text: string, extraFoods?: Record<string, FoodItem>): MealLog {
  const rawText = typeof text === 'string' ? text : ''
  if (!rawText.trim()) throw new Error('nutrition_parser_empty_input')

  const analysis = analyzeMeal(rawText, extraFoods)
  if (analysis.unknownLines.length > 0) {
    throw new Error(`nutrition_parser_unknown_food:${analysis.unknownLines.join('|')}`)
  }
  return analysis.meal
}
