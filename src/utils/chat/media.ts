export async function compressImage(file: File | Blob, { maxWidth = 1280, quality = 0.8 }: { maxWidth?: number, quality?: number } = {}): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(img.width * scale)
      canvas.height = Math.floor(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Falha ao obter contexto 2d'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Falha ao comprimir imagem'))
          resolve(blob)
        },
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => reject(new Error('Falha ao carregar imagem'))
    const url = URL.createObjectURL(file)
    img.src = url
  })
}

export async function generateImageThumbnail(file: File | Blob, { thumbWidth = 360 }: { thumbWidth?: number } = {}): Promise<Blob> {
  return compressImage(file, { maxWidth: thumbWidth, quality: 0.7 })
}

export async function fileToArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return await file.arrayBuffer()
}
