import { listFeatureFlags } from '../src/utils/featureFlags'

const todayIso = new Date().toISOString().slice(0, 10)

const flags = listFeatureFlags()
const overdue = flags.filter((f) => String((f as any).review_at || '') && String((f as any).review_at) < todayIso)

process.stdout.write(`today=${todayIso}\n`)
process.stdout.write(`flags=${flags.length}\n`)

if (overdue.length) {
  process.stdout.write('overdue:\n')
  overdue.forEach((f: any) => {
    process.stdout.write(`- ${f.name} owner=${f.owner} review_at=${f.review_at}\n`)
  })
  process.exitCode = 2
} else {
  process.stdout.write('overdue: none\n')
}

