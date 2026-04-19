#!/usr/bin/env node
/**
 * Smoke test: RevenueCat webhook endpoint — validates that the production
 * deployment actually rejects invalid webhook calls. Complements the helper
 * unit tests (webhookHelpers equivalent) by exercising the real wire path.
 *
 * Attempts:
 *   1. Wrong Bearer token with a valid-shaped payload      → must NOT be 2xx
 *   2. No Authorization header with a valid-shaped payload → must NOT be 2xx
 *      (if webhookAuthKey is configured → 401; if not → reaches body parser)
 *   3. Valid-looking auth (wrong) with a malformed payload → must NOT be 2xx
 *   4. Attempt with empty event body                        → must NOT be 2xx
 *
 * All attempts use invalid credentials OR invalid payloads, so no production
 * subscription state is touched.
 *
 * Requires APP_BASE_URL (defaults to https://irontracks.com.br).
 * Skips if ENABLE_LIVE_SMOKE=false.
 */

import { config as loadEnv } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'
import crypto from 'crypto'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) loadEnv({ path: envPath })

if (process.env.ENABLE_LIVE_SMOKE === 'false') {
  process.stdout.write('skipped (ENABLE_LIVE_SMOKE=false)\n')
  process.exit(0)
}

const BASE_URL = (process.env.APP_BASE_URL || 'https://irontracks.com.br').replace(/\/$/, '')
const WEBHOOK_URL = `${BASE_URL}/api/billing/webhooks/revenuecat`

const BOGUS_USER = `smoke-test-user-${crypto.randomBytes(4).toString('hex')}`
const VALID_SHAPED_PAYLOAD = {
  api_version: '1.0',
  event: {
    type: 'INITIAL_PURCHASE',
    app_user_id: BOGUS_USER,
    product_id: 'smoke_test_nonexistent_plan',
    entitlement_ids: ['vip'],
    expiration_at_ms: Date.now() + 60_000,
  },
}

interface Attempt {
  name: string
  headers: Record<string, string>
  body: unknown
}

const attempts: Attempt[] = [
  {
    name: 'wrong Bearer token with valid-shaped payload',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer deadbeef-not-the-real-key',
    },
    body: VALID_SHAPED_PAYLOAD,
  },
  {
    name: 'no Authorization header at all',
    headers: { 'content-type': 'application/json' },
    body: VALID_SHAPED_PAYLOAD,
  },
  {
    name: 'wrong Bearer + empty body',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer deadbeef',
    },
    body: {},
  },
  {
    name: 'wrong Bearer + missing event.app_user_id',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer deadbeef',
    },
    body: { api_version: '1.0', event: { type: 'INITIAL_PURCHASE', product_id: 'foo' } },
  },
  {
    name: 'wrong Bearer + missing event.type',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer deadbeef',
    },
    body: { api_version: '1.0', event: { app_user_id: BOGUS_USER, product_id: 'foo' } },
  },
]

const failures: string[] = []

async function run(): Promise<void> {
  for (const a of attempts) {
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: a.headers,
        body: JSON.stringify(a.body),
        redirect: 'manual',
      })
      // All attempts must be rejected. 2xx would mean the endpoint accepted an
      // unauthenticated or malformed webhook and may have mutated subscription
      // state — any non-2xx fail-closed response (400, 401, 403) is acceptable.
      if (res.status >= 200 && res.status < 300) {
        let bodySnippet = ''
        try { bodySnippet = (await res.text()).slice(0, 120) } catch { /* noop */ }
        failures.push(`[FAIL] ${a.name}: accepted with ${res.status} — body: ${bodySnippet}`)
      }
    } catch (e) {
      failures.push(`[ERROR] ${a.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (failures.length > 0) {
    for (const f of failures) process.stderr.write(`${f}\n`)
    process.stderr.write(`\nwebhook endpoint: ${WEBHOOK_URL}\n`)
    process.exit(1)
  }

  process.stdout.write('ok\n')
}

run().catch((e) => {
  process.stderr.write(`unhandled error: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
