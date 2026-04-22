import { describe, it, expect } from 'vitest'
import { compareVersions, isNewerVersion } from '../compareVersions'

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.4', '1.4')).toBe(0)
    expect(compareVersions('1.4.0', '1.4')).toBe(0)
    expect(compareVersions('2.0.0.0', '2')).toBe(0)
  })

  it('returns 1 when first is newer (major)', () => {
    expect(compareVersions('2.0', '1.9')).toBe(1)
    expect(compareVersions('10.0', '9.99')).toBe(1)
  })

  it('returns 1 when first is newer (minor)', () => {
    expect(compareVersions('1.4', '1.3')).toBe(1)
  })

  it('returns 1 when first is newer (patch)', () => {
    expect(compareVersions('1.4.1', '1.4.0')).toBe(1)
    expect(compareVersions('1.4.1', '1.4')).toBe(1)
  })

  it('returns -1 when first is older', () => {
    expect(compareVersions('1.3', '1.4')).toBe(-1)
    expect(compareVersions('1.4', '1.4.1')).toBe(-1)
  })

  it('treats null/undefined/empty as 0.0.0', () => {
    expect(compareVersions(null, '1.4')).toBe(-1)
    expect(compareVersions(undefined, '1.0')).toBe(-1)
    expect(compareVersions('', '0.1')).toBe(-1)
    expect(compareVersions(null, null)).toBe(0)
  })

  it('strips prerelease/build suffixes', () => {
    expect(compareVersions('1.4.0-beta.1', '1.4.0')).toBe(0)
    expect(compareVersions('1.4+build.7', '1.4')).toBe(0)
  })

  it('handles multi-digit segments', () => {
    // Plain string compare would say '1.10' < '1.9'. Numeric compare says otherwise.
    expect(compareVersions('1.10', '1.9')).toBe(1)
    expect(compareVersions('1.100.0', '1.99.9')).toBe(1)
  })

  it('handles non-numeric segments as 0 (best effort)', () => {
    expect(compareVersions('1.4.x', '1.4.0')).toBe(0)
    expect(compareVersions('1.a.0', '1.0.0')).toBe(0)
  })
})

describe('isNewerVersion', () => {
  it('returns true when App Store version > current', () => {
    expect(isNewerVersion('1.4', '1.3')).toBe(true)
    expect(isNewerVersion('1.4.1', '1.4')).toBe(true)
  })

  it('returns false when versions are equal', () => {
    expect(isNewerVersion('1.4', '1.4')).toBe(false)
  })

  it('returns false when current is newer (TestFlight case)', () => {
    // If the user is running a TestFlight build ahead of the App Store,
    // don't show an "update available" banner.
    expect(isNewerVersion('1.4', '1.5.0-beta.1')).toBe(false)
    expect(isNewerVersion('1.4', '1.4.1')).toBe(false)
  })

  it('returns false when either side is unknown (fail-safe)', () => {
    expect(isNewerVersion(null, '1.4')).toBe(false)
    expect(isNewerVersion('1.4', null)).toBe(false)
    expect(isNewerVersion('', '')).toBe(false)
  })
})
