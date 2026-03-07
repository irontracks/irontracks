# Plano - Slider de Trim com Framer Motion (useMotionValue)

## Objetivo
Substituir a implementação de sliders sobrepostos (`<input type="range">`) por um componente customizado usando `drag` e `useMotionValue` do Framer Motion, resolvendo problemas de interação em touch e conflito de `pointer-events`.

## Arquivo Alvo
`src/components/stories/StoryCreatorModal.tsx`

## Alterações Planejadas

### 1. Refatoração do JSX (activeTool === 'trim')
- Remover os inputs numéricos de start/end.
- Remover os inputs type="range" e seus hacks de pointer-events.
- Criar um container relativo (trilha) com `ref` (`trackRef`) para cálculo de coordenadas.
- Adicionar dois elementos `motion.div` (thumbs) com propriedade `drag="x"`, `dragMomentum={false}` e `dragElastic={0}`.

### 2. Gerenciamento de Estado (useMotionValue)
- **Hooks**:
  - `const trackWidth = useRef(0)`: armazenar largura da trilha via `ResizeObserver` ou `useEffect`.
  - `const startX = useMotionValue(0)`: posição X do thumb esquerdo.
  - `const endX = useMotionValue(0)`: posição X do thumb direito.
  - `const selectedWidth = useTransform([startX, endX], ([s, e]) => Math.max(0, e - s))`: largura dinâmica da região selecionada.
- **Sincronização**:
  - `useEffect`: Sempre que `trimRange` ou `trackWidth` mudar, atualizar `startX` e `endX` convertendo segundos -> pixels.
    - `startX.set((trimRange.start / videoDuration) * width)`
    - `endX.set((trimRange.end / videoDuration) * width)`

### 3. Lógica de Drag (onDrag)
- **Thumb Start**:
  - `style={{ x: startX }}`
  - `dragConstraints={trackRef}`
  - `onDrag`:
    - Ler `info.point.x` relativo ao container.
    - Converter pixel -> segundos: `newStart = (x / width) * duration`.
    - **Validar Limites**: Se `newStart >= trimRange.end - MIN_TRIM_SECONDS`, forçar `startX.set(...)` para o limite e retornar.
    - Atualizar `setTrimRange({ ...trimRange, start: newStart })`.
    - Atualizar `videoRef.current.currentTime = newStart`.
- **Thumb End**:
  - `style={{ x: endX }}`
  - `dragConstraints={trackRef}`
  - `onDrag`:
    - Converter pixel -> segundos.
    - **Validar Limites**:
      - Se `newEnd <= trimRange.start + MIN_TRIM_SECONDS`, forçar limite inferior.
      - Se `newEnd > trimRange.start + MAX_VIDEO_SECONDS`, forçar limite superior.
    - Atualizar `setTrimRange({ ...trimRange, end: newEnd })`.
    - Atualizar `videoRef.current.currentTime = newEnd`.

### 4. Visualização
- **Trilha**: `bg-neutral-800 h-12 rounded-lg relative` (container pai, ref `trackRef`).
- **Região Selecionada**: `motion.div` absoluto.
  - `style={{ left: startX, width: selectedWidth }}`
  - Estilo: `bg-yellow-500/30 border-y-2 border-yellow-500 h-full absolute top-0 pointer-events-none`.
- **Thumbs**: `w-5 h-8 bg-yellow-500 rounded-md absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-20`.

## Validação
- Drag suave e responsivo.
- Thumbs sincronizados com `trimRange`.
- Preview de vídeo atualiza em tempo real.
- Respeito aos limites MIN_TRIM e MAX_VIDEO.
