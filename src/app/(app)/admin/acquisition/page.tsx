import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { resolveRoleByUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

type Row = { key: string; signups: number; vips: number; rate: number }

function aggregateWithVips(
  profiles: Array<{ id: string; acquisition_source: unknown }>,
  vipUserIds: Set<string>,
  byField: 'campaign' | 'source' | 'medium' | 'content',
): Row[] {
  const counters = new Map<string, { signups: number; vips: number }>()
  for (const row of profiles) {
    const src = row?.acquisition_source && typeof row.acquisition_source === 'object'
      ? row.acquisition_source as Record<string, unknown>
      : null
    if (!src) continue
    const key = String(src[byField] || '').trim() || '(sem)'
    if (!counters.has(key)) counters.set(key, { signups: 0, vips: 0 })
    const c = counters.get(key)!
    c.signups += 1
    if (vipUserIds.has(row.id)) c.vips += 1
  }
  return [...counters.entries()]
    .map(([key, c]) => ({ key, signups: c.signups, vips: c.vips, rate: c.signups > 0 ? c.vips / c.signups : 0 }))
    .sort((a, b) => b.signups - a.signups)
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

export default async function AcquisitionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) redirect('/?next=/admin/acquisition')

  const { role } = await resolveRoleByUser(user)
  if (role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()

  const [{ data: profiles }, { data: vipRows }, { data: workouts }] = await Promise.all([
    admin.from('profiles').select('id, acquisition_source').not('acquisition_source', 'is', null),
    admin.from('user_entitlements').select('user_id').eq('status', 'active'),
    admin.from('workouts').select('user_id').eq('is_template', false).limit(50000),
  ])

  const profileRows = (Array.isArray(profiles) ? profiles : []) as Array<{ id: string; acquisition_source: unknown }>
  const vipIds = new Set((Array.isArray(vipRows) ? vipRows : []).map((r) => String((r as { user_id?: string })?.user_id || '')))
  const usersWithWorkout = new Set(
    (Array.isArray(workouts) ? workouts : []).map((r) => String((r as { user_id?: string })?.user_id || '')),
  )

  const totalSignups = profileRows.length
  const totalVips = profileRows.filter((p) => vipIds.has(p.id)).length
  const totalWithWorkout = profileRows.filter((p) => usersWithWorkout.has(p.id)).length

  const bySource = aggregateWithVips(profileRows, vipIds, 'source')
  const byCampaign = aggregateWithVips(profileRows, vipIds, 'campaign')
  const byContent = aggregateWithVips(profileRows, vipIds, 'content')

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black">Aquisição</h1>
            <p className="text-sm text-neutral-400">Cohort por canal/campanha — só usuários com UTM atribuído.</p>
          </div>
          <Link href="/dashboard" className="text-sm text-yellow-500 hover:underline">← Dashboard</Link>
        </header>

        {/* Funnel */}
        <section className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-5">
          <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 mb-3">Funil geral</h2>
          {totalSignups === 0 ? (
            <p className="text-neutral-400 text-sm">Nenhum usuário com UTM atribuído ainda. Comece a impulsionar campanhas com utm_source/campaign no link da bio.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Cadastros" value={totalSignups} />
              <Stat label="Treinaram ao menos 1×" value={totalWithWorkout} sub={fmtPct(totalWithWorkout / totalSignups)} />
              <Stat label="VIPs ativos" value={totalVips} sub={fmtPct(totalVips / totalSignups)} />
            </div>
          )}
        </section>

        <Group title="Por source" rows={bySource} />
        <Group title="Por campaign" rows={byCampaign} />
        <Group title="Por content (variação A/B)" rows={byContent} />
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
      <div className="text-xs uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="text-3xl font-black text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-yellow-500 mt-1">{sub}</div>}
    </div>
  )
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-5">
      <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-neutral-500 text-sm">(sem dados)</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-800">
                <th className="py-2">Valor</th>
                <th className="py-2 text-right">Cadastros</th>
                <th className="py-2 text-right">VIPs</th>
                <th className="py-2 text-right">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-neutral-800/40">
                  <td className="py-2 font-mono text-yellow-500">{r.key}</td>
                  <td className="py-2 text-right">{r.signups}</td>
                  <td className="py-2 text-right">{r.vips}</td>
                  <td className="py-2 text-right text-neutral-300">{fmtPct(r.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
