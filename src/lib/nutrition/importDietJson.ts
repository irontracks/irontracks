/**
 * importDietJson — traz uma dieta pronta de fora, sem gastar IA.
 *
 * O caso de uso é concreto: a pessoa recebe a dieta do nutricionista em PDF ou
 * papel, pede a qualquer assistente (ChatGPT, Gemini, Claude) para converter em
 * JSON, e cola aqui. O IronTracks não paga nada por isso — por ser parsing
 * local, o import por JSON é **grátis**, ao contrário do que seria uma leitura
 * de PDF pelo nosso Gemini (decisão do dono, 29/08/2026).
 *
 * ⚠️ **Isto é entrada NÃO CONFIÁVEL.** O texto vem de fora, escrito por um
 * modelo que ninguém controla. Nada aqui assume forma: cada campo é coagido,
 * cada limite é o do `BodySchema` da rota, e o que não dá para entender vira
 * mensagem em português — nunca um `undefined` que só quebra três telas adiante.
 *
 * A TOLERÂNCIA é o produto. Um normalizador que só aceitasse as chaves exatas
 * reprovaria a maioria dos JSONs reais: os modelos escrevem `refeicoes`,
 * `carboidratos`, `"120g"`, `"1.200"`. Aceitar essas formas não custa nada e é a
 * diferença entre a dieta entrar de primeira ou o usuário desistir.
 */

/** Limites espelhados do `BodySchema` de `api/nutrition/diet-plan`. */
import { foodDatabase } from './food-database'

export const LIMITES = {
    refeicoesPorDia: 10,
    itensPorRefeicao: 20,
    diasPorSemana: 7,
    nomeDoPlano: 120,
    nomeDaRefeicao: 60,
    nomeDoAlimento: 120,
    horario: 10,
    gramas: 5_000,
    kcalItem: 5_000,
    proteinaItem: 500,
    carboItem: 1_000,
    gorduraItem: 500,
} as const

export interface ItemImportado {
    food: string
    grams: number
    calories: number
    protein: number
    carbs: number
    fat: number
}
export interface RefeicaoImportada {
    name: string
    time?: string
    items: ItemImportado[]
}
export interface DiaImportado {
    weekday?: number
    meals: RefeicaoImportada[]
}
/** Payload no formato que `POST /api/nutrition/diet-plan` aceita. */
export interface PayloadDeImport {
    planName?: string
    notes?: string
    meals?: RefeicaoImportada[]
    days?: DiaImportado[]
}

export type ResultadoDeImport =
    | { ok: true; payload: PayloadDeImport; avisos: string[] }
    | { ok: false; erro: string }

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

/** Primeira chave presente, entre os sinônimos aceitos. */
function campo(obj: Record<string, unknown>, ...nomes: string[]): unknown {
    for (const n of nomes) {
        for (const chave of Object.keys(obj)) {
            // Compara sem acento e sem caixa: `Calorias`, `calorias`, `CALORIAS`.
            if (semAcento(chave) === semAcento(n)) return obj[chave]
        }
    }
    return undefined
}

function semAcento(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[_\s-]/g, '')
}

/**
 * Número tolerante. Aceita `120`, `"120"`, `"120g"`, `"1.200"`, `"35,5"`,
 * `"~200 kcal"`. Devolve 0 para o que não der para ler — um macro ausente é
 * zero, não motivo para recusar a dieta inteira.
 */
export function numeroTolerante(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0
    if (typeof v !== 'string') return 0
    let s = v.trim()
    if (!s) return 0
    // Tira tudo que não é dígito, vírgula, ponto ou sinal.
    s = s.replace(/[^\d.,-]/g, '')
    if (!s) return 0
    // "1.200,5" (pt-BR) → "1200.5"; "1,200.5" (en) → "1200.5"; "35,5" → "35.5".
    const temVirgula = s.includes(','), temPonto = s.includes('.')
    if (temVirgula && temPonto) {
        s = s.lastIndexOf(',') > s.lastIndexOf('.')
            ? s.replace(/\./g, '').replace(',', '.')
            : s.replace(/,/g, '')
    } else if (temVirgula) {
        // Vírgula sozinha: decimal se sobram 1–2 dígitos, senão milhar.
        const depois = s.length - s.lastIndexOf(',') - 1
        s = depois > 0 && depois <= 2 ? s.replace(',', '.') : s.replace(/,/g, '')
    } else if (temPonto) {
        // Ponto sozinho é AMBÍGUO: "1.200" é mil e duzentos em pt-BR e um
        // vírgula dois em inglês. A régua é a contagem de casas — exatamente
        // três dígitos depois do último ponto é separador de milhar.
        //
        // Escolhida assim porque o erro na outra direção é grosseiro: ler
        // "1.200 kcal" como 1,2 kcal apaga uma refeição inteira, enquanto ler
        // "1.200 g" (1,2 g, se alguém realmente quis isso) como 1200 g é um
        // número que o usuário vê e corrige na prévia. Macro com três casas
        // decimais não existe em rótulo nenhum.
        const casas = s.length - s.lastIndexOf('.') - 1
        if (casas === 3 || (s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '')
    }
    const n = Number(s)
    return Number.isFinite(n) && n > 0 ? n : 0
}

const limitar = (n: number, teto: number): number => Math.min(Math.round(n * 100) / 100, teto)
const texto = (v: unknown, teto: number): string => String(v ?? '').trim().slice(0, teto)

/** Aceita 'segunda', 'seg', 1, '1' → índice 0..6 (0 = domingo). */
export function diaDaSemana(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6) return v
    const s = semAcento(String(v ?? ''))
    if (!s) return undefined
    if (/^[0-6]$/.test(s)) return Number(s)
    const mapa: Record<string, number> = {
        domingo: 0, dom: 0, sunday: 0, sun: 0,
        segunda: 1, segundafeira: 1, seg: 1, monday: 1, mon: 1,
        terca: 2, tercafeira: 2, ter: 2, tuesday: 2, tue: 2,
        quarta: 3, quartafeira: 3, qua: 3, wednesday: 3, wed: 3,
        quinta: 4, quintafeira: 4, qui: 4, thursday: 4, thu: 4,
        sexta: 5, sextafeira: 5, sex: 5, friday: 5, fri: 5,
        sabado: 6, sab: 6, saturday: 6, sat: 6,
    }
    return mapa[s]
}

/**
 * Macros por 100 g/ml, pela base LOCAL do app (`food-database.ts`).
 *
 * Existe porque a dieta de nutricionista quase nunca traz macro por alimento —
 * traz "200 g de arroz" e a meta do dia. Sem isto o plano entra com tudo
 * zerado, que é pior do que não entrar: parece importado e não soma nada.
 *
 * É a MESMA base que o lançamento por texto usa, então o plano importado e o
 * que a pessoa registra depois falam a mesma língua. E é local: não custa nada,
 * que é a premissa deste caminho.
 */
export function macrosDaBase(nome: string): { kcal: number; p: number; c: number; f: number } | null {
    const chave = chaveDaBase(nome)
    if (!chave) return null
    const f = foodDatabase[chave]
    return { kcal: f.kcal, p: f.p, c: f.c, f: f.f }
}

/** Palavras que não distinguem alimento nenhum. */
const VAZIAS = new Set(['de', 'do', 'da', 'com', 'e', 'ou', 'sem', 'a', 'o', 'em', 'inteiro', 'inteiros', 'inteira'])

/** Tokens úteis do nome, sem acento, sem plural simples e sem palavra vazia. */
function tokens(nome: string): string[] {
    return semAcento(nome.replace(/[_\s-]+/g, ' '))
        .split(/(?=[a-z])/)
        .join('')
        .split(' ')
        .length === 1
        ? nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(semPlural).filter((t) => t.length > 2 && !VAZIAS.has(t))
        : []
}

function semPlural(t: string): string {
    if (t.endsWith('oes')) return t.slice(0, -3) + 'ao'
    if (t.endsWith('ns')) return t.slice(0, -2) + 'm'
    if (t.endsWith('s') && t.length > 3) return t.slice(0, -1)
    return t
}

/**
 * A entrada da base que melhor descreve este nome.
 *
 * Casa por TOKENS, não por substring: "arroz branco cozido" precisa achar
 * 'arroz cozido' (o "branco" no meio quebrava o `includes`), "ovos inteiros"
 * precisa achar 'ovo' (plural), e "Doce de leite Tirol" precisa achar
 * 'doce de leite' e não 'leite desnatado'.
 *
 * A pontuação é quantos tokens da CHAVE aparecem no nome; exige-se que TODOS
 * apareçam, e entre as candidatas vence a mais específica (mais tokens). Assim
 * 'arroz cozido' (2) ganha de 'arroz' (1), e nada casa por acidente de uma
 * palavra só quando existe opção melhor.
 */
export function chaveDaBase(nome: string): string | null {
    const alvo = semAcento(nome)
    if (!alvo) return null
    const chaves = Object.keys(foodDatabase)

    const exata = chaves.find((k) => semAcento(k) === alvo)
    if (exata) return exata

    const listaDoNome = tokens(nome)
    const doNome = new Set(listaDoNome)
    if (!doNome.size) return null

    let melhor: string | null = null
    let melhorPontos = 0
    let melhorDistancia = Infinity
    for (const k of chaves) {
        const daChave = tokens(k)
        if (!daChave.length) continue
        if (!daChave.every((t) => doNome.has(t))) continue
        // Desempate: entre chaves com o MESMO número de tokens, vence a que
        // aparece mais cedo no nome. "feijão PRETO cozido" casa com
        // 'feijao preto' e 'feijao cozido' — as duas com dois tokens —, e é
        // 'preto' (posição 1) que descreve o feijão, não 'cozido' (posição 2).
        const distancia = daChave.reduce((soma, t) => soma + listaDoNome.indexOf(t), 0)
        if (daChave.length > melhorPontos || (daChave.length === melhorPontos && distancia < melhorDistancia)) {
            melhorPontos = daChave.length
            melhorDistancia = distancia
            melhor = k
        }
    }
    return melhor
}

/** Equivalência de unidade → gramas, da própria base ('unidade', 'fatia'…). */
function gramasPorUnidade(nome: string): number | null {
    const chave = chaveDaBase(nome)
    const aprox = chave ? foodDatabase[chave].approx : undefined
    const porUnidade = aprox?.unidade ?? aprox?.fatia ?? aprox?.dose ?? aprox?.scoop
    return typeof porUnidade === 'number' && porUnidade > 0 ? porUnidade : null
}

function lerItem(raw: unknown): ItemImportado | null {
    if (typeof raw === 'string') {
        // Item só com o nome ("100g de arroz"): entra com macros zerados em vez
        // de derrubar a refeição. O usuário completa depois na tela.
        const nome = raw.trim()
        return nome ? { food: nome.slice(0, LIMITES.nomeDoAlimento), grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0 } : null
    }
    if (!ehObjeto(raw)) return null
    const food = texto(campo(raw, 'food', 'alimento', 'nome', 'name', 'item', 'descricao'), LIMITES.nomeDoAlimento)
    if (!food) return null
    // Peso: gramas, mililitros (1 ml ≈ 1 g nos líquidos desta base) ou unidades
    // convertidas pela equivalência da própria base.
    let grams = numeroTolerante(campo(raw, 'grams', 'gramas', 'quantidadeg', 'quantidade', 'qtd', 'peso', 'porcao'))
    if (!grams) grams = numeroTolerante(campo(raw, 'ml', 'quantidademl', 'mililitros', 'volume'))
    if (!grams) {
        const unidades = numeroTolerante(campo(raw, 'quantidadeunidades', 'unidades', 'unidade', 'qtdunidades'))
        const porUnidade = unidades ? gramasPorUnidade(food) : null
        if (unidades && porUnidade) grams = unidades * porUnidade
    }
    grams = limitar(grams, LIMITES.gramas)

    let calories = numeroTolerante(campo(raw, 'calories', 'calorias', 'kcal', 'energia'))
    let protein = numeroTolerante(campo(raw, 'protein', 'proteina', 'proteinas', 'prot', 'p'))
    let carbs = numeroTolerante(campo(raw, 'carbs', 'carboidratos', 'carboidrato', 'carbo', 'cho', 'c'))
    let fat = numeroTolerante(campo(raw, 'fat', 'gordura', 'gorduras', 'lipidios', 'g'))

    // Nenhum macro declarado + peso conhecido: deriva da base local. Só quando
    // NENHUM veio — um plano que traz kcal e omite proteína está declarando
    // zero de proteína, e sobrescrever isso seria inventar sobre o que o
    // nutricionista escreveu.
    if (!calories && !protein && !carbs && !fat && grams > 0) {
        const base = macrosDaBase(food)
        if (base) {
            const fator = grams / 100
            calories = base.kcal * fator
            protein = base.p * fator
            carbs = base.c * fator
            fat = base.f * fator
        }
    }

    return {
        food,
        grams,
        calories: limitar(calories, LIMITES.kcalItem),
        protein: limitar(protein, LIMITES.proteinaItem),
        carbs: limitar(carbs, LIMITES.carboItem),
        fat: limitar(fat, LIMITES.gorduraItem),
    }
}

function lerRefeicao(raw: unknown, avisos: string[]): RefeicaoImportada | null {
    if (!ehObjeto(raw)) return null
    const itensCrus = campo(raw, 'items', 'itens', 'alimentos', 'foods', 'comidas')
    const lista = Array.isArray(itensCrus) ? itensCrus : []
    let items = lista.map(lerItem).filter((i): i is ItemImportado => i !== null)
    if (!items.length) return null
    if (items.length > LIMITES.itensPorRefeicao) {
        avisos.push(`Uma refeição tinha ${items.length} alimentos; ficaram os ${LIMITES.itensPorRefeicao} primeiros.`)
        items = items.slice(0, LIMITES.itensPorRefeicao)
    }
    const name = texto(campo(raw, 'name', 'nome', 'refeicao', 'meal', 'titulo'), LIMITES.nomeDaRefeicao) || 'Refeição'
    const time = texto(campo(raw, 'time', 'horario', 'hora', 'hour'), LIMITES.horario)
    return { name, ...(time ? { time } : {}), items }
}

function lerRefeicoes(raw: unknown, avisos: string[]): RefeicaoImportada[] {
    const lista = Array.isArray(raw) ? raw : []
    let meals = lista.map((m) => lerRefeicao(m, avisos)).filter((m): m is RefeicaoImportada => m !== null)
    if (meals.length > LIMITES.refeicoesPorDia) {
        avisos.push(`O plano tinha ${meals.length} refeições num dia; ficaram as ${LIMITES.refeicoesPorDia} primeiras.`)
        meals = meals.slice(0, LIMITES.refeicoesPorDia)
    }
    return meals
}

/**
 * Converte o JSON colado no payload da rota de salvar.
 *
 * Aceita as três formas que os modelos costumam produzir: `{ meals: [...] }`,
 * `{ days: [...] }`, ou o array de refeições solto.
 */
export function importarDietaDeJson(textoCru: string): ResultadoDeImport {
    const bruto = textoCru.trim()
    if (!bruto) return { ok: false, erro: 'Cole o JSON da dieta para continuar.' }

    let dados: unknown
    try {
        dados = JSON.parse(bruto)
    } catch {
        return {
            ok: false,
            erro: 'Isso não é um JSON válido. Peça ao assistente para devolver SÓ o JSON, sem texto em volta e sem crases.',
        }
    }

    const avisos: string[] = []
    // Array solto = lista de refeições de um dia.
    const raiz: Record<string, unknown> = Array.isArray(dados) ? { meals: dados } : (ehObjeto(dados) ? dados : {})
    if (!Object.keys(raiz).length) {
        return { ok: false, erro: 'O JSON não tem nem refeições nem dias. Confira o formato de exemplo.' }
    }

    const planName = texto(campo(raiz, 'planName', 'nome', 'name', 'plano', 'titulo'), LIMITES.nomeDoPlano)
    const notes = texto(campo(raiz, 'notes', 'observacoes', 'obs', 'notas'), 500)

    const diasCrus = campo(raiz, 'days', 'dias', 'semana', 'week')
    // `semana` também vem como OBJETO com o dia na CHAVE — foi a forma da
    // primeira dieta real importada: { "segunda": {...}, "terca": {...} }.
    // Vira array, com o dia herdado da chave.
    const listaDeDias: unknown[] = Array.isArray(diasCrus)
        ? diasCrus
        : ehObjeto(diasCrus)
            ? Object.entries(diasCrus)
                .map(([chave, valor]) => (ehObjeto(valor) ? { ...valor, __diaDaChave: chave } : null))
                .filter((d) => d !== null)
            : []

    if (listaDeDias.length) {
        let days = listaDeDias
            .map((d) => {
                if (!ehObjeto(d)) return null
                const meals = lerRefeicoes(campo(d, 'meals', 'refeicoes', 'refeicao'), avisos)
                if (!meals.length) return null
                const weekday = diaDaSemana(campo(d, 'weekday', 'dia', 'diadasemana', 'day'))
                    ?? diaDaSemana(d.__diaDaChave)
                return { ...(weekday !== undefined ? { weekday } : {}), meals }
            })
            .filter((d): d is DiaImportado => d !== null)
        if (!days.length) {
            return { ok: false, erro: 'Encontrei os dias, mas nenhum tinha refeições com alimentos.' }
        }
        if (days.length > LIMITES.diasPorSemana) {
            avisos.push(`O plano tinha ${days.length} dias; ficaram os ${LIMITES.diasPorSemana} primeiros.`)
            days = days.slice(0, LIMITES.diasPorSemana)
        }
        return { ok: true, avisos, payload: { ...(planName ? { planName } : {}), ...(notes ? { notes } : {}), days } }
    }

    const meals = lerRefeicoes(campo(raiz, 'meals', 'refeicoes', 'refeicao', 'cardapio'), avisos)
    if (!meals.length) {
        return {
            ok: false,
            erro: 'Não achei refeições com alimentos. Cada refeição precisa de "name" e de "items" com pelo menos um alimento.',
        }
    }
    return { ok: true, avisos, payload: { ...(planName ? { planName } : {}), ...(notes ? { notes } : {}), meals } }
}

/** Resumo para a prévia: o usuário confere ANTES de o plano substituir o atual. */
export function resumoDoImport(p: PayloadDeImport): { dias: number; refeicoes: number; alimentos: number; kcal: number } {
    const dias = p.days ?? (p.meals ? [{ meals: p.meals }] : [])
    let refeicoes = 0, alimentos = 0, kcal = 0
    for (const d of dias) {
        refeicoes += d.meals.length
        for (const m of d.meals) {
            alimentos += m.items.length
            for (const i of m.items) kcal += i.calories
        }
    }
    // Plano de semana: a média por dia diz mais que a soma dos sete.
    return { dias: dias.length, refeicoes, alimentos, kcal: Math.round(kcal / Math.max(1, dias.length)) }
}
