import type { ModelViewerElement } from '@google/model-viewer'
import type { MuscleId } from '@/utils/muscleMapConfig'
import { FRONT_OVERLAYS, BACK_OVERLAYS, dedupOverlays, ratioToOpacity } from './overlays'

export type MuscleMap3DState = Record<string, { ratio?: number; sets?: number; label?: string }>
export const MUSCLE_3D_ROOT = '/muscle-map-3d/v1/'
const entries = [...FRONT_OVERLAYS, ...BACK_OVERLAYS]

export function muscleLayers3d(muscles: MuscleMap3DState, selected?: MuscleId | null) {
  return dedupOverlays(entries, id => Number(muscles[id]?.ratio || 0))
    .map(layer => ({ ...layer, selected: layer.muscleIds.some(id => id === selected), opacity: ratioToOpacity(layer.maxRatio, layer.muscleIds.some(id => id === selected)) }))
    .filter(layer => layer.opacity > 0)
}

async function loadImage(url: string) {
  const image = new Image()
  image.src = url
  await image.decode()
  return image
}

export async function attachMuscleColors(viewer: ModelViewerElement) {
  const base = await loadImage(`${MUSCLE_3D_ROOT}reference-atlas.png`)
  const texture = viewer.createCanvasTexture()
  const canvas = texture.source.element
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas 3D indisponível')
  canvas.width = base.naturalWidth
  canvas.height = base.naturalHeight
  const ctx = canvas.getContext('2d')
  const slot = viewer.model?.materials[0]?.emissiveTexture
  if (!ctx || !slot) throw new Error('Material muscular 3D indisponível')
  const original = slot.texture
  const cache = new Map<string, Promise<HTMLImageElement>>()
  let revision = 0
  let disposed = false

  const update = async (muscles: MuscleMap3DState, selected?: MuscleId | null) => {
    const current = ++revision
    const layers = muscleLayers3d(muscles, selected)
    const images = await Promise.all(layers.map(({ file }) => {
      let pending = cache.get(file)
      if (!pending) {
        pending = loadImage(`${MUSCLE_3D_ROOT}muscle-atlases/${file}`).catch(error => { cache.delete(file); throw error })
        cache.set(file, pending)
      }
      return pending
    }))
    if (disposed || current !== revision) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // CanvasTexture uploads bottom-up, unlike the original glTF image.
    ctx.setTransform(1, 0, 0, -1, 0, canvas.height)
    ctx.drawImage(base, 0, 0)
    layers.forEach((layer, index) => {
      ctx.globalAlpha = layer.opacity
      ctx.filter = layer.selected ? 'saturate(1.4) brightness(1.15)' : 'none'
      ctx.drawImage(images[index], 0, 0)
    })
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    texture.source.update()
    slot.setTexture(texture)
  }
  return { update, dispose() { disposed = true; ++revision; slot.setTexture(original); cache.clear(); canvas.width = 1; canvas.height = 1 } }
}
