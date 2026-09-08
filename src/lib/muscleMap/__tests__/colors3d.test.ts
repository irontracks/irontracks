import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { muscleLayers3d, MUSCLE_3D_ROOT } from '../colors3d'
import { FRONT_OVERLAYS, BACK_OVERLAYS, ratioToOpacity } from '../overlays'

describe('intensidades do mapa 3D', () => {
  it('não pinta músculos sem treino, mesmo selecionados', () => {
    expect(muscleLayers3d({ chest: { ratio: 0 } }, 'chest')).toEqual([])
  })
  it.each([0.01, 0.1, 0.5, 1, 1.5])('preserva a opacidade 2D para ratio %s', ratio => {
    expect(muscleLayers3d({ chest: { ratio } })[0].opacity).toBe(ratioToOpacity(ratio))
    expect(muscleLayers3d({ chest: { ratio } }, 'chest')[0].opacity).toBe(ratioToOpacity(ratio, true))
  })
  it('não soma duas vezes o ombro compartilhado', () => {
    const layers = muscleLayers3d({ delts_front: { ratio: 0.2 }, delts_side: { ratio: 0.8 } })
    expect(layers).toHaveLength(1)
    expect(layers[0].opacity).toBe(ratioToOpacity(0.8))
  })
  it('mantém frente e costas simultaneamente, inclusive tríceps e panturrilhas', () => {
    const files = muscleLayers3d({ chest: { ratio: 1 }, triceps: { ratio: 1 }, calves: { ratio: 1 } }).map(layer => layer.file)
    expect(files).toEqual(['front-chest.png', 'front-calves.png', 'back-triceps.png', 'back-calves.png'])
  })
  it('retira as camadas quando o novo período não possui treino', () => {
    expect(muscleLayers3d({ lats: { ratio: 1 } })).toHaveLength(1)
    expect(muscleLayers3d({})).toEqual([])
  })
  it('entrega todas as texturas sem precisar de WebAssembly ou CDN', () => {
    const root = `public${MUSCLE_3D_ROOT}`
    for (const { file } of [...FRONT_OVERLAYS, ...BACK_OVERLAYS]) {
      const bytes = readFileSync(`${root}muscle-atlases/${file}`)
      expect(bytes.readUInt32BE(16)).toBe(2048)
      expect(bytes.readUInt32BE(20)).toBe(2048)
    }
    for (const file of ['manequim-original-3d.glb', 'reference-atlas.png']) expect(existsSync(root + file)).toBe(true)
    const glb = readFileSync(root + 'manequim-original-3d.glb')
    const manifest = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString())
    expect(manifest.extensionsRequired || []).not.toContain('KHR_draco_mesh_compression')
  })
})
