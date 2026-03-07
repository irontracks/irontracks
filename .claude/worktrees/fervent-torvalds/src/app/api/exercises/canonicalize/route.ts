import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'

import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    mode: z.string().optional(),
    names: z.unknown().optional(),
    name: z.unknown().optional(),
  })
  .passthrough()

const MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

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

const isMissingTable = (error: any) => {
  try {
    if (!error) return false
    const status = Number((error as Record<string, unknown>)?.status)
    const code = (error as Record<string, unknown>)?.code ? String((error as Record<string, unknown>).code) : ''
    const msg = (error as Record<string, unknown>)?.message ? String((error as Record<string, unknown>).message) : ''
    return status === 404 || code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg)
  } catch {
    return false
  }
}

const tokenize = (normalized: string) => {
  return new Set(String(normalized || '').split(' ').map((t) => t.trim()).filter(Boolean))
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size && !b.size) return 0
  let inter = 0
  a.forEach((x) => {
    if (b.has(x)) inter += 1
  })
  const union = a.size + b.size - inter
  return union ? inter / union : 0
}

const bestDeterministic = (
  aliasNormalized: string,
  canonicals: Array<{ id: string; display_name: string; normalized_name: string }>,
) => {
  const a = String(aliasNormalized || '').trim()
  if (!a) return null
  const aTokens = tokenize(a)
  let best: { id: string; display_name: string; score: number } | null = null
  for (const c of canonicals) {
    const cn = String(c?.normalized_name || '').trim()
    if (!cn) continue
    let score = 0
    if (cn === a) score = 1
    else if (cn.includes(a) || a.includes(cn)) score = 0.9
    else score = jaccard(aTokens, tokenize(cn))
    if (!best || score > best.score) best = { id: String(c.id), display_name: String(c.display_name), score }
  }
  if (!best) return null
  if (best.score >= 0.78) return best
  return null
}

async function resolveWithGemini(payload: Array<{ alias: string; normalized: string; candidates: string[] }>) {
  const apiKey = String(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '').trim()
  if (!apiKey) throw new Error('missing_gemini_key')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: MODEL_ID })

  const prompt =
    'Você é um assistente para PADRONIZAR nomes de exercícios de musculação para relatórios de evolução.' +
    ' Retorne APENAS JSON válido no formato {"items":[{"normalized":string,"canonical":string,"confidence":number}]}.' +
    ' Regras: 1) canonical deve ser curto e consistente, preferindo PT-BR (ex: "Supino Reto", "Agachamento Livre").' +
    ' 2) Se houver candidatos, escolha o mais adequado dentre eles (não invente outro se um candidato serve).' +
    ' 3) confidence de 0 a 1 (0.9+ quando for óbvio).' +
    ' 4) Não inclua markdown nem texto extra.' +
    ` Itens: ${JSON.stringify(payload)}`

  const result = await model.generateContent(prompt)
  const text = (await result?.response?.text()) || ''
  const parsed = extractJson(text)
  const items = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).items : null
  return Array.isArray(items) ? items : []
}

export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  try {
    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const mode = String(body?.mode || '').trim().toLowerCase()
    const asyncPrefetch = mode === 'prefetch' || mode === 'async'
    const raw = body?.names ?? body?.name ?? []
    const names = Array.isArray(raw) ? raw : [raw]
    const cleaned = names
      .map((n) => String(n ?? '').trim())
      .filter(Boolean)
      .slice(0, 120)

    const normalizedList = Array.from(new Set(cleaned.map((n) => normalizeExerciseName(n)).filter(Boolean)))
    if (!normalizedList.length) return NextResponse.json({ ok: true, map: {} })

    const admin = createAdminClient()
    const userId = String(auth.user.id)

    const { data: aliasRows, error: aliasErr } = await admin
      .from('exercise_aliases')
      .select('normalized_alias, canonical_id')
      .eq('user_id', userId)
      .in('normalized_alias', normalizedList)
      .limit(normalizedList.length)
    if (isMissingTable(aliasErr)) {
      const map: Record<string, string> = {}
      for (const n of normalizedList) map[n] = cleaned.find((orig) => normalizeExerciseName(orig) === n) || n
      return NextResponse.json({ ok: true, map }, { headers: { 'cache-control': 'no-store, max-age=0' } })
    }

    const aliasArr = Array.isArray(aliasRows) ? aliasRows : []
    const byAlias = new Map<string, string>()
    for (const r of aliasArr) {
      const a = String((r as Record<string, unknown>)?.normalized_alias || '').trim()
      const cid = String((r as Record<string, unknown>)?.canonical_id || '').trim()
      if (a && cid) byAlias.set(a, cid)
    }

    const canonicalIds = Array.from(new Set(Array.from(byAlias.values())))
    let canonicalsById = new Map<string, { id: string; display_name: string; normalized_name: string }>()
    if (canonicalIds.length) {
      const { data } = await admin
        .from('exercise_canonical')
        .select('id, display_name, normalized_name')
        .eq('user_id', userId)
        .in('id', canonicalIds)
        .limit(canonicalIds.length)
      ;(Array.isArray(data) ? data : []).forEach((row: any) => {
        const id = String(row?.id || '').trim()
        if (!id) return
        canonicalsById.set(id, {
          id,
          display_name: String(row?.display_name || '').trim(),
          normalized_name: String(row?.normalized_name || '').trim(),
        })
      })
    }

    const missing = normalizedList.filter((n) => !byAlias.has(n))

    const { data: canonicalTop, error: canonicalTopErr } = await admin
      .from('exercise_canonical')
      .select('id, display_name, normalized_name')
      .eq('user_id', userId)
      .order('usage_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(250)
    if (isMissingTable(canonicalTopErr)) {
      const map: Record<string, string> = {}
      for (const n of normalizedList) map[n] = cleaned.find((orig) => normalizeExerciseName(orig) === n) || n
      return NextResponse.json({ ok: true, map }, { headers: { 'cache-control': 'no-store, max-age=0' } })
    }

    const canonicals = (Array.isArray(canonicalTop) ? canonicalTop : []).map((row: any) => ({
      id: String(row?.id || '').trim(),
      display_name: String(row?.display_name || '').trim(),
      normalized_name: String(row?.normalized_name || '').trim(),
    })).filter((r: any) => r.id && r.normalized_name)

    const map: Record<string, string> = {}
    normalizedList.forEach((n) => {
      const cid = byAlias.get(n)
      if (!cid) return
      const c = canonicalsById.get(cid)
      if (c?.display_name) map[n] = c.display_name
    })

    const deterministicResolved: Array<{ normalized: string; canonical_id: string; canonical_name: string; confidence: number }> = []
    for (const n of missing) {
      const best = bestDeterministic(n, canonicals)
      if (!best) continue
      deterministicResolved.push({ normalized: n, canonical_id: best.id, canonical_name: best.display_name, confidence: best.score })
      map[n] = best.display_name
    }

    const stillMissing = missing.filter((n) => !map[n])
    let geminiResolved: Array<{ normalized: string; canonical: string; confidence: number }> = []
    if (!asyncPrefetch && stillMissing.length) {
      try {
        const payload = stillMissing.slice(0, 40).map((n) => {
          const rawAlias = cleaned.find((orig) => normalizeExerciseName(orig) === n) || n
          const topCandidates = canonicals
            .map((c) => ({ n: c.display_name, s: (() => {
              const det = bestDeterministic(n, [c])
              return det?.score || 0
            })() }))
            .filter((x) => x.s > 0.35)
            .sort((a, b) => b.s - a.s)
            .slice(0, 8)
            .map((x) => x.n)
          return { alias: rawAlias, normalized: n, candidates: topCandidates }
        })
        const items = await resolveWithGemini(payload)
        geminiResolved = (Array.isArray(items) ? items : []).map((it: any) => ({
          normalized: String(it?.normalized || '').trim(),
          canonical: String(it?.canonical || '').trim(),
          confidence: Number(it?.confidence),
        })).filter((it) => it.normalized && it.canonical)
      } catch {
        geminiResolved = []
      }
    }

    if (asyncPrefetch && stillMissing.length) {
      try {
        const jobs = stillMissing.slice(0, 80).map((n) => ({
          user_id: userId,
          alias: cleaned.find((orig) => normalizeExerciseName(orig) === n) || n,
          normalized_alias: n,
          status: 'pending',
        }))
        await admin.from('exercise_alias_jobs').upsert(jobs, { onConflict: 'user_id,normalized_alias' })
      } catch {}
    }

    for (const it of geminiResolved) {
      if (map[it.normalized]) continue
      const canonicalName = it.canonical
      const canonicalNormalized = normalizeExerciseName(canonicalName)
      if (!canonicalNormalized) continue

      const { data: upCanon } = await admin
        .from('exercise_canonical')
        .upsert(
          { user_id: userId, display_name: canonicalName, normalized_name: canonicalNormalized },
          { onConflict: 'user_id,normalized_name' },
        )
        .select('id, display_name, normalized_name, usage_count')
        .maybeSingle()

      const canonicalId = String((upCanon as Record<string, unknown>)?.id || '').trim()
      if (!canonicalId) continue

      await admin
        .from('exercise_aliases')
        .upsert(
          {
            user_id: userId,
            canonical_id: canonicalId,
            alias: cleaned.find((orig) => normalizeExerciseName(orig) === it.normalized) || it.normalized,
            normalized_alias: it.normalized,
            confidence: Number.isFinite(it.confidence) ? Math.max(0, Math.min(1, it.confidence)) : 0.65,
            source: 'gemini',
            needs_review: !(Number.isFinite(it.confidence) && it.confidence >= 0.78),
          },
          { onConflict: 'user_id,normalized_alias' },
        )

      await admin
        .from('exercise_canonical')
        .update({ usage_count: (upCanon as Record<string, unknown>)?.usage_count != null ? (Number((upCanon as Record<string, unknown>).usage_count) || 0) + 1 : 1 })
        .eq('user_id', userId)
        .eq('id', canonicalId)

      map[it.normalized] = canonicalName
    }

    for (const it of deterministicResolved) {
      try {
        await admin
          .from('exercise_aliases')
          .upsert(
            {
              user_id: userId,
              canonical_id: it.canonical_id,
              alias: cleaned.find((orig) => normalizeExerciseName(orig) === it.normalized) || it.normalized,
              normalized_alias: it.normalized,
              confidence: Math.max(0, Math.min(1, it.confidence)),
              source: 'deterministic',
              needs_review: it.confidence < 0.85,
            },
            { onConflict: 'user_id,normalized_alias' },
          )
      } catch {}
    }

    for (const n of normalizedList) {
      if (!map[n]) map[n] = cleaned.find((orig) => normalizeExerciseName(orig) === n) || n
    }

    return NextResponse.json({ ok: true, map }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
