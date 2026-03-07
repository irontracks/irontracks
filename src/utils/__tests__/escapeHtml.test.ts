import { describe, it, expect } from 'vitest'
import { escapeHtml } from '@/utils/escapeHtml'

describe('escapeHtml', () => {
  it('escapes &', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('escapes <', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes >', () => {
    expect(escapeHtml('5 > 3')).toBe('5 &gt; 3')
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;')
  })

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe('it&#39;s')
  })

  it('escapes a full XSS payload', () => {
    const xss = `<img src="x" onerror='alert(1)' />`
    const out = escapeHtml(xss)
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
    expect(out).not.toContain('"')
    expect(out).not.toContain("'")
  })

  it('returns empty string for null and undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('coerces numbers and booleans to string', () => {
    expect(escapeHtml(42)).toBe('42')
    expect(escapeHtml(true)).toBe('true')
  })

  it('returns clean text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World')
    expect(escapeHtml('Treino A')).toBe('Treino A')
  })
})
