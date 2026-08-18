/**
 * Contrato de saída da IA para os insights da sessão em EQUIPE.
 *
 * A rota nasceu (jul/2026) pedindo JSON só no TEXTO do prompt — o padrão que a
 * Avaliação por Foto provou insuficiente: 8 de 12 chamadas reprovavam no parse.
 * Ela ficou um mês fora do ar junto com a feature, então nunca passou pelo
 * mutirão que levou as outras 12 rotas ao structured output; ao ser restaurada
 * em 17/08/2026, o ratchet `structuredOutputRatchet` cobrou — corretamente.
 *
 * ⚠️ `perParticipant` fica FORA do schema de propósito: é um mapa de chaves
 * dinâmicas (o nome de cada participante), e `responseSchema` não modela isso.
 * Declarar os campos fixos já derruba o JSON inválido; o `extractJson` da rota
 * continua sendo o juiz do resto.
 */

// Subset OpenAPI aceito pela API do Gemini (mesmo formato de labExam/protocolContract).
const STR = { type: 'STRING' } as const
const strList = (maxItems: number) => ({ type: 'ARRAY', maxItems, items: STR })

export const TEAM_INSIGHTS_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        mvp: STR,
        teamSummary: strList(5),
        highlights: strList(4),
        nextSessionTip: STR,
    },
    required: ['mvp', 'teamSummary', 'highlights', 'nextSessionTip'],
    propertyOrdering: ['mvp', 'teamSummary', 'highlights', 'nextSessionTip'],
} as const

export function teamInsightsGenerationConfig() {
    return {
        responseMimeType: 'application/json',
        responseSchema: TEAM_INSIGHTS_RESPONSE_SCHEMA,
    } as const
}
