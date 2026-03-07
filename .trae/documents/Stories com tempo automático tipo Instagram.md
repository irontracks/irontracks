## Resposta direta
- Hoje o story **não fecha sozinho**.
- Ele fica na tela **por tempo indefinido** até você:
  - tocar na direita/esquerda para ir para o próximo/anterior
  - tocar fora ou no X para fechar

Isso dá para ver no viewer: não existe `setTimeout`/`setInterval` controlando avanço automático em [StoriesBar.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StoriesBar.tsx#L305-L496).

## Se você quiser “igual Instagram” (auto-avanço)
### Comportamento proposto
- **Imagem:** 5s por story.
- **Vídeo (se adicionarmos depois):** duração do vídeo até 15s (cap).
- Barra de progresso por story (a atual é “cheia”; viraria animada).
- Pausar quando:
  - abrir comentários
  - segurar o dedo/mouse (press-and-hold)
  - a aba perder foco
- Ao terminar o último story:
  - fecha o viewer ou passa para o próximo usuário (decidimos)

### Implementação
1) Adicionar estado de progresso (0→1) com `requestAnimationFrame` e duração por story.
2) Animar as barras do topo com base no progresso.
3) Implementar auto-avanço ao atingir 100%.
4) Pausar/resumir conforme interações (comentários, hold, blur).
5) Validar no desktop e mobile.

Se confirmar, eu implemento esse timer agora e deixo a duração fácil de ajustar.