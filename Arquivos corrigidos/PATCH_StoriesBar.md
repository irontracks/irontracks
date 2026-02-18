# PATCH: StoriesBar.tsx - Remover validação WEBM

## Arquivo: src/components/dashboard/StoriesBar.tsx

### REMOVER linhas 62-64:

```typescript
// ❌ REMOVER ESTAS LINHAS:
if (kind === 'video' && (ext0 === '.webm' || String(file?.type || '').toLowerCase() === 'video/webm')) {
  throw new Error('WEBM pode não rodar no Safari. Prefira MP4/MOV.')
}
```

### RAZÃO:
- O VideoCompositor agora SEMPRE gera MP4 (após correção)
- Esta validação estava bloqueando vídeos comprimidos que geravam WEBM em navegadores Chrome/Firefox
- Como agora priorizamos MP4, a validação é desnecessária

### Código atualizado (linhas 45-87):

```typescript
const uploadStory = async (file: File, metadata: any = {}) => {
  setUploading(true)
  setError('')
  try {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    const uid = String(authData?.user?.id || '').trim()
    if (!uid) throw new Error('unauthorized')

    const MAX_BYTES = 200 * 1024 * 1024
    if (file?.size && file.size > MAX_BYTES) {
      throw new Error(`Vídeo muito grande (máx 200MB). Atual: ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
    }

    const rawName = String(file?.name || '').trim().toLowerCase()
    const ext0 = parseExt(rawName) || extFromMime(file.type)
    const kind = guessMediaKind(file.type, ext0)
    
    // ✅ VALIDAÇÃO WEBM REMOVIDA - VideoCompositor agora sempre gera MP4
    
    const ext = ext0 || (kind === 'video' ? '.mp4' : '.jpg')
    const storyId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    const path = `${uid}/stories/${storyId}${ext}`

    const signResp = await fetch('/api/storage/social-stories/signed-upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    const signJson = await signResp.json().catch(() => null)
    if (!signResp.ok || !signJson?.ok || !signJson?.token) throw new Error(String(signJson?.error || 'Falha ao preparar upload'))

    if (typeof signJson?.bucketLimitBytes === 'number' && Number.isFinite(signJson.bucketLimitBytes) && file.size > signJson.bucketLimitBytes) {
      throw new Error(
        `Arquivo maior que o limite do bucket (${(signJson.bucketLimitBytes / (1024 * 1024)).toFixed(0)}MB). Atual: ${(file.size / (1024 * 1024)).toFixed(1)}MB`
      )
    }

    const { error: upErr } = await supabase.storage
      .from('social-stories')
      .uploadToSignedUrl(path, String(signJson.token), file, { contentType: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg') })
    if (upErr) throw upErr

    const createResp = await fetch('/api/social/stories/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 
        mediaPath: path, 
        caption: null, 
        meta: { 
          source: 'upload',
          ...metadata
        } 
      }),
    })
    const createJson = await createResp.json().catch(() => null)
    if (!createResp.ok || !createJson?.ok) throw new Error(String(createJson?.error || 'Falha ao publicar'))

    await reload()
  } catch (e) {
    const msg = String(e?.message || e)
    console.error('Story upload error:', e)
    const low = msg.toLowerCase()
    if (low.includes('exceeded') && low.includes('maximum') && low.includes('size')) {
      setError('Arquivo excede o limite de upload do Storage. Se o vídeo estiver <= 200MB, ajuste o "Global upload limit" no Supabase Storage.')
      return
    }
    setError(msg === 'unauthorized' ? 'Faça login novamente para publicar.' : `Erro: ${msg}`)
  } finally {
    setUploading(false)
  }
}
```

## Aplicar com:

```bash
# Opção 1: Editar manualmente o arquivo
# src/components/dashboard/StoriesBar.tsx - remover linhas 62-64

# Opção 2: Usar sed (backup automático)
sed -i.bak '62,64d' src/components/dashboard/StoriesBar.tsx
```
