# Plano - Overlay de Compressão de Vídeo

## Objetivo
Melhorar a experiência do usuário durante a compressão de vídeo em `StoryCreatorModal.tsx` implementando um overlay fullscreen informativo e a capacidade de cancelar a operação.

## Arquivo Alvo
`src/components/stories/StoryCreatorModal.tsx`

## Alterações Planejadas

### 1. Novo Ref e Estado
- Adicionar `const compositorRef = useRef<VideoCompositor | null>(null);` para armazenar a instância atual do compositor.
- Manter o estado `compressionRunning` e `compressionProgress`.

### 2. Integração com VideoCompositor
- No `handlePost`:
  - Instanciar `const compositor = new VideoCompositor();` (já existe).
  - Atribuir ao ref: `compositorRef.current = compositor;`
  - No bloco `catch` ou `finally`, limpar o ref: `compositorRef.current = null;`
- Tratamento de Cancelamento:
  - No `catch (err)`, verificar se o erro contém "cancelada" ou "cancelled" para exibir mensagem apropriada ("Compressão cancelada") em vez de "Erro ao processar story".

### 3. UI do Overlay
- Renderizar condicionalmente `{compressionRunning && (...)}` no final do JSX do modal (nível raiz, z-[9999]).
- **Estrutura do Overlay**:
  - Container: `fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6`.
  - Loader: `<Loader2 className="w-12 h-12 text-yellow-500 animate-spin mb-4" />`.
  - Título: `<h3 className="text-white font-bold text-xl mb-6">Processando vídeo...</h3>`.
  - Barra de Progresso:
    - Container: `w-full max-w-xs h-2 bg-neutral-700 rounded-full overflow-hidden mb-2`.
    - Fill: `div` com `width: ${compressionProgress * 100}%` e cor `bg-yellow-500 transition-all duration-300`.
  - Texto Percentual: `<span className="text-yellow-500 font-mono font-bold text-lg mb-1">{(compressionProgress * 100).toFixed(0)}%</span>`.
  - Texto Auxiliar: `<p className="text-neutral-400 text-xs mb-8">Isso pode levar alguns segundos</p>`.
  - Botão Cancelar:
    - `<button onClick={() => compositorRef.current?.cancel()} ...>Cancelar</button>`
    - Estilo: `text-white/50 hover:text-white text-sm font-medium transition-colors`.

## Validação
- Verificar se o overlay aparece quando o vídeo > 200MB.
- Verificar se a barra de progresso atualiza.
- Testar o botão cancelar (deve interromper o processo e fechar o overlay).
- Testar o fluxo de sucesso (overlay fecha automaticamente).
