import { listFeatureFlags } from '../src/utils/featureFlags.js'

const todayIso = new Date().toISOString().slice(0, 10)

const flags = listFeatureFlags()
const overdue = flags.filter((f) => String(f.review_at || '') && String(f.review_at) < todayIso)

process.stdout.write(`today=${todayIso}\n`)
process.stdout.write(`flags=${flags.length}\n`)

if (overdue.length) {
  process.stdout.write('overdue:\n')
  overdue.forEach((f) => {
    process.stdout.write(`- ${f.name} owner=${f.owner} review_at=${f.review_at}\n`)
  })
  process.exitCode = 2
} else {
  process.stdout.write('overdue: none\n')
}
