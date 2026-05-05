/**
 * APNs JWT (ES256) — shared between regular pushes and Live Activity updates.
 *
 * Apple rejects a second JWT with the same `iss` issued within 60 min, so we
 * cache for 50 min behind a mutex to prevent concurrent serverless invocations
 * from generating duplicates.
 */
import * as crypto from 'crypto'
import { env } from '@/utils/env'
import { logError } from '@/lib/logger'

export interface ApnsConfig {
  keyId: string
  teamId: string
  keyP8: string
  bundleId: string
}

export function getApnsConfig(): ApnsConfig | null {
  const keyId = env.apns.keyId.trim()
  const teamId = env.apns.teamId.trim()
  const keyP8 = env.apns.keyP8.trim()
  const bundleId = env.apns.bundleId.trim()
  if (!keyId || !teamId || !keyP8) return null
  return { keyId, teamId, keyP8, bundleId }
}

let cachedJwt: { token: string; expiresAt: number } | null = null
let jwtRefreshInFlight: Promise<string> | null = null

export async function getJwt(cfg: ApnsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedJwt && cachedJwt.expiresAt > now + 60) return cachedJwt.token
  if (jwtRefreshInFlight) return jwtRefreshInFlight

  const doRefresh = async (): Promise<string> => {
    try {
      const issuedAt = Math.floor(Date.now() / 1000)
      const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: cfg.keyId })).toString('base64url')
      const payload = Buffer.from(JSON.stringify({ iss: cfg.teamId, iat: issuedAt })).toString('base64url')
      const unsigned = `${header}.${payload}`

      const pem = cfg.keyP8.replace(/\\n/g, '\n')
      const signature = crypto.sign('sha256', Buffer.from(unsigned), {
        key: pem,
        dsaEncoding: 'ieee-p1363',
      })

      const token = `${unsigned}.${signature.toString('base64url')}`
      cachedJwt = { token, expiresAt: issuedAt + 50 * 60 }
      return token
    } catch (e) {
      logError('apns-jwt', '[APNs] JWT generation failed', e)
      throw e
    }
  }

  jwtRefreshInFlight = doRefresh().finally(() => { jwtRefreshInFlight = null })
  return jwtRefreshInFlight
}

/** Test-only escape hatch — invalidates the cached JWT. Production code should
 *  rely on the natural expiry. */
export function _invalidateJwtCacheForTesting(): void {
  cachedJwt = null
}
