import { describe, it, expect } from 'vitest'
import {
  isKillSwitchOn,
  isFeatureEnabled,
  listFeatureFlags,
} from '@/utils/featureFlags'

// ────────────────────────────────────────────────────────────────────────────
// isKillSwitchOn
// ────────────────────────────────────────────────────────────────────────────
describe('isKillSwitchOn', () => {
  it('returns true when featuresKillSwitch is true', () => {
    expect(isKillSwitchOn({ featuresKillSwitch: true })).toBe(true)
  })

  it('returns false when featuresKillSwitch is false', () => {
    expect(isKillSwitchOn({ featuresKillSwitch: false })).toBe(false)
  })

  it('returns false when featuresKillSwitch is absent', () => {
    expect(isKillSwitchOn({})).toBe(false)
  })

  it('returns false for null/undefined settings', () => {
    expect(isKillSwitchOn(null)).toBe(false)
    expect(isKillSwitchOn(undefined)).toBe(false)
  })

  it('returns false for non-object settings', () => {
    expect(isKillSwitchOn('string')).toBe(false)
    expect(isKillSwitchOn(42)).toBe(false)
    expect(isKillSwitchOn([])).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// isFeatureEnabled
// ────────────────────────────────────────────────────────────────────────────
describe('isFeatureEnabled', () => {
  const key = 'anyFlag'

  describe('user settings only', () => {
    it('returns true when flag is true in settings', () => {
      expect(isFeatureEnabled({ [key]: true }, key)).toBe(true)
    })

    it('returns false when flag is false in settings', () => {
      expect(isFeatureEnabled({ [key]: false }, key)).toBe(false)
    })

    it('returns false when flag is absent', () => {
      expect(isFeatureEnabled({}, key)).toBe(false)
    })

    it('returns false when kill switch is on', () => {
      expect(isFeatureEnabled({ [key]: true, featuresKillSwitch: true }, key)).toBe(false)
    })
  })

  describe('global flags take precedence', () => {
    it('uses global flag when present (true)', () => {
      expect(isFeatureEnabled({ [key]: false }, key, { [key]: true })).toBe(true)
    })

    it('uses global flag when present (false)', () => {
      expect(isFeatureEnabled({ [key]: true }, key, { [key]: false })).toBe(false)
    })

    it('falls back to user settings when key not in global', () => {
      expect(isFeatureEnabled({ [key]: true }, key, {})).toBe(true)
    })

    it('global kill switch overrides global true', () => {
      expect(
        isFeatureEnabled({}, key, { [key]: true, featuresKillSwitch: true })
      ).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('handles null settings gracefully', () => {
      expect(isFeatureEnabled(null, key)).toBe(false)
    })

    it('handles undefined globalFlags', () => {
      expect(isFeatureEnabled({ [key]: true }, key, undefined)).toBe(true)
    })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// listFeatureFlags
// ────────────────────────────────────────────────────────────────────────────
describe('listFeatureFlags', () => {
  it('returns an empty array (no feature flags currently defined)', () => {
    expect(listFeatureFlags()).toEqual([])
  })
})
