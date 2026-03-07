# Plano - Otimização de Vídeo em StoryViewer

## Objetivo

Eliminar travamentos na reprodução de vídeos nos Stories (StoryViewer.tsx) alterando a estratégia de carregamento, play e recuperação de stall.

## Arquivo Alvo

`src/components/stories/StoryViewer.tsx`

## Alterações Planejadas

### 1. Elemento `<video>`

* **`preload`**: Alterar de `"metadata"` para `"auto"` (carregar o máximo possível antecipadamente).

* **`autoPlay`**: Remover atributo. O play será controlado exclusivamente via código.

* **`onStalled`**: Remover handler. O evento `stalled` é muito sensível e não indica erro fatal. Manter apenas `onError`.

### 2. Controle de Play (useEffect)

* Refatorar o `useEffect` que gerencia play/pause:

  * Antes de chamar `.play()`, garantir que o vídeo esteja posicionado no `start` do trim.

  * Usar o evento `seeked` (ou checar `seeking`) para garantir que o vídeo está pronto para tocar.

  * Sequência: `v.currentTime = start` -> aguardar seek -> `v.play()`.

### 3. Detector de Stall (setInterval)

* Refatorar a lógica de recuperação quando detecta congelamento (`currentTime` não muda):

  * **Tentativa 1**: `v.currentTime += 0.001` (forçar um micro-seek para destravar o buffer/renderizador). Aguardar próximo ciclo.

  * **Tentativa 2** (se ainda travado): `v.load()` e `v.play()` (reset completo).

  * Só exibir erro fatal após falhar na tentativa 2.

## Validação

* Verificar se `autoPlay` foi removido.

* Verificar se `preload="auto"`.

* Confirmar que `v.play()` é chamado no momento certo (após seek/trim).

* Confirmar lógica de recuperação suave (`+= 0.001`) antes do hard reload.

