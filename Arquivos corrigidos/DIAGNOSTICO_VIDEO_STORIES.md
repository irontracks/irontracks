# Diagnóstico: Vídeos não salvam/postam no Iron Story

## 🔴 Problema Reportado
Vídeos não estão sendo salvos nem postados no story local do app. Fotos funcionam normalmente.

## 📊 Análise do Fluxo Completo

### 1. **Frontend: StoryCreatorModal** (`/components/stories/StoryCreatorModal.tsx`)

#### Fluxo de processamento de vídeo:
1. Usuário seleciona vídeo
2. Se vídeo > 200MB → compressão via `VideoCompositor`
3. Chama `onPost(fileToUpload, metadata)`

#### Código relevante (linhas 323-366):
```typescript
if (mediaType === 'video' && fileToUpload.size > MAX_VIDEO_BYTES) {
  setCompressionRunning(true);
  setCompressionProgress(0);
  const v = videoRef.current;
  if (!v) throw new Error('video_not_ready');
  
  // ... compressão com VideoCompositor ...
  
  const result = await compositor.render({
    videoElement: v,
    trimRange: [start, end],
    onDrawFrame: (ctx, video) => {
      try { ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height); } catch {}
    },
    outputWidth: outW,
    outputHeight: outH,
    fps: 30,
    videoBitsPerSecond: COMPRESS_VIDEO_BPS,
    audioBitsPerSecond: COMPRESS_AUDIO_BPS,
    onProgress: (p) => {
      try { setCompressionProgress(Math.max(0, Math.min(1, Number(p || 0)))); } catch {}
    }
  });
  
  fileToUpload = new File([result.blob], result.filename, { type: result.mime || 'video/mp4' });
  metadata.processed = true;
}
```

**⚠️ PROBLEMA IDENTIFICADO #1**: 
- A compressão SÓ acontece se `fileToUpload.size > MAX_VIDEO_BYTES` (200MB)
- Vídeos menores que 200MB vão direto para upload SEM processamento
- Mas metadata ainda inclui informações de `trim` e `filter` que não foram aplicadas

### 2. **Upload Handler** (`/components/dashboard/StoriesBar.tsx`)

#### Fluxo (linhas 45-116):
```typescript
const uploadStory = async (file: File, metadata: any = {}) => {
  // 1. Validações
  // 2. Gera signed URL: /api/storage/social-stories/signed-upload
  // 3. Upload: supabase.storage.uploadToSignedUrl()
  // 4. Cria registro: /api/social/stories/create
}
```

**Validações importantes:**
```typescript
// Linha 62-64: REJEITA WEBM
if (kind === 'video' && (ext0 === '.webm' || String(file?.type || '').toLowerCase() === 'video/webm')) {
  throw new Error('WEBM pode não rodar no Safari. Prefira MP4/MOV.')
}
```

**⚠️ PROBLEMA IDENTIFICADO #2**:
- Se o `VideoCompositor` gerar WEBM em navegadores não-Safari, o upload será rejeitado
- Mas o `VideoCompositor.getBestMimeType()` pode retornar WEBM em alguns navegadores

### 3. **VideoCompositor** (`VideoCompositor.ts`)

#### Seleção de formato (linhas 121-149):
```typescript
private getBestMimeType(): string {
  const candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', // H.264 preferido
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  // iOS/Safari: força MP4
  if (isIOS || isSafari) {
    const mp4 = candidates.find(c => MediaRecorder.isTypeSupported(c));
    if (mp4) return mp4;
  }

  // Outros navegadores: retorna primeiro suportado
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
}
```

**⚠️ PROBLEMA IDENTIFICADO #3**:
- Em Chrome/Firefox/Edge no Android/Windows, pode retornar WEBM
- WEBM é rejeitado pelo `uploadStory` (linha 62-64)
- Resultado: vídeo comprimido não pode ser enviado

### 4. **API Routes**

#### `/api/storage/social-stories/signed-upload` ✅
- Parece OK
- Cria bucket se não existir
- Retorna URL assinada

#### `/api/social/stories/create` ✅
- Valida payload
- Insere registro no DB
- Notifica seguidores

## 🐛 Problemas Identificados

### **CRÍTICO #1: Rejeição de WEBM**
- **Localização**: `StoriesBar.tsx` linhas 62-64
- **Problema**: Vídeos comprimidos em WEBM são rejeitados
- **Impacto**: Em navegadores Chrome/Firefox/Edge, vídeos > 200MB falham

### **CRÍTICO #2: Metadados inconsistentes**
- **Localização**: `StoryCreatorModal.tsx` linhas 243-259
- **Problema**: Vídeos < 200MB não são processados, mas metadata.trim/filter são enviados
- **Impacto**: Servidor pode esperar vídeo processado quando não está

### **MÉDIO #3: Falta de feedback de erro**
- **Localização**: `StoryCreatorModal.tsx` linha 377
- **Problema**: `alert('Erro ao processar story')` é genérico demais
- **Impacto**: Usuário não sabe o que deu errado

### **BAIXO #4: Arquivos duplicados no projeto**
- Encontrados: `*.ts 2`, `*.tsx 2` em vários lugares
- **Impacto**: Confusão no build, possíveis bugs de importação

## 🔧 Soluções Propostas

### **SOLUÇÃO #1: Forçar MP4 em todos os navegadores**

**Arquivo**: `/lib/video/VideoCompositor.ts` (linhas 121-149)

```typescript
private getBestMimeType(): string {
  // SEMPRE priorizar MP4 para compatibilidade universal
  const mp4Candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4'
  ];

  for (const type of mp4Candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  // Fallback para WebM apenas se MP4 não for suportado
  const webmCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  for (const type of webmCandidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.warn('MP4 não suportado, usando WebM. Compatibilidade pode ser limitada.');
      return type;
    }
  }

  throw new Error('Nenhum formato de vídeo suportado encontrado neste navegador.');
}
```

### **SOLUÇÃO #2: Remover validação WEBM ou processar sempre**

**Opção A - Remover validação WEBM** (mais simples):
```typescript
// REMOVER linhas 62-64 de StoriesBar.tsx
// ❌ if (kind === 'video' && (ext0 === '.webm' || String(file?.type || '').toLowerCase() === 'video/webm')) {
//   throw new Error('WEBM pode não rodar no Safari. Prefira MP4/MOV.')
// }
```

**Opção B - Processar sempre vídeos** (mais robusto):
```typescript
// StoryCreatorModal.tsx - SEMPRE processar vídeos, não só > 200MB
if (mediaType === 'video') {
  setCompressionRunning(true);
  setCompressionProgress(0);
  // ... lógica de compressão ...
}
```

### **SOLUÇÃO #3: Melhorar mensagens de erro**

**Arquivo**: `StoryCreatorModal.tsx` (linhas 370-381)

```typescript
} catch (err) {
  console.error('Story upload error:', err);
  const errorMsg = String((err as Record<string, unknown>)?.message || '');
  
  if (errorMsg.includes('video_metadata_timeout')) {
    setCompressionError('Não foi possível carregar o vídeo. Tente novamente.');
  } else if (errorMsg.includes('WEBM')) {
    setCompressionError('Formato WEBM não suportado. Enviando para reprocessamento...');
    // Tentar reprocessar forçando MP4
  } else if (mediaType === 'video' && media?.size > MAX_VIDEO_BYTES) {
    setCompressionError('Falha ao comprimir. Reduza duração/resolução ou tente outro vídeo.');
  } else {
    setCompressionError(`Erro: ${errorMsg || 'Falha ao processar story'}`);
  }
  
  // Mostrar erro na UI ao invés de alert
  return; // Não fechar modal
} finally {
  setPosting(false);
  setCompressionRunning(false);
}
```

### **SOLUÇÃO #4: Limpar arquivos duplicados**

```bash
# Remover todos os arquivos com sufixo " 2"
find src -name "* 2.ts" -o -name "* 2.tsx" -delete
find src -type d -name "* 2" -o -name "* 3" | xargs rm -rf
```

## 🧪 Plano de Teste

### Cenário 1: Vídeo pequeno (< 200MB)
1. ✅ Upload deve funcionar direto
2. ⚠️ Trim/filtros NÃO devem ser aplicados (ou processar sempre)

### Cenário 2: Vídeo grande (> 200MB)
1. ✅ Compressão deve gerar MP4
2. ✅ Upload deve aceitar o arquivo
3. ✅ Story deve aparecer no feed

### Cenário 3: Chrome/Firefox/Edge
1. ✅ Não deve gerar WEBM
2. ✅ Deve usar MP4 sempre

### Cenário 4: iOS/Safari
1. ✅ Deve usar MP4
2. ✅ Vídeo deve reproduzir

## ✅ Checklist de Implementação

- [ ] **CRÍTICO**: Aplicar SOLUÇÃO #1 (forçar MP4)
- [ ] **CRÍTICO**: Aplicar SOLUÇÃO #2-A (remover validação WEBM) OU #2-B (processar sempre)
- [ ] **IMPORTANTE**: Aplicar SOLUÇÃO #3 (melhorar mensagens)
- [ ] **LIMPEZA**: Aplicar SOLUÇÃO #4 (remover duplicados)
- [ ] **TESTE**: Validar upload de vídeo < 200MB
- [ ] **TESTE**: Validar upload de vídeo > 200MB
- [ ] **TESTE**: Validar em Chrome/Firefox
- [ ] **TESTE**: Validar em Safari/iOS

## 📝 Notas Adicionais

### Perguntas para o time:
1. **Os filtros/trim devem ser aplicados a TODOS os vídeos?**
   - Se SIM: Implementar SOLUÇÃO #2-B
   - Se NÃO: Implementar SOLUÇÃO #2-A e remover metadata de trim/filter para vídeos < 200MB

2. **WEBM é realmente um problema?**
   - Safari não suporta bem WEBM
   - Mas MP4 é universal
   - Recomendação: forçar MP4 sempre

3. **Há logs de erro no servidor?**
   - Verificar se upload está chegando ao bucket
   - Verificar se registro está sendo criado no DB
   - Pode haver erro silencioso em alguma etapa
