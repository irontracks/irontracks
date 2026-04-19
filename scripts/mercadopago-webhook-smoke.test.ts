#!/usr/bin/env node
/**
 * Smoke test: MercadoPago webhook endpoint — validates that the production
 * deployment actually rejects invalid webhook calls (signature missing,
 * signature tampered, timestamp expired, bad body). Complements the pure
 * unit test in webhookHelpers.test.ts by exercising the real wire path
 * end-to-end — signature check must be reachable and return the right
 * status codes.
 *
 * All attempts use invalid signatures, so nothing touches the database.
 *
 * Requires APP_BASE_URL or defaults to https://irontracks.com.br.
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
const WEBHOOK_URL = `${BASE_URL}/api/billing/webhooks/mercadopago`

interface Attempt {
  name: string
  headers: Record<string, string>
  body: unknown
  expectStatus: number | number[]
}

const nowSec = Math.floor(Date.now() / 1000)
const oldSec = nowSec - 60 * 60 // 1h ago, outside tolerance
const BOGUS_DATA_ID = 'smoke-test-bogus-id-' + crypto.randomBytes(4).toString('hex')

const makeSig = (ts: number, v1: string) => `ts=${ts},v1=${v1}`

const attempts: Attempt[] = [
  {
    name: 'missing x-signature and x-request-id → 400',
    headers: { 'content-type': 'application/json' },
    body: { type: 'payment', data: { id: BOGUS_DATA_ID } },
    expectStatus: 400,
  },
  {
    name: 'missing x-request-id → 400',
    headers: {
      'content-type': 'application/json',
      'x-signature': makeSig(nowSec, 'deadbeef'),
    },
    body: { type: 'payment', data: { id: BOGUS_DATA_ID } },
    expectStatus: 400,
  },
  {
    name: 'malformed signature (no ts/v1) → 401',
    headers: {
      'content-type': 'application/json',
      'x-signature': 'garbage',
      'x-request-id': 'smoke-req-1',
    },
    body: { type: 'payment', data: { id: BOGUS_DATA_ID } },
    expectStatus: 401,
  },
  {
    name: 'valid structure, wrong hmac → 401',
    headers: {
      'content-type': 'application/json',
      'x-signature': makeSig(nowSec, 'a'.repeat(64)),
      'x-request-id': 'smoke-req-2',
    },
    body: { type: 'payment', data: { id: BOGUS_DATA_ID } },
    expectStatus: 401,
  },
  {
    name: 'expired timestamp (>5 min old) → 401',
    headers: {
      'content-type': 'application/json',
      'x-signature': makeSig(oldSec, 'b'.repeat(64)),
      'x-request-id': 'smoke-req-3',
    },
    body: { type: 'payment', data: { id: BOGUS_DATA_ID } },
    expectStatus: 401,
  },
  {
    name: 'missing data.id → 400',
    headers: {
      'content-type': 'application/json',
      'x-signature': makeSig(nowSec, 'c'.repeat(64)),
      'x-request-id': 'smoke-req-4',
    },
    body: { type: 'payment' },
    expectStatus: 400,
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
      const expected = Array.isArray(a.expectStatus) ? a.expectStatus : [a.expectStatus]
      if (!expected.includes(res.status)) {
        failures.push(`[FAIL] ${a.name}: got ${res.status}, expected ${expected.join('|')}`)
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
