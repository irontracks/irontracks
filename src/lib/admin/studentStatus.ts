/**
 * studentStatus.ts — as categorias do gráfico saem dos status que EXISTEM.
 *
 * O gráfico "Status dos Alunos" trazia cinco colunas fixas — Pago, Pendente,
 * Atrasado, Cancelar, Outros —, e em 28/08/2026 o banco tinha exatamente dois
 * status: `pago` (32 alunos) e `ativo` (24). Ou seja: três colunas permanentes
 * vazias, e 43% da base — todos os `ativo` — desaguando em **"Outros"**, o
 * rótulo mais vazio possível para o segundo maior grupo do negócio.
 *
 * Havia ainda dois defeitos de vocabulário no mesmo lugar:
 *
 *  - **"Cancelar" é verbo.** É rótulo de botão, não de estado; um status se
 *    chama "Cancelado".
 *  - **Aluno sem status virava "Pendente"** (`String(raw || 'pendente')`),
 *    inventando uma categoria que o banco não tem. Aqui ele é "Sem status",
 *    que é a verdade — e a verdade é acionável (alguém precisa preencher).
 *
 * Categoria com ZERO não vira coluna: barra vazia ocupa espaço para informar
 * nada, e com `borderRadius` no Chart.js ela ainda desenha um toco visível que
 * parece "quase 1".
 */

/** Uma fatia do gráfico: já com rótulo humano, contagem e cor. */
export interface FatiaDeStatus {
    /** Chave normalizada (minúscula, sem espaços) — `sem_status` para vazio. */
    chave: string
    /** Rótulo humano, em pt-BR. */
    rotulo: string
    quantidade: number
    /** Cor da barra/fatia, no formato que o Chart.js consome. */
    cor: string
}

const CINZA_NEUTRO = 'rgba(82, 82, 82, 0.9)'
const BADGE_NEUTRO = 'text-neutral-400 bg-neutral-700/30 border-neutral-600/30'

interface Conhecido {
    rotulo: string
    /** Cor da barra/fatia no Chart.js. */
    cor: string
    /** Classes do badge de status na lista de alunos. */
    badge: string
    /** Aparece no `<select>` de status? Grafia legada e "sem status" não. */
    escolhivel?: boolean
}

/**
 * Rótulo, cor e badge dos status conhecidos — a ÚNICA lista.
 *
 * Antes desta tabela o vocabulário estava escrito em quatro lugares, com
 * conteúdos diferentes: as opções do `<select>` (`STATUS_OPTIONS`, sem `ativo`),
 * o `switch` das classes do badge (três casos), os rótulos com emoji do diálogo
 * de confirmação, e as labels do gráfico. Divergiram, como sempre divergem.
 *
 * Status novo que apareça no banco não precisa entrar aqui para ser EXIBIDO —
 * ganha rótulo capitalizado e cor neutra. A lista existe para dar nome e cor
 * melhores aos que conhecemos, nunca para filtrar o que pode aparecer.
 */
const CONHECIDOS: Record<string, Conhecido> = {
    pago: {
        rotulo: 'Pago',
        cor: 'rgba(34, 197, 94, 0.9)',
        badge: 'text-green-500 bg-green-500/10 border-green-500/20',
        escolhivel: true,
    },
    // `ativo` NÃO era oferecido pelo `<select>` — e 24 alunos (43% da base) o
    // tinham no banco em 28/08/2026. Um `<select>` cujo `value` não casa com
    // nenhuma `<option>` não tem como exibir o estado real do aluno.
    ativo: {
        rotulo: 'Ativo',
        cor: 'rgba(59, 130, 246, 0.9)',
        badge: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        escolhivel: true,
    },
    pendente: {
        rotulo: 'Pendente',
        cor: 'rgba(234, 179, 8, 0.9)',
        badge: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
        escolhivel: true,
    },
    atrasado: {
        rotulo: 'Atrasado',
        cor: 'rgba(248, 113, 113, 0.9)',
        badge: 'text-red-500 bg-red-500/10 border-red-500/20',
        escolhivel: true,
    },
    // `cancelar` é a grafia GRAVADA (verbo, legado) — o rótulo é o substantivo,
    // que é o que um status deve ser. O valor não muda: mexer nele reescreveria
    // dado de produção para ganhar nada.
    cancelar: {
        rotulo: 'Cancelado',
        cor: 'rgba(148, 163, 184, 0.9)',
        badge: BADGE_NEUTRO,
        escolhivel: true,
    },
    cancelado: { rotulo: 'Cancelado', cor: 'rgba(148, 163, 184, 0.9)', badge: BADGE_NEUTRO },
    inativo: { rotulo: 'Inativo', cor: CINZA_NEUTRO, badge: BADGE_NEUTRO },
}

/** Chave usada quando o aluno não tem status preenchido. */
export const CHAVE_SEM_STATUS = 'sem_status'

/** Normaliza o status cru vindo do banco. Vazio/null → `sem_status`. */
export function normalizarStatus(bruto: unknown): string {
    const texto = String(bruto ?? '').toLowerCase().trim()
    return texto === '' ? CHAVE_SEM_STATUS : texto
}

/** "ativo" → "Ativo"; "meio pago" → "Meio pago". */
function capitalizar(chave: string): string {
    const limpo = chave.replace(/_/g, ' ')
    return limpo.charAt(0).toUpperCase() + limpo.slice(1)
}

/**
 * Agrupa os alunos pelos status que aparecem de fato, em ordem decrescente de
 * quantidade (empate desempata pelo rótulo, para a ordem não dançar entre
 * renders). Nunca devolve categoria com zero.
 */
export function resumirStatusDeAlunos(
    alunos: ReadonlyArray<{ status?: unknown } | null | undefined>,
): FatiaDeStatus[] {
    const contagem = new Map<string, number>()
    for (const aluno of alunos ?? []) {
        if (!aluno || typeof aluno !== 'object') continue
        const chave = normalizarStatus((aluno as { status?: unknown }).status)
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
    }

    // Nenhuma categoria nasce em zero: o mapa só tem chaves que apareceram de
    // fato. Semear as categorias conhecidas aqui — que era o desenho antigo —
    // é o que produzia três colunas permanentemente vazias.
    const fatias: FatiaDeStatus[] = []
    for (const [chave, quantidade] of contagem) {
        const conhecido = CONHECIDOS[chave]
        fatias.push({
            chave,
            rotulo: conhecido?.rotulo ?? (chave === CHAVE_SEM_STATUS ? 'Sem status' : capitalizar(chave)),
            quantidade,
            cor: conhecido?.cor ?? CINZA_NEUTRO,
        })
    }

    // `cancelar` e `cancelado` viram o MESMO rótulo: se as duas grafias
    // convivem no banco, o gráfico mostraria "Cancelado" duas vezes.
    const porRotulo = new Map<string, FatiaDeStatus>()
    for (const f of fatias) {
        const jaTem = porRotulo.get(f.rotulo)
        if (jaTem) jaTem.quantidade += f.quantidade
        else porRotulo.set(f.rotulo, { ...f })
    }

    return [...porRotulo.values()].sort(
        (a, b) => b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
    )
}

/**
 * Rótulo humano de um status isolado — mesma tabela do gráfico, para a lista de
 * alunos e o gráfico nunca chamarem o mesmo estado por nomes diferentes.
 */
export function rotuloDeStatus(bruto: unknown): string {
    const chave = normalizarStatus(bruto)
    if (chave === CHAVE_SEM_STATUS) return 'Sem status'
    return CONHECIDOS[chave]?.rotulo ?? capitalizar(chave)
}

/** Monta o `data` do Chart.js a partir das fatias. */
export function graficoDeStatus(fatias: ReadonlyArray<FatiaDeStatus>) {
    return {
        labels: fatias.map((f) => f.rotulo),
        datasets: [
            {
                label: 'Alunos',
                data: fatias.map((f) => f.quantidade),
                backgroundColor: fatias.map((f) => f.cor),
                borderRadius: 12,
                maxBarThickness: 32,
            },
        ],
    }
}

/** Classes do badge de status — mesma tabela do rótulo e da cor. */
export function badgeDeStatus(bruto: unknown): string {
    return CONHECIDOS[normalizarStatus(bruto)]?.badge ?? BADGE_NEUTRO
}

export interface OpcaoDeStatus {
    value: string
    label: string
}

/**
 * Opções do `<select>` de status.
 *
 * `statusAtual` entra na lista mesmo quando não é escolhível: um `<select>`
 * cujo `value` não casa com nenhuma `<option>` não exibe o estado do aluno — o
 * navegador cai na primeira opção, e a tela passa a afirmar um status que o
 * banco não tem. Era o caso dos 24 alunos `ativo`, que o select não oferecia.
 */
export function opcoesDeStatus(statusAtual?: unknown): OpcaoDeStatus[] {
    const opcoes: OpcaoDeStatus[] = Object.entries(CONHECIDOS)
        .filter(([, v]) => v.escolhivel)
        .map(([value, v]) => ({ value, label: v.rotulo }))

    const atual = normalizarStatus(statusAtual)
    if (atual !== CHAVE_SEM_STATUS && !opcoes.some((o) => o.value === atual)) {
        opcoes.push({ value: atual, label: rotuloDeStatus(atual) })
    }
    return opcoes
}
