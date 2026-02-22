import { describe, it, expect } from 'vitest'
import { classifyError, hashString } from '@/utils/errorClassification'

describe('errorClassification', () => {
  it('classifies chunk errors as fatal', () => {
    const res = classifyError('ChunkLoadError: Loading chunk 123 failed', 'window')
    expect(res.category).toBe('chunk')
    expect(res.severity).toBe('fatal')
  })

  it('classifies network errors as warn', () => {
    const res = classifyError('Failed to fetch', 'window')
    expect(res.category).toBe('network')
    expect(res.severity).toBe('warn')
  })

  it('classifies auth errors', () => {
    const res = classifyError('Unauthorized request', 'api')
    expect(res.category).toBe('auth')
    expect(res.severity).toBe('error')
  })

  it('escalates errorboundary to fatal', () => {
    const res = classifyError('Error occurred', 'errorboundary')
    expect(res.severity).toBe('fatal')
  })

  it('hashString is deterministic', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
  })
})
