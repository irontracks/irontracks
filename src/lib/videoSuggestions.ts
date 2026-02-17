import { GoogleGenerativeAI } from '@google/generative-ai'

const VIDEO_AI_MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

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
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null
    const slice = candidate.substring(start, end + 1)
    try {
      return JSON.parse(slice)
    } catch {
      return null
    }
  }
}

export async function getVideoQueriesFromGemini(exerciseName: string) {
  const apiKey = String(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '').trim()
  if (!apiKey) throw new Error('missing_gemini_key')

  const name = String(exerciseName || '').trim()
  if (!name) return []

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: VIDEO_AI_MODEL_ID })

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

export async function searchYouTubeCandidates(query: string, maxResults = 5) {
  const apiKey = String(process.env.YOUTUBE_API_KEY || '').trim()
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
  const json: any = await resp.json().catch(() => null)
  const items = Array.isArray(json?.items) ? json.items : []
  return items
    .map((it: any) => {
      const videoId = String(it?.id?.videoId || '').trim()
      if (!videoId) return null
      return {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: String(it?.snippet?.title || '').trim(),
        channelTitle: String(it?.snippet?.channelTitle || '').trim(),
      }
    })
    .filter(Boolean)
}

