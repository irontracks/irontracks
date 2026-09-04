/**
 * A observação do exercício ao TROCAR o exercício no treino ativo.
 *
 * O problema, medido em produção em 03/09/2026: `swapExerciseName` troca só o
 * `name` e preserva o resto do objeto no spread — então a observação sobrevive
 * descrevendo o aparelho anterior. Das 384 observações com texto, **322 (84%)
 * são técnica do aparelho** ("pés na parte alta da plataforma", "alinhe o
 * joelho ao eixo da máquina"), com 181 caracteres de média. Trocar o exercício
 * e manter isso é instruir sobre uma máquina que não está mais na frente.
 *
 * ⚠️ E a armadilha que obriga este módulo a existir: `notes` NÃO é só texto
 * exibido. O `ExerciseCard` PARSEIA dali a configuração de série avançada —
 * `"SST na última: Falha > 10s > Falha"` vira `{restSec, miniCount,
 * targetSetIdx}` e alimenta o render em 4 pontos. São **62 das 384 notas (16%)**
 * com marcação de método. Reescrever a nota por cima apagaria a configuração do
 * Rest-Pause, e o usuário perderia o método sem entender por quê.
 *
 * Por isso a troca é CIRÚRGICA: a marcação de método é preservada, e só a parte
 * descritiva é substituída.
 */

/** Teto da observação. O mesmo que a rota de IA aplica depois do parse. */
export const MAX_NOTA_CHARS = 200

/**
 * Trechos que CONFIGURAM comportamento e não podem ser perdidos na troca.
 *
 * Só o que o app de fato parseia ou exibe como método. Manter esta lista
 * estreita é deliberado: quanto mais ela cresce, mais texto do aparelho velho
 * sobrevive à troca — que é justamente o defeito sendo corrigido.
 */
const PADROES_DE_METODO: RegExp[] = [
    /SST\s+na\s+(?:última|ult\.|\d+[ªa°.]?\s*série)[^.]*\.?/gi,
    /drop[-\s]?set[^.]*\.?/gi,
    /rest[-\s]?pause[^.]*\.?/gi,
    /bi[-\s]?set[^.]*\.?/gi,
    /super[-\s]?set[^.]*\.?/gi,
    /cluster[^.]*\.?/gi,
]

/** Extrai a parte da nota que carrega configuração de método. */
export function extrairMetodo(nota: string | null | undefined): string {
    const texto = String(nota ?? '').trim()
    if (!texto) return ''
    const achados: string[] = []
    for (const padrao of PADROES_DE_METODO) {
        // `matchAll` com /g não guarda estado entre chamadas como `.test` guarda.
        for (const m of texto.matchAll(padrao)) {
            const t = m[0].trim()
            if (t) achados.push(t)
        }
    }
    // Sem duplicata: "drop-set" e "drop set" na mesma nota casariam dois padrões.
    return [...new Set(achados)].join(' ').trim()
}

/** A nota antiga carrega configuração que a troca não pode apagar? */
export function temMetodo(nota: string | null | undefined): boolean {
    return extrairMetodo(nota).length > 0
}

/**
 * A nota que fica no INSTANTE da troca, antes de a IA responder.
 *
 * Vazio é melhor que mentiroso: a descrição do aparelho antigo sai na hora, e
 * só o que configura método permanece. Se a IA falhar ou demorar, o usuário
 * fica sem observação — que é o estado honesto — em vez de com a observação
 * errada.
 */
export function notaAoTrocar(notaAntiga: string | null | undefined): string {
    return extrairMetodo(notaAntiga)
}

/**
 * Junta a técnica gerada pela IA com a marcação de método preservada.
 *
 * O método vem PRIMEIRO: ele é a instrução que mudou o desenho da série, e o
 * card corta a observação em duas linhas quando fechada — enterrar o método no
 * fim o esconderia justamente de quem precisa dele antes de começar.
 */
export function juntarNota(metodo: string, tecnicaDaIa: string): string {
    const m = String(metodo ?? '').trim()
    const t = String(tecnicaDaIa ?? '').trim()
    if (!m) return t.slice(0, MAX_NOTA_CHARS)
    if (!t) return m.slice(0, MAX_NOTA_CHARS)
    return `${m} ${t}`.slice(0, MAX_NOTA_CHARS)
}
