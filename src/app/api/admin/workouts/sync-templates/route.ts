import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { hasValidInternalSecret, requireRole } from '@/utils/auth/route'
import { syncAllTemplatesToSubscriber } from '@/lib/workoutSync'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const body = await req.json().catch(() => ({}))
    const id = body?.id as string | undefined
    const email = body?.email as string | undefined

    let targetUserId = ''
    if (id) {
      const { data: sById } = await admin.from('students').select('id, user_id').eq('id', id).maybeSingle()
      if (sById?.user_id) targetUserId = sById.user_id
      if (!targetUserId) {
        const { data: pById } = await admin.from('profiles').select('id').eq('id', id).maybeSingle()
        if (pById?.id) {
          targetUserId = pById.id
        }
      }
    }
    if (!targetUserId && email) {
      const { data: profile } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
      const { data: student } = await admin.from('students').select('id, user_id').ilike('email', email).maybeSingle()
      targetUserId = profile?.id || student?.user_id || ''
    }
    if (!targetUserId) return NextResponse.json({ ok: false, error: 'missing target' }, { status: 400 })

    if (auth.role !== 'admin') {
      try {
        const { data: srow } = await admin
          .from('students')
          .select('id, teacher_id, user_id, email')
          .or(`id.eq.${targetUserId},user_id.eq.${targetUserId}${email ? `,email.ilike.${email}` : ''}`)
          .maybeSingle()
        if (!srow?.id || srow.teacher_id !== auth.user.id) {
          return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      }
    }

    try {
      const { data: maybeProfile } = await admin.from('profiles').select('id').eq('id', targetUserId).maybeSingle()
      if (!maybeProfile?.id) {
        return NextResponse.json(
          { ok: false, error: 'Aluno sem conta (user_id). Não é possível sincronizar.' },
          { status: 400 },
        )
      }
    } catch {
      return NextResponse.json({ ok: false, error: 'Falha ao validar aluno' }, { status: 400 })
    }

    const sourceUserId = auth.user.id

    const normalizeName = (s: string) =>
      (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()

    const namesArr: string[] = Array.isArray((body as any)?.names)
      ? (body as any).names.map((x: any) => String(x).toLowerCase().trim()).filter(Boolean)
      : []

    const letters = namesArr.map((x) => x[0]).filter(Boolean)

    const modeRaw = String((body as any)?.mode || '').toLowerCase().trim()
    const syncMode: 'all' | 'letters' = modeRaw === 'all' ? 'all' : 'letters'

    const templateIds: string[] = Array.isArray((body as any)?.template_ids)
      ? (body as any).template_ids
          .map((x: any) => String(x || '').trim())
          .filter((x: string) => /^[0-9a-fA-F-]{36}$/.test(x))
      : []

    const matchesGroup = (rawName: string) => {
      const nn = normalizeName(rawName)
      if (!nn) return false
      return letters.some((l) => {
        const letter = String(l).toLowerCase()
        return (
          nn.startsWith(`treino (${letter}`) ||
          nn.startsWith(`treino ${letter}`) ||
          nn.includes(`(${letter})`) ||
          nn.includes(`(${letter} `)
        )
      })
    }

    const matchesGroupForLetter = (rawName: string, letterRaw: string) => {
      const letter = String(letterRaw || '').toLowerCase()
      const nn = normalizeName(rawName)
      if (!nn || !letter) return false
      return (
        nn.startsWith(`treino (${letter}`) ||
        nn.startsWith(`treino ${letter}`) ||
        nn.includes(`(${letter})`) ||
        nn.includes(`(${letter} `)
      )
    }

    const exercisesLen = (row: any) => (Array.isArray(row?.exercises) ? row.exercises.length : 0)

    const pickBestByLetter = (rows: any[], letterRaw: string) => {
      const letter = String(letterRaw || '').toLowerCase()
      const candidates = (rows || []).filter((r) => matchesGroupForLetter(r?.name || '', letter))
      candidates.sort((a, b) => exercisesLen(b) - exercisesLen(a))
      return candidates[0] || null
    }

    const buildNameOr = (lettersIn: string[]) => {
      const safe = (lettersIn || []).map((l) => String(l || '').toLowerCase()).filter((l) => /^[a-z]$/.test(l))
      const parts: string[] = []
      for (const l of safe) {
        parts.push(`name.ilike.%treino (${l}%`)
        parts.push(`name.ilike.%treino ${l}%`)
        parts.push(`name.ilike.%(${l})%`)
        parts.push(`name.ilike.%(${l} %`)
      }
      return parts.join(',')
    }

    const selectTpl = `
        id, 
        name, 
        notes, 
        is_template,
        created_by,
        user_id,
        exercises (
          id, 
          name, 
          notes, 
          rest_time, 
          video_url, 
          method, 
          cadence, 
          order,
          sets (
            weight,
            reps,
            rpe,
            set_number,
            is_warmup,
            advanced_config
          )
        )
      `

    let providedTemplatesRaw: any[] = []
    if (templateIds.length > 0) {
      const { data: raw, error: pErr } = await admin.from('workouts').select(selectTpl).in('id', templateIds)
      if (pErr) {
        return NextResponse.json(
          { ok: false, error: pErr.message, debug: { sourceUserId, templateIdsCount: templateIds.length } },
          { status: 400 },
        )
      }
      providedTemplatesRaw = raw || []
    }

    const { data: ownerTemplatesRaw, error: ownerErr } = await admin
      .from('workouts')
      .select(selectTpl)
      .or(`created_by.eq.${sourceUserId},user_id.eq.${sourceUserId}`)
    if (ownerErr) {
      return NextResponse.json({ ok: false, error: ownerErr.message, debug: { sourceUserId } }, { status: 400 })
    }

    const isOwnedSyncable = (t: any) => {
      if (!t || typeof t !== 'object') return false
      const cb = String(t?.created_by || '')
      const uid = String(t?.user_id || '')
      const owned = cb === String(sourceUserId) || uid === String(sourceUserId)
      if (!owned) return false
      const exCount = Array.isArray(t?.exercises) ? t.exercises.length : 0
      return t?.is_template === true || exCount > 0
    }

    const providedOwned = (providedTemplatesRaw || []).filter(isOwnedSyncable)
    const ownerOwned = (ownerTemplatesRaw || []).filter(isOwnedSyncable)

    const providedMatched = syncMode === 'all' ? providedOwned : providedOwned.filter((t: any) => matchesGroup(t?.name || ''))
    const ownerMatched = syncMode === 'all' ? ownerOwned : ownerOwned.filter((t: any) => matchesGroup(t?.name || ''))

    let sourceMode: 'provided' | 'owner' | 'global' = providedMatched.length > 0 ? 'provided' : 'owner'
    let sourceRows: any[] = providedMatched.length > 0 ? providedMatched : ownerMatched
    if (sourceRows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            syncMode === 'all'
              ? 'Nenhum template seu encontrado para sincronizar.'
              : 'Nenhum template seu encontrado no padrão (Treino A/B/C...).',
          debug: {
            sourceUserId,
            authUserId: auth.user.id,
            source_mode: sourceMode,
            owner_raw_count: (ownerTemplatesRaw || []).length,
            owner_owned_count: ownerOwned.length,
            owner_matched_count: ownerMatched.length,
            provided_raw_count: (providedTemplatesRaw || []).length,
            provided_owned_count: providedOwned.length,
            provided_matched_count: providedMatched.length,
            owner_sample_names: (ownerTemplatesRaw || []).map((t: any) => t?.name || '').filter(Boolean).slice(0, 5),
            letters,
            syncMode,
          },
        },
        { status: 400 },
      )
    }

    const { data: existing, error: existingErr } = await admin
      .from('workouts')
      .select('id, name, created_by, created_at')
      .eq('user_id', targetUserId)
      .eq('is_template', true)
    if (existingErr) {
      return NextResponse.json({ ok: false, error: existingErr.message, debug: { targetUserId } }, { status: 400 })
    }

    const syncedExisting = (existing || []).filter((w: any) => (w?.created_by || '') === auth.user.id)
    const syncedExistingMatched = (syncedExisting || []).filter((w: any) => matchesGroup(w?.name || ''))

    const byName = new Map<string, any[]>()
    for (const w of syncedExistingMatched) {
      const k = normalizeName(w?.name || '')
      if (!k) continue
      const list = byName.get(k) || []
      list.push(w)
      byName.set(k, list)
    }

    const allowDeleteDedup = Boolean(hasValidInternalSecret(req) && auth.role === 'admin' && (body as any)?.allow_delete_dedup === true)
    let dedup_deleted = 0
    const keptSynced = new Map<string, { id: string; name: string }>()
    for (const entry of Array.from(byName.entries())) {
      const [k, list] = entry
      const sorted = (list || []).slice().sort((a: any, b: any) => {
        const da = a?.created_at ? new Date(a.created_at).getTime() : 0
        const db = b?.created_at ? new Date(b.created_at).getTime() : 0
        return db - da
      })
      const keep = sorted[0]
      if (keep?.id) keptSynced.set(k, { id: keep.id, name: keep.name })
      const toDelete = sorted.slice(1)
      if (!allowDeleteDedup) continue
      for (const d of toDelete) {
        const wid = d?.id
        if (!wid) continue
        try {
          const { data: exs } = await admin.from('exercises').select('id').eq('workout_id', wid)
          const exIds = (exs || []).map((x: any) => x?.id).filter(Boolean)
          if (exIds.length > 0) {
            await admin.from('sets').delete().in('exercise_id', exIds)
          }
          await admin.from('exercises').delete().eq('workout_id', wid)
          await admin.from('workouts').delete().eq('id', wid)
          dedup_deleted++
        } catch {
          continue
        }
      }
    }

    const picked: any[] = []
    for (const l of letters) {
      const best = pickBestByLetter(sourceRows, l)
      if (best) picked.push(best)
    }

    const teacherTemplates = picked.reduce((map: Record<string, any>, t: any) => {
      const key = normalizeName(t.name || '')
      const current = map[key]
      const len = exercisesLen(t)
      if (!current || len > exercisesLen(current)) map[key] = t
      return map
    }, {})
    const teacherTemplatesList: any[] = Object.values(teacherTemplates)

    const existingMap = new Map<string, { id: string; name: string }>()
    for (const entry of Array.from(keptSynced.entries())) {
      const [k, v] = entry
      if (k && v?.id) existingMap.set(k, v)
    }

    try {
      await admin
        .from('workout_sync_subscriptions')
        .upsert(
          { source_user_id: sourceUserId, target_user_id: targetUserId, active: true },
          { onConflict: 'source_user_id,target_user_id' },
        )
    } catch {}

    let created = 0
    let updated = 0
    let failed = 0

    if (syncMode === 'all') {
      const res = await syncAllTemplatesToSubscriber({ sourceUserId, targetUserId })
      created = res?.created ?? 0
      updated = res?.updated ?? 0
      failed = res?.failed ?? 0
    } else {
      for (const t of teacherTemplatesList) {
        const tName = normalizeName(t.name || '')
        if (!tName) continue
        const targetWorkout = existingMap.get(tName)
        const exs = Array.isArray(t?.exercises) ? t.exercises.filter((x: any) => x && typeof x === 'object') : []

        try {
          if (targetWorkout) {
            await admin.from('workouts').update({ notes: t.notes, is_template: true }).eq('id', targetWorkout.id)

            const { data: oldExs } = await admin.from('exercises').select('id').eq('workout_id', targetWorkout.id)
            const oldExIds = (oldExs || []).map((x: any) => x?.id).filter(Boolean)
            if (oldExIds.length > 0) {
              await admin.from('sets').delete().in('exercise_id', oldExIds)
            }
            await admin.from('exercises').delete().eq('workout_id', targetWorkout.id)

            for (const e of exs) {
              const { data: newEx } = await admin
                .from('exercises')
                .insert({
                  workout_id: targetWorkout.id,
                  name: e.name || '',
                  notes: e.notes || '',
                  rest_time: e.rest_time ?? 60,
                  video_url: e.video_url || '',
                  method: e.method || 'Normal',
                  cadence: e.cadence || '2020',
                  order: e.order ?? 0,
                })
                .select()
                .single()

              const sets = Array.isArray(e?.sets) ? e.sets : []
              if (newEx?.id && sets.length > 0) {
                const newSets = sets.map((s: any) => ({
                  exercise_id: newEx.id,
                  weight: s.weight ?? null,
                  reps: s.reps ?? null,
                  rpe: s.rpe ?? null,
                  set_number: s.set_number ?? 1,
                  completed: false,
                }))
                await admin.from('sets').insert(newSets)
              }
            }
            updated++
          } else {
            const { data: nw, error: wErr } = await admin
              .from('workouts')
              .insert({
                user_id: targetUserId || null,
                name: t.name,
                notes: t.notes,
                created_by: sourceUserId,
                is_template: true,
              })
              .select()
              .single()

            if (wErr || !nw?.id) {
              failed++
              continue
            }
            created++

            for (const e of exs) {
              const { data: newEx } = await admin
                .from('exercises')
                .insert({
                  workout_id: nw.id,
                  name: e.name || '',
                  notes: e.notes || '',
                  rest_time: e.rest_time ?? 60,
                  video_url: e.video_url || '',
                  method: e.method || 'Normal',
                  cadence: e.cadence || '2020',
                  order: e.order ?? 0,
                })
                .select()
                .single()

              const sets = Array.isArray(e?.sets) ? e.sets : []
              if (newEx?.id && sets.length > 0) {
                const newSets = sets.map((s: any) => ({
                  exercise_id: newEx.id,
                  weight: s.weight ?? null,
                  reps: s.reps ?? null,
                  rpe: s.rpe ?? null,
                  set_number: s.set_number ?? 1,
                  completed: false,
                }))
                await admin.from('sets').insert(newSets)
              }
            }
          }
        } catch {
          failed++
        }
      }
    }

    const { data: rows } = await admin
      .from('workouts')
      .select('*, exercises(*, sets(*))')
      .eq('user_id', targetUserId)
      .eq('is_template', true)
      .order('name')

    const debug = {
      sourceUserId,
      targetUserId,
      letters,
      source_mode: sourceMode,
      syncMode,
      provided_ids_count: templateIds.length,
      provided_raw_count: (providedTemplatesRaw || []).length,
      provided_matched_count: providedMatched.length,
      owner_raw_count: (ownerTemplatesRaw || []).length,
      owner_matched_count: ownerMatched.length,
      source_count: sourceRows.length,
      picked_count: syncMode === 'all' ? sourceRows.length : teacherTemplatesList.length,
      failed_count: failed,
      dedup_deleted_count: dedup_deleted,
      owner_sample_names: (ownerTemplatesRaw || []).map((t: any) => t?.name || '').filter(Boolean).slice(0, 10),
      source_sample_names: (sourceRows || []).map((t: any) => t?.name || '').filter(Boolean).slice(0, 10),
      picked_names: (syncMode === 'all' ? sourceRows : teacherTemplatesList).map((t: any) => t?.name || '').filter(Boolean),
    }

    return NextResponse.json({ ok: true, created_count: created, updated_count: updated, rows: rows || [], debug })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
