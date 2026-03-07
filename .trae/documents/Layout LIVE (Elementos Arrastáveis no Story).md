Vou adicionar um novo layout no modal de Story chamado **LIVE** (ou **Livre**, se você preferir), onde cada peça pode ser posicionada manualmente.

## O que o usuário poderá mover
- Logo IRONTRACKS
- Nome do treino
- “RELATÓRIO DO TREINO • data”
- Cards: Volume, Tempo, KCAL (cada um separado)

## Como vou implementar (sem quebrar o scroll)
1. **Adicionar opção LIVE na lista de layouts**
   - Incluir `LIVE` em `storyLayouts` e manter os layouts atuais.

2. **Persistência de posições em porcentagem (responsivo)**
   - Criar um estado `livePositions` com `x/y` em **%** do canvas (0..1) para cada peça.
   - Isso evita depender de pixels do device e funciona igual no desktop/iPhone.

3. **Renderização no canvas usando as posições do LIVE**
   - Em `drawStory(...)`, quando `layout === 'live'`, desenhar cada peça nas coordenadas convertidas (pct → px).
   - Manter export (Compartilhar JPG) coerente com o que o usuário montou.

4. **Camada de arraste por cima do preview (handles)**
   - Renderizar uma camada sobre o preview com “alças” (divs) para cada peça.
   - Cada alça captura o gesto só quando o usuário toca nela, então **1 dedo fora das peças continua rolando o modal**.
   - Ao arrastar, atualizar `livePositions` e redesenhar o canvas.

5. **Controles mínimos**
   - Botão “Reset LIVE” para voltar ao layout padrão do LIVE.

## Validação
- Testar no iPhone: 1 dedo rola o modal; ao tocar em uma peça, ela arrasta; export JPG mantém o layout.

Arquivos principais: `src/components/StoryComposer.js` (e se necessário pequenos ajustes em `WorkoutReport.js` apenas se aparecer algum acoplamento).