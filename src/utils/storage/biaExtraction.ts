/**
 * biaExtraction — chama o endpoint de IA pra extrair os 6 campos
 * numéricos do PDF/foto de bioimpedância já anexado no Storage.
 *
 * Fluxo no UI:
 *   1. Usuário faz upload do PDF (uploadBiaAttachment).
 *   2. Após sucesso → dispara extractBiaFromAttachment(publicUrl).
 *   3. Frontend popula os campos com os valores retornados.
 *   4. Usuário revisa/ajusta antes de salvar.
 */

export interface BiaExtractionData {
  body_fat_percentage: number | null
  lean_mass_kg: number | null
  fat_mass_kg: number | null
  water_percentage: number | null
  visceral_fat: number | null
  metabolic_age_years: number | null
  confidence: 'high' | 'medium' | 'low'
}

export interface BiaExtractionResult {
  ok: true
  data: BiaExtractionData
}

export interface BiaExtractionFailure {
  ok: false
  error: string
  /** Mensagem amigável em pt-BR — pode ser mostrada direto ao usuário. */
  message?: string
}

export type BiaExtractionResponse = BiaExtractionResult | BiaExtractionFailure

/**
 * Pede pro endpoint extrair os campos do anexo. Retorna data com null
 * em campos não encontrados — a UI deve tratar null como "deixa o
 * input vazio para o usuário preencher".
 */
export async function extractBiaFromAttachment(
  attachmentUrl: string,
): Promise<BiaExtractionResponse> {
  if (!attachmentUrl) return { ok: false, error: 'no_url' }

  try {
    const res = await fetch('/api/ai/bia-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: attachmentUrl }),
    })

    const json = await res.json().catch(() => null) as
      | { ok: true; data: BiaExtractionData }
      | { ok: false; error: string; message?: string }
      | null

    if (!json) return { ok: false, error: 'invalid_response' }

    if (!res.ok || !json.ok) {
      const failure = json as { ok: false; error: string; message?: string }
      return {
        ok: false,
        error: failure.error || `http_${res.status}`,
        message: failure.message,
      }
    }

    return { ok: true, data: json.data }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'network_error',
    }
  }
}

/**
 * Converte o resultado da IA em strings prontas pra preencher o form
 * (que usa string em todos os campos numéricos). null → '' para deixar
 * o input vazio. Precisão: %s e idades inteiras, kgs com 1 decimal.
 */
export function biaExtractionToFormStrings(data: BiaExtractionData): {
  bia_body_fat_percentage: string
  bia_lean_mass: string
  bia_fat_mass: string
  bia_water_percentage: string
  bia_visceral_fat: string
  bia_metabolic_age: string
} {
  const fmt1 = (n: number | null) => (n == null ? '' : n.toFixed(1).replace(/\.0$/, ''))
  const fmt0 = (n: number | null) => (n == null ? '' : Math.round(n).toString())
  return {
    bia_body_fat_percentage: fmt1(data.body_fat_percentage),
    bia_lean_mass: fmt1(data.lean_mass_kg),
    bia_fat_mass: fmt1(data.fat_mass_kg),
    bia_water_percentage: fmt1(data.water_percentage),
    bia_visceral_fat: fmt0(data.visceral_fat),
    bia_metabolic_age: fmt0(data.metabolic_age_years),
  }
}
