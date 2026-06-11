import { GoogleGenerativeAI, type GenerationConfig, type GenerativeModel } from '@google/generative-ai'

/**
 * Creates a Gemini model with "thinking" disabled by default.
 *
 * `gemini-2.5-flash` (the model behind every AI route here) enables thinking by
 * default. The reasoning tokens consume the output budget BEFORE the visible
 * response is written, which truncates structured JSON outputs (finishReason
 * MAX_TOKENS) and silently breaks any route that expects JSON. Setting
 * `thinkingBudget: 0` disables it and frees the whole `maxOutputTokens` for the
 * actual response.
 *
 * Pass the same `generationConfig` you would give to `getGenerativeModel`; the
 * thinking-off setting is merged in (and can be overridden if ever needed).
 */
export function getGeminiModel(
  genAI: GoogleGenerativeAI,
  model: string,
  generationConfig: GenerationConfig = {},
): GenerativeModel {
  const cfg: GenerationConfig & { thinkingConfig?: { thinkingBudget: number } } = {
    thinkingConfig: { thinkingBudget: 0 },
    ...generationConfig,
  }
  return genAI.getGenerativeModel({ model, generationConfig: cfg })
}
