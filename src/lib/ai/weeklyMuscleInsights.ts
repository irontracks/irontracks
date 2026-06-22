/**
 * Geração dos insights semanais do Mapa Muscular via IA.
 *
 * Extraído da rota muscle-map-week pra ser reutilizado pelo cron de domingo
 * (api/cron/muscle-weekly-insights), que gera os insights automaticamente
 * para os VIPs que treinaram na semana.
 */
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { extractJsonFromModelText, normalizeAiInsights } from '@/utils/ai/muscleMapWeekHelpers'

const MODEL = env.gemini.modelId

export async function generateWeeklyMuscleInsights(apiKey: string, input: unknown, label = 'muscle-map-week:insights') {
  const schema = [
    '{',
    '  "summary": string[] (3-6),',
    '  "imbalanceAlerts": [',
    '    { "type": string, "severity": "info"|"warn"|"critical", "muscles": string[], "evidence": string, "suggestion": string }',
    '  ],',
    '  "recommendations": [',
    '    { "title": string, "actions": string[] }',
    '  ]',
    '}',
  ].join('\n')

  const prompt = [
    'Você é um coach de musculação do app IronTracks.',
    'Gere insights semanais a partir de volumes por músculo já calculados.',
    '',
    'REGRAS ABSOLUTAS:',
    '- Retorne APENAS um JSON válido (sem markdown, sem texto extra).',
    '- Escreva em pt-BR.',
    '- Não invente números; use apenas os dados fornecidos.',
    '- Se não der para afirmar algo, omita.',
    '- Seja prático e direto.',
    '',
    'Formato (JSON):',
    schema,
    '',
    'Dados (JSON):',
    JSON.stringify(input),
  ].join('\n')

  const model = getGeminiModel(apiKey, MODEL)
  const geminiResult = await safeGemini(label, () => model.generateContent(prompt))
  if ('errorResponse' in geminiResult) {
    throw new Error('ai_upstream_error')
  }
  const result = geminiResult.value
  const text = (await result?.response?.text()) || ''
  const parsed = extractJsonFromModelText(text)
  if (!parsed) return null
  return normalizeAiInsights(parsed)
}
