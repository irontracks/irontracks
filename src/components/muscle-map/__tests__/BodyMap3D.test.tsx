import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/components/muscle-map/BodyMap3D.tsx'), 'utf8')

describe('gestos do mapa muscular 3D', () => {
  it('reserva todo gesto sobre o manequim para rotação e zoom', () => {
    expect(source).toContain('touch-action:none')
    expect(source).toContain('overscroll-behavior:none')
    expect(source).not.toContain("setAttribute('touch-action', 'pan-y')")
  })
})
