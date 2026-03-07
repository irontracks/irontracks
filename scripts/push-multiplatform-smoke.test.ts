/**
 * Smoke test: Push notification modules exist and have correct exports.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

// ─── Files must exist ──────────────────────────────────────────────────────
const pushFiles = [
    'src/lib/push/apns.ts',
    'src/lib/push/fcm.ts',
    'src/lib/push/sender.ts',
    'src/hooks/usePushNotifications.ts',
    'src/app/api/push/register/route.ts',
]
pushFiles.forEach((rel) => {
    assert.ok(fs.existsSync(path.join(repoRoot, rel)), `missing: ${rel}`)
})

// ─── APNs module must export sendPushToUsers ────────────────────────────────
const apns = fs.readFileSync(path.join(repoRoot, 'src/lib/push/apns.ts'), 'utf8')
assert.ok(apns.includes('export async function sendPushToUsers'), 'apns.ts should export sendPushToUsers')
assert.ok(apns.includes('getApnsConfig'), 'apns.ts should have getApnsConfig')
assert.ok(apns.includes('http2'), 'apns.ts should use HTTP/2')
assert.ok(apns.includes('ES256') || apns.includes('sha256'), 'apns.ts should use ES256/SHA256 signing')

// ─── FCM module must export sendFcmToUsers ──────────────────────────────────
const fcm = fs.readFileSync(path.join(repoRoot, 'src/lib/push/fcm.ts'), 'utf8')
assert.ok(fcm.includes('export async function sendFcmToUsers'), 'fcm.ts should export sendFcmToUsers')
assert.ok(fcm.includes('getFcmConfig'), 'fcm.ts should have getFcmConfig')
assert.ok(fcm.includes('fcm.googleapis.com'), 'fcm.ts should call FCM API')

// ─── Unified sender must dispatch to both ───────────────────────────────────
const sender = fs.readFileSync(path.join(repoRoot, 'src/lib/push/sender.ts'), 'utf8')
assert.ok(sender.includes('sendPushToAllPlatforms'), 'sender.ts should export sendPushToAllPlatforms')
assert.ok(sender.includes('./apns'), 'sender.ts should import from apns')
assert.ok(sender.includes('./fcm'), 'sender.ts should import from fcm')

// ─── APNs should also dispatch to FCM ───────────────────────────────────────
assert.ok(apns.includes('sendFcmToUsers') || apns.includes('./fcm'), 'apns.ts should auto-dispatch to FCM')

process.stdout.write('ok\n')
