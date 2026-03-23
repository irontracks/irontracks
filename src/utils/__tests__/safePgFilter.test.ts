import { describe, it, expect } from 'vitest'
import { safePg, safePgLike } from '@/utils/safePgFilter'

describe('safePg', () => {
  it('returns empty string for null/undefined', () => {
    expect(safePg(null)).toBe('')
    expect(safePg(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(safePg('')).toBe('')
    expect(safePg('  ')).toBe('')
  })

  it('passes through normal text', () => {
    expect(safePg('hello')).toBe('hello')
    expect(safePg('user@email.com')).toBe('user@emailcom')
  })

  it('strips commas', () => {
    expect(safePg('a,b,c')).toBe('abc')
  })

  it('strips parentheses', () => {
    expect(safePg('a(b)c')).toBe('abc')
  })

  it('strips backslashes', () => {
    expect(safePg('a\\b')).toBe('ab')
  })

  it('strips dots', () => {
    expect(safePg('a.b.c')).toBe('abc')
  })

  it('strips percent signs', () => {
    expect(safePg('%admin%')).toBe('admin')
  })

  it('strips asterisks', () => {
    expect(safePg('*wild*')).toBe('wild')
  })

  it('strips single and double quotes', () => {
    expect(safePg("it's")).toBe('its')
    expect(safePg('"quoted"')).toBe('quoted')
  })

  it('strips all dangerous chars combined', () => {
    expect(safePg('a,b(c)d\\e.f%g*h\'i"j')).toBe('abcdefghij')
  })

  it('trims whitespace', () => {
    expect(safePg('  hello  ')).toBe('hello')
  })

  it('caps at 200 characters', () => {
    const long = 'a'.repeat(300)
    expect(safePg(long)).toHaveLength(200)
  })

  it('converts numbers to string', () => {
    expect(safePg(42)).toBe('42')
  })

  it('converts booleans to string', () => {
    expect(safePg(true)).toBe('true')
    expect(safePg(false)).toBe('false')
  })
})

describe('safePgLike', () => {
  it('wraps clean value with %…%', () => {
    expect(safePgLike('admin')).toBe('%admin%')
  })

  it('returns empty string for null/undefined', () => {
    expect(safePgLike(null)).toBe('')
    expect(safePgLike(undefined)).toBe('')
  })

  it('returns empty string for whitespace-only', () => {
    expect(safePgLike('   ')).toBe('')
  })

  it('strips dangerous chars before wrapping', () => {
    expect(safePgLike('user@test.com')).toBe('%user@testcom%')
  })

  it('strips % from input but adds % wrapper', () => {
    // Input '%admin%' → safePg strips % → 'admin' → safePgLike wraps → '%admin%'
    expect(safePgLike('%admin%')).toBe('%admin%')
  })

  it('handles email addresses', () => {
    expect(safePgLike('john@example.com')).toBe('%john@examplecom%')
  })
})
