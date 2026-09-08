import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

describe('mapa 3D respeita CSP sem WebAssembly', () => {
  it('importa o substituto sem tentar compilar WASM', async () => {
    const instantiate = vi.spyOn(WebAssembly, 'instantiate').mockImplementation(() => { throw new Error('CSP bloqueia WASM') })
    try {
      const { MeshoptDecoder } = await import('../meshoptUnavailable')
      expect(MeshoptDecoder.supported).toBe(false)
      expect(instantiate).not.toHaveBeenCalled()
    } finally { instantiate.mockRestore() }
  })
  it('o modelo não exige Meshopt nem Draco', () => {
    const glb = readFileSync('public/muscle-map-3d/v1/manequim-original-3d.glb')
    const manifest = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString())
    expect(manifest.extensionsUsed || []).not.toContain('EXT_meshopt_compression')
    expect(manifest.extensionsUsed || []).not.toContain('KHR_draco_mesh_compression')
    expect(manifest.images).toHaveLength(1)
    expect(manifest.images[0].uri).toBe('reference-atlas.png')
    expect(manifest.images[0].bufferView).toBeUndefined()
  })
  it('a configuração substitui apenas o decoder opcional', () => {
    const config = readFileSync('next.config.ts', 'utf8')
    expect(config).toContain("config.resolve.alias['three/examples/jsm/libs/meshopt_decoder.module.js$']")
    expect(config).toContain("require.resolve('./src/lib/muscleMap/meshoptUnavailable.ts')")
  })
})
