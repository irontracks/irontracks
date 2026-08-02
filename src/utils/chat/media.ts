/**
 * Lê o arquivo como data URL (base64). Usamos data URL — NÃO `URL.createObjectURL` —
 * porque blob: URLs falham ao carregar no WebView do Capacitor (Android) quando o app
 * é servido do `server.url` remoto: o `<img>` dispara onerror e a compressão quebra
 * (era a causa do "Erro inesperado" no upload de foto de perfil). Data URL carrega em
 * qualquer contexto. Mesmo caminho usado com sucesso no ProgressPhotos.
 */
function readAsDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
    reader.readAsDataURL(file)
  })
}

export async function compressImage(file: File | Blob, { maxWidth = 1280, quality = 0.8 }: { maxWidth?: number, quality?: number } = {}): Promise<Blob> {
  const dataUrl = await readAsDataURL(file)
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
    img.src = dataUrl
  })
}

export async function generateImageThumbnail(file: File | Blob, { thumbWidth = 360 }: { thumbWidth?: number } = {}): Promise<Blob> {
  return compressImage(file, { maxWidth: thumbWidth, quality: 0.7 })
}

export async function fileToArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return await file.arrayBuffer()
}
