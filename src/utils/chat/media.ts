export async function compressImage(file, { maxWidth = 1280, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(img.width * scale)
      canvas.height = Math.floor(img.height * scale)
      const ctx = canvas.getContext('2d')
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
    img.onerror = reject
    const url = URL.createObjectURL(file)
    img.src = url
  })
}

export async function generateImageThumbnail(file, { thumbWidth = 360 } = {}) {
  return compressImage(file, { maxWidth: thumbWidth, quality: 0.7 })
}

export async function fileToArrayBuffer(file) {
  return await file.arrayBuffer()
}
