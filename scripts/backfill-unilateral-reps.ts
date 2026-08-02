/**
 * Backfill do reportMeta: reps de exercício UNILATERAL passam a somar os dois lados.
 *
 * Contexto: até jul/2026 a contagem de reps do relatório lia só um lado, enquanto
 * o volume da MESMA linha somava os dois — 3×(12+12) aparecia como 36 em vez de 72.
 * O `reportMeta` é um snapshot gravado no finish, então treinos antigos não se
 * corrigem sozinhos. Este script regrava só esse trecho.
 *
 * Patch CIRÚRGICO — toca apenas `reportMeta.exercises[].repsDone`, `.delta.reps` e
 * `reportMeta.totals.reps`. O resto do JSON de `workouts.notes` (logs, pesos,
 * check-ins) é reescrito idêntico.
 *
 * Uso:
 *   npx tsx scripts/backfill-unilateral-reps.ts --user <uuid> [--limit N] [--only <workoutId>] [--apply]
 * Sem --apply é DRY-RUN: só mostra o diff, não escreve nada.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { setTotalReps } from '../src/utils/report/setVolume'

const env = (() => {
  const raw = readFileSync(`${process.cwd()}/.env.local`, 'utf8')
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
  }
  return out
})()

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const args = process.argv.slice(2)
const argOf = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const APPLY = args.includes('--apply')
const USER_ID = argOf('--user')
const ONLY = argOf('--only')
const LIMIT = Number(argOf('--limit') ?? 500)

const isRec = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const isWorking = (log: Record<string, unknown>) => {
  const doneRaw = log.done ?? log.isDone ?? log.completed ?? null
  const done = doneRaw == null ? true : doneRaw === true || String(doneRaw ?? '').toLowerCase() === 'true'
  if (!done) return false
  const t = log.set_type ?? log.setType
  if (t === 'warmup' || t === 'feeler') return false
  if (!t && (log.is_warmup || log.isWarmup)) return false
  return true
}

/** Reps totais do exercício (por índice), somando os dois lados no unilateral.
 *  `null` = nada a corrigir aqui (exercício sem unilateral ou com método especial). */
const repsForExercise = (logs: Record<string, unknown>, exIdx: number): number | null => {
  let total = 0
  let hasUnilateral = false
  for (const [key, value] of Object.entries(logs)) {
    if (Number(String(key).split('-')[0]) !== exIdx) continue
    if (!isRec(value)) continue
    if (!isWorking(value)) continue
    // Métodos com contagem própria no reportMetrics ficam de fora deste patch.
    if (value.cluster || value.drop_set || value.stripping || value.wave) return null
    const l = Number(String(value.L_reps ?? '').replace(',', '.')) || 0
    const r = Number(String(value.R_reps ?? '').replace(',', '.')) || 0
    if (l > 0 || r > 0) hasUnilateral = true
    total += setTotalReps(value)
  }
  return hasUnilateral ? total : null
}

async function main() {
  if (!USER_ID) throw new Error('faltou --user <uuid>')

  let q = supabase
    .from('workouts')
    .select('id, completed_at, notes')
    .eq('user_id', USER_ID)
    .eq('is_template', false)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(LIMIT)
  if (ONLY) q = q.eq('id', ONLY)

  const { data, error } = await q
  if (error) throw error
  // A query traz os mais RECENTES primeiro (por causa do --limit), mas o
  // delta.reps compara com a sessão ANTERIOR: processar nessa ordem compararia
  // com a sessão seguinte. Reordena em ordem cronológica antes do loop.
  const rows = [...(data ?? [])].sort((a, b) =>
    String(a.completed_at ?? '').localeCompare(String(b.completed_at ?? '')))

  const prevRepsByName = new Map<string, number>()
  let changed = 0
  const diag = { json: 0, comMeta: 0, comUnilateral: 0 }

  for (const row of rows) {
    const raw = String(row.notes ?? '')
    if (!raw.trim().startsWith('{')) continue
    let session: Record<string, unknown>
    try { session = JSON.parse(raw) as Record<string, unknown> } catch { continue }
    diag.json++
    const meta = isRec(session.reportMeta) ? session.reportMeta : null
    if (!meta) continue
    diag.comMeta++
    if (Object.values(isRec(session.logs) ? session.logs : {}).some((l) => isRec(l) && (l.L_reps != null || l.R_reps != null))) diag.comUnilateral++
    const metaExercises = Array.isArray(meta.exercises) ? (meta.exercises as Record<string, unknown>[]) : []
    if (metaExercises.length === 0) continue
    const logs = isRec(session.logs) ? session.logs : {}
    const exercises = Array.isArray(session.exercises) ? (session.exercises as Record<string, unknown>[]) : []

    const diffs: string[] = []
    let totalReps = 0
    for (const m of metaExercises) {
      const name = String(m.name ?? '')
      const exIdx = exercises.findIndex((e) => String(e?.name ?? '') === name)
      const before = Number(m.repsDone ?? 0)
      let after = before
      if (exIdx >= 0) {
        const recomputed = repsForExercise(logs, exIdx)
        if (recomputed != null && recomputed !== before) {
          after = recomputed
          diffs.push(`    ${name}: ${before} → ${after}`)
        }
      }
      // Δ reps vs. a última vez que ESTE exercício apareceu (já na régua nova).
      const prev = prevRepsByName.get(name)
      const delta = isRec(m.delta) ? m.delta : null
      if (delta && after !== before) {
        // Recalcula na régua nova. Sem ocorrência anterior dentro da janela, o
        // valor antigo estaria na régua velha (metade) — melhor ficar sem delta.
        delta.reps = prev != null ? Math.round((after - prev) * 10) / 10 : null
      }
      m.repsDone = after
      prevRepsByName.set(name, after)
      totalReps += after
    }

    if (diffs.length === 0) continue
    const totals = isRec(meta.totals) ? meta.totals : null
    // O campo do total é `repsDone` (ver ReportMetrics.totals) — escrever `reps`
    // criaria um campo fantasma e deixaria o total real desatualizado.
    const totalsBefore = totals && totals.repsDone != null ? Number(totals.repsDone) : null
    if (totals) totals.repsDone = totalReps

    changed++
    console.log(`\n${String(row.completed_at ?? '').slice(0, 10)}  ${String(session.workoutTitle ?? '')}  [${row.id}]`)
    console.log(diffs.join('\n'))
    if (totalsBefore != null) console.log(`    TOTAL: ${totalsBefore} → ${totalReps}`)

    if (APPLY) {
      const { error: upErr } = await supabase
        .from('workouts')
        .update({ notes: JSON.stringify(session) })
        .eq('id', row.id)
      if (upErr) throw new Error(`falha ao gravar ${row.id}: ${upErr.message}`)
      console.log('    ✔ gravado')
    }
  }

  console.log(`\n${changed} sessão(ões) ${APPLY ? 'atualizada(s)' : 'a atualizar (dry-run)'} de ${data?.length ?? 0} lidas.`)
  console.log(`   diagnóstico: ${diag.json} com JSON, ${diag.comMeta} com reportMeta, ${diag.comUnilateral} com séries unilaterais`)
}

main().catch((e) => { console.error(e); process.exit(1) })
