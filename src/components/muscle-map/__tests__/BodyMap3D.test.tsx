import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/components/muscle-map/BodyMap3D.tsx'), 'utf8')

describe('gestos do mapa muscular 3D', () => {
  it('reserva todo gesto sobre o manequim para rotação, zoom e reposicionamento', () => {
    expect(source).toContain('touch-action:none')
    expect(source).toContain('overscroll-behavior:none')
    expect(source).not.toContain("setAttribute('disable-pan'")
    expect(source).not.toContain("setAttribute('touch-action', 'pan-y')")
  })

  it('orienta o reposicionamento e restaura órbita e foco ao reenquadrar', () => {
    expect(source).toContain('2 dedos aproximam e movem')
    expect(source).toContain('viewer.getCameraTarget()')
    expect(source).toContain('viewer.getCameraOrbit()')
    expect(source).toContain('await ready.viewer.updateComplete')
    expect(source).toContain('ready.initialCamera.target')
    expect(source).toContain('ready.viewer.jumpCameraToGoal()')
    expect(source).toContain('void resetCamera(ready, view)')
  })
})
