// Convert our single-atlas Blender GLB to a same-origin texture reference.
// ImageBitmapLoader fetches embedded images as blob: URLs, blocked by connect-src.
import { readFileSync, writeFileSync } from 'node:fs'
const path = process.argv[2]
if (!path) throw new Error('Informe o GLB do manequim')
const input = readFileSync(path)
const jsonLength = input.readUInt32LE(12)
const model = JSON.parse(input.subarray(20, 20 + jsonLength).toString())
if (model.images?.[0]?.uri === 'reference-atlas.png') process.exit(0)
const image = model.images?.[0]
if (model.images?.length !== 1 || image.bufferView !== model.bufferViews.length - 1) throw new Error('Layout GLB inesperado: atlas deve ser o último bufferView')
const view = model.bufferViews[image.bufferView]
const binary = input.subarray(28 + jsonLength, 28 + jsonLength + view.byteOffset)
delete image.bufferView
image.uri = 'reference-atlas.png'
model.bufferViews.pop()
model.buffers[0].byteLength = binary.length
const encoded = Buffer.from(JSON.stringify(model))
const json = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32)
encoded.copy(json)
const result = Buffer.alloc(28 + json.length + binary.length)
result.writeUInt32LE(0x46546c67, 0)
result.writeUInt32LE(2, 4)
result.writeUInt32LE(result.length, 8)
result.writeUInt32LE(json.length, 12)
result.writeUInt32LE(0x4e4f534a, 16)
json.copy(result, 20)
result.writeUInt32LE(binary.length, 20 + json.length)
result.writeUInt32LE(0x004e4942, 24 + json.length)
binary.copy(result, 28 + json.length)
writeFileSync(path, result)
