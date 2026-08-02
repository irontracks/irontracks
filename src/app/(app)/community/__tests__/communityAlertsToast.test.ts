import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guard (auditoria UX/perf): os erros de follow/cancel/unfollow do community devem sair
 * por toast não-bloqueante (notifyError), NÃO por window.alert cru (trava a main thread).
 */
describe('community — erros via toast, não window.alert', () => {
  const hook = readFileSync('src/app/(app)/community/useCommunityData.ts', 'utf8')
  const client = readFileSync('src/app/(app)/community/CommunityClient.tsx', 'utf8')
  it('o hook não usa window.alert e aceita notifyError', () => {
    expect(hook).not.toMatch(/window\.alert/)
    expect(hook).toMatch(/useCommunityData\(notifyError\?: \(msg: string\) => void\)/)
    expect(hook).toMatch(/notifyError\?\.\(/)
  })
  it('o client injeta notifyError (toast) no hook', () => {
    expect(client).toMatch(/useCommunityData\(notifyError\)/)
    expect(client).toMatch(/const notifyError = useCallback/)
  })
})
