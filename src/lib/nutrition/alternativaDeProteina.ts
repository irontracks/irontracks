/**
 * A segunda opção de proteína que o card do plano OFERECE — pedido do dono,
 * 01/09/2026.
 *
 * O plano dizia "Peito de frango 180 g" e ponto. Quem quisesse comer carne
 * vermelha naquele dia tinha que lançar a refeição e depois EDITAR o lançamento,
 * ou apertar o ↻ (que sorteia um substituto e reescreve o plano). Duas voltas para
 * uma decisão que se toma na frente da geladeira. Agora a alternativa já aparece
 * embaixo do item — "opção: 200 g de carne moída" — e o usuário escolhe antes de
 * lançar.
 *
 * ⚠️ **A alternativa só serve se for de OUTRA fonte.** O ranking do `swapFood`
 * ordena por repertório e por desvio calórico, e para quem come frango todo dia os
 * primeiros colocados são… mais frango (coxa, sobrecoxa, file). Oferecer isso não
 * responde à pergunta que o usuário está fazendo. Daí a família: a opção precisa vir
 * de um grupo diferente do item que está no prato.
 *
 * Nada aqui é persistido e nada é novo: a lista sai do MESMO `rankSwapOptions` que
 * alimenta o botão de trocar. Duas escolhas independentes divergiriam, e o usuário
 * veria uma opção no card e outra ao tocar no ↻.
 */

import { normalizeFoodKey } from './learned-foods'
import {
    classifyFood,
    macrosPer100g,
    rankSwapOptions,
    type SwapCandidate,
    type SwapOptions,
    type SwapResult,
    type SwappableItem,
} from './foodSwap'

export type FamiliaDeProteina =
    | 'ave'
    | 'bovina'
    | 'suina'
    | 'peixe'
    | 'ovo'
    | 'laticinio'
    | 'vegetal'
    | 'suplemento'

/**
 * Tokens que identificam a família, na ordem em que são testados.
 *
 * Por TOKEN e não por substring: "file de frango" tem "frango", e um `includes`
 * ingênuo faria "peito de peru" casar com… nada, enquanto "carne de porco" casaria
 * com bovina por causa de "carne". O corte é sempre a palavra inteira, com uma
 * exceção declarada: os compostos ("peito de frango") já são cobertos porque
 * qualquer token basta.
 */
const TOKENS: ReadonlyArray<readonly [FamiliaDeProteina, readonly string[]]> = [
    // Suplemento antes de laticínio: "whey protein concentrado" tem leite na origem
    // mas não é comida de prato, e trocar prato por pó é justamente o que o
    // `isRoleCompatible` do motor existe para impedir.
    ['suplemento', ['whey', 'albumina', 'caseina', 'isolado', 'hipercalorico', 'creatina']],
    ['ave', ['frango', 'peru', 'chester', 'coxa', 'sobrecoxa', 'ave', 'galinha']],
    // "carne" sozinha é bovina no Brasil (quem quer porco escreve porco), e é assim
    // que a base curada trata: `carne moida` e `carne bovina` são as duas bovinas.
    ['suina', ['porco', 'bacon', 'pernil', 'linguica', 'suino', 'suina', 'presunto']],
    // 'file' fica FORA de propósito: "filé de tilápia" e "filé de frango" o carregam,
    // e como o teste é por token o primeiro grupo que casar vence — "filé de tilápia"
    // sairia como bovina. Quem identifica o corte bovino é o nome dele ('mignon',
    // 'patinho'), não a forma do corte.
    ['bovina', ['carne', 'patinho', 'alcatra', 'acem', 'maminha', 'picanha', 'contrafile',
        'coxao', 'musculo', 'bovina', 'bovino', 'boi', 'bife', 'mignon', 'fraldinha', 'costela']],
    ['peixe', ['peixe', 'tilapia', 'salmao', 'atum', 'sardinha', 'merluza', 'bacalhau',
        'pescada', 'camarao', 'marisco']],
    ['ovo', ['ovo', 'ovos', 'clara', 'claras', 'omelete']],
    ['vegetal', ['soja', 'tofu', 'grao', 'lentilha', 'feijao', 'ervilha', 'pts', 'vegetal']],
    ['laticinio', ['iogurte', 'queijo', 'leite', 'requeijao', 'cottage', 'ricota', 'skyr', 'coalhada']],
]

/** A que grupo o alimento pertence, ou `null` quando o nome não diz. */
export function familiaDaProteina(nome: string): FamiliaDeProteina | null {
    const tokens = new Set(normalizeFoodKey(String(nome ?? '')).split(' ').filter(Boolean))
    if (!tokens.size) return null
    for (const [familia, marcas] of TOKENS) {
        for (const marca of marcas) {
            if (tokens.has(marca)) return familia
        }
    }
    return null
}

export interface AlternativaDeProteina extends SwapResult {
    familia: FamiliaDeProteina | null
}

/**
 * A opção a oferecer embaixo do item, ou `null` quando não há uma que valha a pena.
 *
 * `null` em três casos, e os três são deliberados:
 *  - o item não é fonte de proteína (o pedido é sobre a CARNE; oferecer troca de
 *    arroz e de salada em toda linha transformaria o card num catálogo);
 *  - o motor não achou substituto (mesma resposta do botão de trocar);
 *  - só há substituto da MESMA família — oferecer outro frango no lugar do frango
 *    não responde a pergunta do usuário, e uma opção inútil ocupando espaço é pior
 *    que nenhuma.
 *
 * Quando a família do ITEM é desconhecida não há como exigir contraste, e aí vale a
 * primeira do ranking: o motor já bloqueia o mesmo alimento base.
 */
export function alternativaDeProteina(
    item: SwappableItem,
    candidates: SwapCandidate[],
    options: SwapOptions = {},
): AlternativaDeProteina | null {
    if (classifyFood(macrosPer100g(item)) !== 'protein') return null

    const opcoes = rankSwapOptions(item, candidates, options)
    if (!opcoes.length) return null

    const daCasa = familiaDaProteina(item.food)
    if (!daCasa) {
        const primeira = opcoes[0]
        if (!primeira) return null
        return { ...primeira, familia: familiaDaProteina(primeira.food) }
    }

    for (const opcao of opcoes) {
        const familia = familiaDaProteina(opcao.food)
        if (familia && familia !== daCasa) return { ...opcao, familia }
    }
    return null
}
