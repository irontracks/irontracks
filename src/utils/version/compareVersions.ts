/**
 * Compare two dotted version strings numerically.
 *
 * Used by the "app update available" check to decide whether the App Store
 * version is newer than the running build.
 *
 *   compareVersions('1.4', '1.3')   →  1  (first is newer)
 *   compareVersions('1.4', '1.4.1') → -1  (first is older)
 *   compareVersions('1.4', '1.4')   →  0  (equal)
 *   compareVersions('2.0', '1.9.9') →  1
 *   compareVersions('1.4.0', '1.4') →  0  (trailing zeros ignored)
 *
 * Rules:
 *   - Each segment must be a non-negative integer. Non-numeric segments are
 *     treated as 0 so that "1.4-beta" still works best-effort.
 *   - Missing trailing segments are treated as 0, so "1.4" === "1.4.0".
 *   - null/undefined/empty strings are treated as "0.0.0" — always older than
 *     any real version. This keeps the App Store check fail-open (if one side
 *     is unknown, we never show a false "please update" banner).
 */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const partsA = parseVersion(a)
  const partsB = parseVersion(b)
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0
    const numB = partsB[i] ?? 0
    if (numA > numB) return 1
    if (numA < numB) return -1
  }
  return 0
}

/** True when `candidate` represents a strictly newer version than `current`. */
export function isNewerVersion(candidate: string | null | undefined, current: string | null | undefined): boolean {
  if (!candidate) return false
  // Empty/unknown current → still don't flag anything (avoid false alarms)
  if (!current) return false
  return compareVersions(candidate, current) > 0
}

function parseVersion(raw: string | null | undefined): number[] {
  const s = String(raw ?? '').trim()
  if (!s) return [0]
  // Strip any prerelease / build suffix ("1.4-beta.1", "1.4+build.7") before splitting
  const core = s.split(/[-+]/)[0] || ''
  return core.split('.').map((seg) => {
    const n = Number.parseInt(seg, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  })
}
