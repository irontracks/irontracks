import { getGeminiModel } from '@/utils/ai/gemini'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { env } from '@/utils/env'

const VIDEO_AI_MODEL_ID = env.gemini.modelId || 'gemini-2.5-flash'

const extractJson = (raw: string) => {
  const text = String(raw || '').trim()
  if (!text) return null
  let candidate = text
  if (candidate.startsWith('```')) {
    const firstBreak = candidate.indexOf('\n')
    const lastFence = candidate.lastIndexOf('```')
    if (firstBreak !== -1 && lastFence !== -1) {
      candidate = candidate.substring(firstBreak + 1, lastFence).trim()
    }
  }
  const direct = parseJsonWithSchema(candidate, z.record(z.unknown()))
  if (direct) return direct
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const slice = candidate.substring(start, end + 1)
  return parseJsonWithSchema(slice, z.record(z.unknown()))
}

export async function getVideoQueriesFromGemini(exerciseName: string) {
  const apiKey = env.gemini.apiKey.trim()
  if (!apiKey) throw new Error('missing_gemini_key')

  const name = String(exerciseName || '').trim()
  if (!name) return []

  const model = getGeminiModel(apiKey, VIDEO_AI_MODEL_ID)

  const prompt =
    'Você é um assistente para padronizar nomes de exercícios e gerar termos de busca para vídeos de execução.' +
    ' Retorne APENAS um JSON válido no formato {"canonical_name": string, "queries": string[]}.' +
    ' Regras: 1) queries deve ter 3 a 6 termos curtos, misturando PT-BR e EN quando fizer sentido.' +
    ' 2) Inclua ao menos uma query com a palavra "execução" e uma com "how to".' +
    ' 3) Não inclua markdown, nem texto extra.' +
    ` Exercício: "${name}".`

  const result = await model.generateContent(prompt)
  const text = (await result?.response?.text()) || ''
  const parsed = extractJson(text)
  const queriesRaw = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).queries : null
  const queriesArr = Array.isArray(queriesRaw) ? queriesRaw : []

  const cleaned = queriesArr
    .map((q) => String(q || '').trim())
    .filter(Boolean)
    .slice(0, 6)

  return Array.from(new Set(cleaned))
}

export interface YouTubeCandidate {
  videoId: string
  url: string
  title: string
  channelTitle: string
  channelId: string
}

export async function searchYouTubeCandidates(query: string, maxResults = 5): Promise<YouTubeCandidate[]> {
  const apiKey = env.youtube.apiKey.trim()
  if (!apiKey) throw new Error('missing_youtube_key')

  const q = String(query || '').trim()
  if (!q) return []

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('videoEmbeddable', 'true')
  url.searchParams.set('safeSearch', 'strict')
  url.searchParams.set('maxResults', String(Math.max(1, Math.min(10, maxResults))))
  url.searchParams.set('q', q)

  const resp = await fetch(url.toString(), { method: 'GET' })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(text || `youtube_error_${resp.status}`)
  }
  type YouTubeItem = { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; channelId?: string } }
  type YouTubeResponse = { items?: YouTubeItem[] }
  const json: unknown = await resp.json().catch((): unknown => null)
  const response = json as YouTubeResponse | null
  const items = Array.isArray(response?.items) ? response.items : []
  return items
    .map((it: YouTubeItem): YouTubeCandidate | null => {
      const videoId = String(it?.id?.videoId || '').trim()
      if (!videoId) return null
      return {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: String(it?.snippet?.title || '').trim(),
        channelTitle: String(it?.snippet?.channelTitle || '').trim(),
        channelId: String(it?.snippet?.channelId || '').trim(),
      }
    })
    .filter((c): c is YouTubeCandidate => c !== null)
}

/**
 * Enriquece candidatos com duração e contagem de views via videos.list.
 * Faz 1 request agregada pros N video_ids — bem mais barato que N requests.
 *
 * Retorna o mesmo array de entrada com campos extras { durationSec, viewCount }.
 */
export interface YouTubeCandidateEnriched extends YouTubeCandidate {
  durationSec: number | null
  viewCount: number | null
}

export async function enrichYouTubeVideos(
  candidates: YouTubeCandidate[],
): Promise<YouTubeCandidateEnriched[]> {
  const apiKey = env.youtube.apiKey.trim()
  if (!apiKey || candidates.length === 0) {
    return candidates.map(c => ({ ...c, durationSec: null, viewCount: null }))
  }

  const ids = candidates.map(c => c.videoId).join(',')
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('part', 'contentDetails,statistics')
  url.searchParams.set('id', ids)

  try {
    const resp = await fetch(url.toString())
    if (!resp.ok) {
      return candidates.map(c => ({ ...c, durationSec: null, viewCount: null }))
    }
    type Item = {
      id?: string
      contentDetails?: { duration?: string }
      statistics?: { viewCount?: string }
    }
    const json = await resp.json().catch(() => null) as { items?: Item[] } | null
    const byId = new Map<string, Item>()
    for (const it of json?.items ?? []) {
      if (it?.id) byId.set(it.id, it)
    }
    return candidates.map(c => {
      const item = byId.get(c.videoId)
      return {
        ...c,
        durationSec: parseIsoDurationSeconds(item?.contentDetails?.duration),
        viewCount: parseInt(item?.statistics?.viewCount || '0', 10) || null,
      }
    })
  } catch {
    return candidates.map(c => ({ ...c, durationSec: null, viewCount: null }))
  }
}

/** Parse ISO 8601 duration (PT1M30S → 90s). Null se não conseguir. */
function parseIsoDurationSeconds(iso: string | undefined | null): number | null {
  if (!iso) return null
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return null
  const h = parseInt(m[1] || '0', 10)
  const min = parseInt(m[2] || '0', 10)
  const s = parseInt(m[3] || '0', 10)
  return h * 3600 + min * 60 + s
}

/**
 * Score 0-100 com decomposição. Heurística:
 *
 *   Canal whitelisted   → +30 (high), +20 (medium), +10 (low)
 *   Título bate          → 0-25 (regex normalizado)
 *   Duração 30s-5min     → +15
 *   Views > 10k          → +10, > 100k → +15, > 1M → +20
 *   Bonus extra: idioma pt-BR no canal preferido → +5
 *
 * Total esperado: 0-100. Threshold padrão:
 *   ≥ 80 → auto-aprovar
 *   50-79 → fila de revisão
 *   < 50 → descartar
 */
export interface ScoreBreakdown {
  channelBonus: number
  titleMatch: number
  durationBonus: number
  viewsBonus: number
  total: number
  reason: string
}

export interface WhitelistedChannel {
  channel_id: string
  channel_name: string
  trust_level: 'high' | 'medium' | 'low'
  language: string
}

export function scoreVideoCandidate(
  exerciseName: string,
  candidate: YouTubeCandidateEnriched,
  whitelist: Map<string, WhitelistedChannel>,
): ScoreBreakdown {
  // ── Channel bonus ───────────────────────────────────────────────
  const wl = whitelist.get(candidate.channelId)
  const channelBonus = wl
    ? (wl.trust_level === 'high' ? 30 : wl.trust_level === 'medium' ? 20 : 10)
    : 0

  // ── Title match: normalize ambos e veja overlap ─────────────────
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const exTokens = new Set(normalize(exerciseName).split(' ').filter(t => t.length > 2))
  const titleTokens = new Set(normalize(candidate.title).split(' ').filter(t => t.length > 2))
  let overlap = 0
  for (const t of exTokens) if (titleTokens.has(t)) overlap++
  const titleMatch = exTokens.size > 0
    ? Math.min(25, Math.round((overlap / exTokens.size) * 25))
    : 0

  // ── Duration bonus: ideal entre 30s-5min ────────────────────────
  let durationBonus = 0
  if (candidate.durationSec != null && candidate.durationSec >= 30 && candidate.durationSec <= 300) {
    durationBonus = 15
  } else if (candidate.durationSec != null && candidate.durationSec >= 15 && candidate.durationSec <= 600) {
    durationBonus = 8
  }

  // ── Views bonus: indicador de qualidade percebida ───────────────
  let viewsBonus = 0
  if (candidate.viewCount != null) {
    if (candidate.viewCount >= 1_000_000) viewsBonus = 20
    else if (candidate.viewCount >= 100_000) viewsBonus = 15
    else if (candidate.viewCount >= 10_000) viewsBonus = 10
    else if (candidate.viewCount >= 1_000) viewsBonus = 5
  }

  const total = channelBonus + titleMatch + durationBonus + viewsBonus
  const reasonParts: string[] = []
  if (wl) reasonParts.push(`Canal ${wl.trust_level} (${wl.channel_name})`)
  if (titleMatch >= 15) reasonParts.push('Título bate bem')
  else if (titleMatch >= 8) reasonParts.push('Título parcial')
  if (durationBonus === 15) reasonParts.push('Duração ideal')
  if (viewsBonus >= 15) reasonParts.push('Alta popularidade')
  const reason = reasonParts.length > 0 ? reasonParts.join(' · ') : 'Sem critérios fortes'

  return { channelBonus, titleMatch, durationBonus, viewsBonus, total, reason }
}
