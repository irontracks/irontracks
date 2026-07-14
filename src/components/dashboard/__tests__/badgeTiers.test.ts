import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Source-guard: os tiers de medalha de volume vivem em 3 lugares que PRECISAM
// ficar em sincronia (senão uma medalha notifica mas não aparece, ou aparece sem
// arte). Se adicionar um tier novo, adicione nos 3 + o PNG — ou este teste falha.
const root = process.cwd()
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

const VOLUME_TIERS = ['vol_5k', 'vol_20k', 'vol_50k', 'vol_100k', 'vol_500k', 'vol_1m', 'vol_2m', 'vol_5m']

describe('medalhas de volume — consistência de tiers (guard #8)', () => {
  it('lista de notificação (workoutNotifications) cobre todos os tiers', () => {
    const src = read('src/lib/social/workoutNotifications.ts')
    for (const id of VOLUME_TIERS) expect(src.includes(`'${id}'`), id).toBe(true)
  })

  it('lista de exibição (workout-analytics-actions) cobre todos os tiers', () => {
    const src = read('src/actions/workout-analytics-actions.ts')
    for (const id of VOLUME_TIERS) expect(src.includes(`'${id}'`), id).toBe(true)
  })

  it('mapa de imagens (BadgesInline) tem arte distinta pra cada tier', () => {
    const src = read('src/components/dashboard/BadgesInline.tsx')
    for (const id of VOLUME_TIERS) expect(src.includes(`${id}: { src: '/badge-vol-`), id).toBe(true)
  })

  it('cada tier tem o PNG correspondente em public/', () => {
    for (const id of VOLUME_TIERS) {
      const file = `public/badge-vol-${id.replace('vol_', '')}.png`
      expect(existsSync(resolve(root, file)), file).toBe(true)
    }
  })
})
