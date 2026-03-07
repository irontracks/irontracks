## Onde entra a IA
Hoje, do jeito que está implementado, **não precisa de IA** para funcionar:
- O app só faz **match deterministic**: normaliza o nome do exercício e procura um vídeo na `exercise_library`.
- A normalização está em [normalizeExerciseName.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/normalizeExerciseName.ts) e o preenchimento automático ocorre no save do treino em [workout-actions.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js#L1112-L1260).

A IA (Gemini) entra para resolver o que é chato/difícil “no mundo real”:
- **Sinônimos e variações**: “supino reto com barra” vs “supino barra” vs “bench press”
- **Erros de escrita** e abreviações
- **Gerar termos de busca melhores** para achar o vídeo certo (PT/EN)
- **Sugerir candidatos** sem você ter que procurar manualmente

## Como seria o fluxo com IA (Gemini + YouTube API)
1) Usuário/coach adiciona exercício (texto livre)
2) Gemini gera:
- `canonical_name` (ex.: "bench press")
- sinônimos PT/EN
- termos de busca recomendados
3) Backend chama **YouTube Data API** (oficial) e retorna 3–5 vídeos embutíveis
4) O sistema cria uma **fila de sugestões** (pending)
5) Você aprova 1 vídeo (vira “primary”) e isso passa a preencher automaticamente `video_url` nos próximos treinos

## Onde a IA já está hoje no projeto (fora dos vídeos)
- IronScanner (importar treino por imagem) usa Gemini: [iron-scanner-actions.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/iron-scanner-actions.ts)
- Outras rotinas de IA também existem em [workout-actions.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js)

## Próximo passo (se você confirmar)
1) Criar tabelas para **sugestões pendentes** de vídeo (fila) e vídeos aprovados
2) Criar endpoint admin “Gerar sugestões”
3) Implementar Gemini para normalização + queries
4) Implementar integração YouTube API (somente discovery + embed; sem scraping)
5) Criar tela admin da fila (aprovar/rejeitar)

Se você confirmar esse plano, eu implemento o fluxo “com IA” em cima do que já existe (biblioteca + preenchimento automático).