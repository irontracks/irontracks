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

/**
 * Rótulo e cor dos status conhecidos. Status novo que apareça no banco não
 * precisa entrar aqui para funcionar — ganha rótulo capitalizado e cor neutra,
 * e aparece no gráfico. A lista existe para dar NOME e COR melhores aos que já
 * conhecemos, nunca para filtrar o que pode ser exibido.
 */
const CONHECIDOS: Record<string, { rotulo: string; cor: string }> = {
    pago: { rotulo: 'Pago', cor: 'rgba(34, 197, 94, 0.9)' },
    ativo: { rotulo: 'Ativo', cor: 'rgba(59, 130, 246, 0.9)' },
    pendente: { rotulo: 'Pendente', cor: 'rgba(234, 179, 8, 0.9)' },
    atrasado: { rotulo: 'Atrasado', cor: 'rgba(248, 113, 113, 0.9)' },
    // `cancelar` é a grafia legada (verbo) — mapeada para o substantivo, que é
    // o que um status deve ser.
    cancelar: { rotulo: 'Cancelado', cor: 'rgba(148, 163, 184, 0.9)' },
    cancelado: { rotulo: 'Cancelado', cor: 'rgba(148, 163, 184, 0.9)' },
    inativo: { rotulo: 'Inativo', cor: CINZA_NEUTRO },
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
