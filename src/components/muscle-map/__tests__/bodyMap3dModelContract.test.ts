import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'

/**
 * O 3D casa malha com grupo POR NOME. Se o pipeline do Blender renomear,
 * remover ou deixar de exportar um grupo, o app não quebra: ele simplesmente
 * para de pintar aquele músculo, em silêncio — o pior modo de falha possível,
 * porque a tela continua bonita e mentindo sobre o volume da semana.
 *
 * Este guard lê o GLB de verdade e cobra os 15 grupos + o manequim.
 */

const GLB = path.join(process.cwd(), 'public/models/body-map.glb')

/** Lê o chunk JSON de um .glb (header de 12 bytes + chunk header de 8). */
function readGlbJson(file: string) {
  const buf = fs.readFileSync(file)
  expect(buf.subarray(0, 4).toString('utf8')).toBe('glTF')
  const jsonLength = buf.readUInt32LE(12)
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
}

describe('contrato do modelo 3D do mapa muscular', () => {
  it('o GLB existe e está versionado', () => {
    expect(fs.existsSync(GLB)).toBe(true)
  })

  it('exporta uma malha para cada grupo muscular do app', () => {
    const gltf = readGlbJson(GLB)
    const names = new Set<string>((gltf.meshes || []).map((m: { name: string }) => m.name))
    const missing = MUSCLE_GROUPS.map((g) => g.id).filter((id) => !names.has(id))
    expect(missing).toEqual([])
  })

  it('exporta o manequim base', () => {
    const gltf = readGlbJson(GLB)
    const names = new Set<string>((gltf.meshes || []).map((m: { name: string }) => m.name))
    expect(names.has('body')).toBe(true)
  })

  it('usa compressão Draco — sem ela o arquivo multiplica de tamanho', () => {
    const gltf = readGlbJson(GLB)
    expect(gltf.extensionsUsed || []).toContain('KHR_draco_mesh_compression')
  })

  it('cabe no orçamento de download do app nativo', () => {
    // Teto folgado sobre o tamanho medido (0,35 MB). O app nativo carrega o
    // front do servidor a cada boot; modelo que engorda sem ninguém olhar vira
    // segundo de espera no 4G da academia.
    const mb = fs.statSync(GLB).size / 1048576
    expect(mb).toBeLessThan(1.5)
  })

  it('o decoder Draco está servido pelo próprio app, não por CDN', () => {
    // A CSP bloqueia host externo, e o app nativo precisa funcionar sem depender
    // de terceiro. Os três arquivos são o que o DRACOLoader busca em runtime.
    for (const f of ['draco_decoder.wasm', 'draco_wasm_wrapper.js', 'draco_decoder.js']) {
      expect(fs.existsSync(path.join(process.cwd(), 'public/draco', f))).toBe(true)
    }
  })
})
