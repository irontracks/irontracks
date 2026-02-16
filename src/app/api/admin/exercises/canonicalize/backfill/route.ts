import { NextResponse } from 'next/server'

import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    limit: z.coerce.number().optional(),
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

async function resolveWithGemini(items: Array<{ normalized: string; alias: string; candidates: string[] }>) {
  const apiKey = String(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '').trim()
  if (!apiKey) throw new Error('missing_gemini_key')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: MODEL_ID })

  const prompt =
    'Você é um assistente para PADRONIZAR nomes de exercícios de musculação para relatórios de evolução.' +
    ' Retorne APENAS JSON válido no formato {"items":[{"normalized":string,"canonical":string,"confidence":number}]}.' +
    ' Regras: 1) canonical deve ser curto e consistente, preferindo PT-BR.' +
    ' 2) Se houver candidatos, escolha o mais adequado dentre eles (não invente outro se um candidato serve).' +
    ' 3) confidence de 0 a 1.' +
    ' 4) Não inclua markdown nem texto extra.' +
    ` Itens: ${JSON.stringify(items)}`

  const result = await model.generateContent(prompt)
  const text = (await result?.response?.text()) || ''
  const parsed = extractJson(text)
  const out = parsed && typeof parsed === 'object' ? (parsed as any).items : null
  return Array.isArray(out) ? out : []
}

export async function POST(req: Request) {
  let auth = await requireRole(['admin'])
  if (!auth.ok) {
    auth = await requireRoleWithBearer(req, ['admin'])
    if (!auth.ok) return auth.response
  }

  try {
    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const limitRaw = Number((body as any)?.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(60, Math.floor(limitRaw))) : 30

    const admin = createAdminClient()

    const { data: jobs, error: jobsErr } = await admin
      .from('exercise_alias_jobs')
      .select('id, user_id, alias, normalized_alias, status, attempts')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit)

    if (jobsErr) return NextResponse.json({ ok: false, error: jobsErr.message }, { status: 400 })

    const rows = Array.isArray(jobs) ? jobs : []
    if (!rows.length) return NextResponse.json({ ok: true, processed: 0, created: 0, updated: 0, failed: 0 })

    const users = Array.from(new Set(rows.map((r: any) => String(r?.user_id || '').trim()).filter(Boolean))).slice(0, 200)
    const { data: canonicalRows } = await admin
      .from('exercise_canonical')
      .select('id, user_id, display_name, normalized_name, usage_count')
      .in('user_id', users)
      .order('usage_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000)

    const canonByUser = new Map<string, Array<{ id: string; display_name: string; normalized_name: string }>>()
    ;(Array.isArray(canonicalRows) ? canonicalRows : []).forEach((r: any) => {
      const uid = String(r?.user_id || '').trim()
      const id = String(r?.id || '').trim()
      const dn = String(r?.display_name || '').trim()
      const nn = String(r?.normalized_name || '').trim()
      if (!uid || !id || !nn) return
      if (!canonByUser.has(uid)) canonByUser.set(uid, [])
      canonByUser.get(uid)!.push({ id, display_name: dn, normalized_name: nn })
    })

    const payload = rows.map((r: any) => {
      const uid = String(r?.user_id || '').trim()
      const alias = String(r?.alias || '').trim() || String(r?.normalized_alias || '').trim()
      const normalized = String(r?.normalized_alias || '').trim()
      const canonicals = canonByUser.get(uid) || []
      const candidates = canonicals.slice(0, 10).map((c) => c.display_name).filter(Boolean)
      return { normalized, alias, candidates }
    })

    const resolvedItems = await resolveWithGemini(payload)
    const byNormalized = new Map<string, { canonical: string; confidence: number }>()
    ;(Array.isArray(resolvedItems) ? resolvedItems : []).forEach((it: any) => {
      const n = String(it?.normalized || '').trim()
      const c = String(it?.canonical || '').trim()
      const conf = Number(it?.confidence)
      if (!n || !c) return
      byNormalized.set(n, { canonical: c, confidence: Number.isFinite(conf) ? conf : 0.65 })
    })

    let processed = 0
    let created = 0
    let updated = 0
    let failed = 0

    for (const r of rows) {
      const jobId = String((r as any)?.id || '').trim()
      const userId = String((r as any)?.user_id || '').trim()
      const alias = String((r as any)?.alias || '').trim() || String((r as any)?.normalized_alias || '').trim()
      const normalized = String((r as any)?.normalized_alias || '').trim()
      if (!jobId || !userId || !normalized) continue

      processed += 1

      const res = byNormalized.get(normalized) || null
      if (!res?.canonical) {
        failed += 1
        await admin
          .from('exercise_alias_jobs')
          .update({
            status: 'failed',
            attempts: (Number((r as any)?.attempts) || 0) + 1,
            last_error: 'no_result',
            processed_at: new Date().toISOString(),
          })
          .eq('id', jobId)
        continue
      }

      const canonicalName = res.canonical
      const canonicalNormalized = normalizeExerciseName(canonicalName)
      if (!canonicalNormalized) {
        failed += 1
        await admin
          .from('exercise_alias_jobs')
          .update({
            status: 'failed',
            attempts: (Number((r as any)?.attempts) || 0) + 1,
            last_error: 'invalid_canonical',
            processed_at: new Date().toISOString(),
          })
          .eq('id', jobId)
        continue
      }

      const { data: canonRow, error: canonErr } = await admin
        .from('exercise_canonical')
        .upsert(
          { user_id: userId, display_name: canonicalName, normalized_name: canonicalNormalized },
          { onConflict: 'user_id,normalized_name' },
        )
        .select('id')
        .maybeSingle()

      if (canonErr || !canonRow?.id) {
        failed += 1
        await admin
          .from('exercise_alias_jobs')
          .update({
            status: 'failed',
            attempts: (Number((r as any)?.attempts) || 0) + 1,
            last_error: String(canonErr?.message || 'canonical_upsert_failed'),
            processed_at: new Date().toISOString(),
          })
          .eq('id', jobId)
        continue
      }

      const canonicalId = String((canonRow as any).id)

      const needsReview = !(Number.isFinite(res.confidence) && res.confidence >= 0.78)
      const { error: aliasErr } = await admin
        .from('exercise_aliases')
        .upsert(
          {
            user_id: userId,
            canonical_id: canonicalId,
            alias,
            normalized_alias: normalized,
            confidence: Math.max(0, Math.min(1, res.confidence)),
            source: 'gemini',
            needs_review: needsReview,
          },
          { onConflict: 'user_id,normalized_alias' },
        )

      if (aliasErr) {
        failed += 1
        await admin
          .from('exercise_alias_jobs')
          .update({
            status: 'failed',
            attempts: (Number((r as any)?.attempts) || 0) + 1,
            last_error: String(aliasErr?.message || 'alias_upsert_failed'),
            processed_at: new Date().toISOString(),
          })
          .eq('id', jobId)
        continue
      }

      updated += 1

      await admin
        .from('exercise_alias_jobs')
        .update({
          status: 'done',
          attempts: (Number((r as any)?.attempts) || 0) + 1,
          last_error: null,
          resolved_canonical_name: canonicalName,
          resolved_canonical_id: canonicalId,
          resolved_confidence: Math.max(0, Math.min(1, res.confidence)),
          processed_at: new Date().toISOString(),
        })
        .eq('id', jobId)

      try {
        const { data: canonExisting } = await admin
          .from('exercise_canonical')
          .select('usage_count')
          .eq('user_id', userId)
          .eq('id', canonicalId)
          .maybeSingle()
        const nextCount = (Number((canonExisting as any)?.usage_count) || 0) + 1
        await admin.from('exercise_canonical').update({ usage_count: nextCount }).eq('user_id', userId).eq('id', canonicalId)
      } catch {}

      if (!needsReview) created += 1
    }

    return NextResponse.json({ ok: true, processed, created, updated, failed })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
