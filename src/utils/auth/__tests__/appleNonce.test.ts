import { describe, it, expect } from 'vitest'
import { sha256Hex } from '../appleNonce'

describe('sha256Hex (Apple nonce)', () => {
  it('produz o SHA-256 hex conhecido de "abc"', async () => {
    // vetor de teste oficial do SHA-256
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('é determinístico e difere por input', async () => {
    const a = await sha256Hex('nonce-1')
    const b = await sha256Hex('nonce-1')
    const c = await sha256Hex('nonce-2')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toHaveLength(64)
  })
})
