# Plano - Correção de Travamento na Exportação de Story

## Objetivo

Resolver o problema de travamento durante a exportação de vídeo no `StoryComposer.tsx`, causado por conflito entre o loop de desenho (`requestAnimationFrame`) e o `VideoCompositor`.

## Arquivo Alvo

`src/components/StoryComposer.tsx`

## Alterações Planejadas

### 1. Controle do Draw Loop (Ref)

* Adicionar `const drawLoopActiveRef = useRef(true)` no início do componente para ter um controle síncrono e imediato do cancelamento do loop, independente do ciclo de renderização do React.

### 2. Refatoração do useEffect (Draw Loop)

* Substituir o `useEffect` atual (linhas \~920-951) por uma versão mais robusta:

  * Verificar `if (isExporting) return` logo no início.

  * Usar uma variável local `cancelled` para cleanup.

  * Implementar o loop `draw()` que verifica `cancelled` antes de desenhar.

  * Chamar `requestAnimationFrame` apenas se `layout === 'live' && draggingKey` (otimização existente, mas reforçada).

  * No cleanup: `cancelled = true`, `cancelAnimationFrame(raf)`.

### 3. Ajuste no renderVideo

* Modificar o fluxo de início da exportação:

  ```typescript
  try {
    compositorRef.current = new VideoCompositor()
    setIsExporting(true)
    // Pequeno delay para garantir que o React processe o state change 
    // e o useEffect do loop pare antes de iniciarmos a gravação pesada
    await new Promise(r => setTimeout(r, 50)) 
    
    const result = await compositorRef.current.render({ ... })
    return result
  }
  ```

## Validação

* O loop de desenho deve parar imediatamente ao iniciar a exportação.

* O vídeo deve ser gerado sem travar o navegador.

* O overlay de "Processando" (se houver) deve aparecer sem congelar.

