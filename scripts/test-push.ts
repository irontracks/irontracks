import * as fs from 'fs'
import * as path from 'path'

async function main() {
  for (const envFile of ['.env.local', '/tmp/prod-env.local']) {
    try {
      const lines = fs.readFileSync(path.resolve(process.cwd(), envFile), 'utf-8').split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq < 0) continue
        const key = trimmed.slice(0, eq).trim()
        const raw = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
        const val = raw.replace(/\\n/g, '\n')
        // Trim trailing newlines for non-PEM values
        process.env[key] = val.startsWith('-----') ? val : val.trim()
      }
    } catch { /* file not found */ }
  }

  // Force production APNs
  process.env.APNS_PRODUCTION = 'true'

  const { sendPushToAllPlatforms } = await import('../src/lib/push/sender.js')
  const userId = 'd04bfcef-54ea-4360-9e3d-e174a9ace503'
  console.log('Sending test push...')
  const results = await sendPushToAllPlatforms(
    [userId],
    'Teste de notificação',
    'Push notifications funcionando!',
    { type: 'test', link: '/dashboard' },
    { bypassMasterSwitch: true }
  )
  console.log('Results:', JSON.stringify(results, null, 2))
}

main().catch(console.error)
