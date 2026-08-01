/**
 * Descrição de execução para um exercício recém-adicionado ao treino.
 *
 * Os exercícios criados pelo wizard de IA vêm com instrução técnica ("Eixo da
 * máquina alinhado ao joelho… reduza a carga se sentir dor no joelho"); os
 * adicionados pelo card "Ajustar treino" entravam MUDOS — o usuário abria o
 * treino e via um card vazio no meio de outros explicados.
 *
 * A nota é gerada com o CONTEXTO REAL do aluno: perfil, restrições declaradas,
 * avaliação física e exames. Isso importa mais do que parece — no caso que
 * originou este arquivo, as restrições do dono diziam "SEM hip thrust/coice
 * (lombar)" e o exercício sugerido carregava justamente a lombar. A instrução
 * precisa refletir isso, não repetir um texto genérico de enciclopédia.
 */

import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { buildUserContextBlock } from '@/utils/ai/userContext'
import { env } from '@/utils/env'
import { logWarnRemote } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Limite do que cabe no card sem virar parede de texto. */
const MAX_CHARS = 420

export interface GenerateExerciseNoteInput {
    userId: string
    exerciseName: string
    /** Grupo alvo, para a instrução focar no que o exercício foi adicionado para resolver. */
    muscleLabel?: string | null
    /** Padrão de movimento que o exercício veio cobrir (ex.: "Extensão de quadril"). */
    patternLabel?: string | null
}

/**
 * Devolve a nota, ou `null` quando não dá para gerar.
 *
 * NUNCA lança: adicionar o exercício é o que o usuário pediu; a descrição é um
 * bônus. Falhar aqui não pode custar a adição.
 */
export async function generateExerciseNote(
    admin: SupabaseClient,
    input: GenerateExerciseNoteInput,
): Promise<string | null> {
    const name = String(input?.exerciseName || '').trim()
    if (!name) return null

    const apiKey = env.gemini.apiKey
    if (!apiKey) return null

    try {
        // 'profile' traz objetivo, equipamento e RESTRIÇÕES (onde moram as dores
        // declaradas); 'assessment' e 'labs' evitam conselho que ignore o quadro.
        const context = await buildUserContextBlock(admin, input.userId, ['profile', 'assessment', 'labs'])

        const prompt = [
            ...(context ? [context, ''] : []),
            'Você é um educador físico escrevendo a instrução de execução de UM exercício,',
            'que aparece dentro do treino do aluno — o mesmo lugar onde ficam as instruções',
            'dos outros exercícios dele.',
            '',
            `EXERCÍCIO: ${name}`,
            ...(input.muscleLabel ? [`GRUPO ALVO: ${input.muscleLabel}`] : []),
            ...(input.patternLabel ? [`ENTROU PARA COBRIR: ${input.patternLabel}`] : []),
            '',
            'REGRAS:',
            '- 2 a 4 frases, no máximo 400 caracteres, em português-BR, tom de personal trainer.',
            '- Comece pelo posicionamento e siga para a execução (o que controlar, onde sentir).',
            '- Se o CONTEXTO acima trouxer restrição, dor ou limitação que afete ESTE movimento,',
            '  adapte a instrução e diga o ajuste concreto (postura, amplitude, carga) —',
            '  não repita a restrição como aviso solto.',
            '- Nada de saudação, título, markdown ou emoji. Só o texto da instrução.',
            '- Não invente lesão nem diagnóstico: use apenas o que está no contexto.',
        ].join('\n')

        const model = getGeminiModel(apiKey, env.gemini.fastModelId, { maxOutputTokens: 400, temperature: 0.5 })
        const result = await safeGemini('workout:exercise-note', () => model.generateContent(prompt), { maxAttempts: 1 })
        if ('errorResponse' in result) return null

        const raw = String(result.value?.response?.text?.() || '').trim()
        if (!raw) return null

        // O modelo às vezes devolve com aspas ou prefixo; limpa e corta no limite.
        const cleaned = raw
            .replace(/^["'`]+|["'`]+$/g, '')
            .replace(/^\s*(instru[çc][ãa]o|execu[çc][ãa]o)\s*:\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim()
        if (!cleaned) return null

        return cleaned.length > MAX_CHARS ? `${cleaned.slice(0, MAX_CHARS - 1).trimEnd()}…` : cleaned
    } catch (e) {
        // Saída silenciosa aqui já custou caro nesta feature: sem o sinal, o card
        // volta a criar exercício mudo e ninguém descobre.
        try { logWarnRemote('workout:exercise-note:failed', 'não consegui gerar a descrição', { exercise: name }) } catch { }
        void e
        return null
    }
}
