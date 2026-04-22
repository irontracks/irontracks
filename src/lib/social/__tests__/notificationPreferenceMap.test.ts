import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TYPE_TO_PREFERENCE, preferenceKeyForType } from '../notifyFollowers'
import { DEFAULT_USER_SETTINGS } from '@/schemas/settings'

describe('NOTIFICATION_TYPE_TO_PREFERENCE', () => {
  it('maps every documented notification type to a known preference key', () => {
    const knownPrefKeys = Object.keys(DEFAULT_USER_SETTINGS)
    for (const [type, prefKey] of Object.entries(NOTIFICATION_TYPE_TO_PREFERENCE)) {
      expect(
        knownPrefKeys.includes(prefKey),
        `type "${type}" maps to unknown pref "${prefKey}" \u2014 add it to UserSettingsSchema`,
      ).toBe(true)
    }
  })

  it('has no gaps between schema toggles and server-emitted types', () => {
    // Any pref that starts with "notify" should have at least ONE type mapped,
    // otherwise the toggle is dead UI.
    const notifyPrefs = Object.keys(DEFAULT_USER_SETTINGS).filter((k) => k.startsWith('notify'))
    const mappedPrefs = new Set(Object.values(NOTIFICATION_TYPE_TO_PREFERENCE))
    const orphans = notifyPrefs.filter((k) => !mappedPrefs.has(k))
    expect(orphans, `UI toggles without any mapped type: ${orphans.join(', ')}`).toEqual([])
  })
})

describe('preferenceKeyForType', () => {
  it('returns the mapped key for known types', () => {
    expect(preferenceKeyForType('friend_pr')).toBe('notifyFriendPRs')
    expect(preferenceKeyForType('message')).toBe('notifyDirectMessages')
    expect(preferenceKeyForType('team_invite')).toBe('notifyTeamInvites')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(preferenceKeyForType('  Friend_PR  ')).toBe('notifyFriendPRs')
    expect(preferenceKeyForType('MESSAGE')).toBe('notifyDirectMessages')
  })

  it('returns null for unknown types (fail open)', () => {
    expect(preferenceKeyForType('system_debug_event')).toBeNull()
    expect(preferenceKeyForType(null)).toBeNull()
    expect(preferenceKeyForType('')).toBeNull()
  })

  it('handles legacy type names via the same map', () => {
    // workout_finished is the pre-rename version; both should map to the
    // same "friend workout events" pref.
    expect(preferenceKeyForType('workout_finished')).toBe('notifyFriendWorkoutEvents')
    expect(preferenceKeyForType('workout_finish')).toBe('notifyFriendWorkoutEvents')
  })
})
