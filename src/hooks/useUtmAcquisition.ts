'use client'

import { useEffect } from 'react'

/**
 * UTM first-touch attribution.
 *
 * On every mount:
 *   1. If the URL has any utm_* params and localStorage has none yet, capture
 *      them (first-touch wins). Also stores referrer + landing path.
 *   2. If we have a userId AND localStorage has captured UTMs, POST them to
 *      /api/profiles/acquisition. The server only writes if the profile
 *      hasn't been attributed yet, so calling this multiple times is safe.
 *
 * Storage key is versioned so we can change the schema without breaking
 * captures already in flight.
 */
const STORAGE_KEY = 'irontracks.utm.v1'
const POST_FLAG_PREFIX = 'irontracks.utm.posted.v1.'

const UTM_FIELDS = ['source', 'medium', 'campaign', 'content', 'term'] as const

type CapturedUtm = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  gclid?: string
  fbclid?: string
  referrer?: string
  landing_path?: string
}

function readFromUrl(): CapturedUtm | null {
  if (typeof window === 'undefined') return null
  try {
    const params = new URL(window.location.href).searchParams
    const out: CapturedUtm = {}
    let any = false
    for (const f of UTM_FIELDS) {
      const v = params.get(`utm_${f}`)?.trim()
      if (v) { out[f] = v.slice(0, 120); any = true }
    }
    // Google Ads click ID + Facebook/Instagram click ID — these come without
    // utm_* prefixes and are valuable for matching back to ad platforms.
    const gclid = params.get('gclid')?.trim()
    if (gclid) { out.gclid = gclid.slice(0, 120); any = true }
    const fbclid = params.get('fbclid')?.trim()
    if (fbclid) { out.fbclid = fbclid.slice(0, 120); any = true }
    if (!any) return null
    const ref = String(document.referrer || '').trim()
    if (ref) out.referrer = ref.slice(0, 255)
    out.landing_path = window.location.pathname.slice(0, 255)
    return out
  } catch {
    return null
  }
}

function readFromStorage(): CapturedUtm | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function saveToStorage(utm: CapturedUtm): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(utm))
  } catch { /* quota / private mode — ignore */ }
}

export function useUtmAcquisition(userId?: string | null): void {
  useEffect(() => {
    // Step 1: capture from URL if storage is empty.
    if (!readFromStorage()) {
      const fresh = readFromUrl()
      if (fresh) saveToStorage(fresh)
    }
  }, [])

  useEffect(() => {
    const uid = userId ? String(userId).trim() : ''
    if (!uid) return

    const utm = readFromStorage()
    if (!utm || Object.keys(utm).length === 0) return

    const flagKey = POST_FLAG_PREFIX + uid
    try {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem(flagKey) === '1') return
    } catch { /* ignore */ }

    fetch('/api/profiles/acquisition', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(utm),
    })
      .then(() => {
        try {
          if (typeof window !== 'undefined') window.sessionStorage.setItem(flagKey, '1')
        } catch { /* ignore */ }
      })
      .catch(() => { /* fire-and-forget */ })
  }, [userId])
}
