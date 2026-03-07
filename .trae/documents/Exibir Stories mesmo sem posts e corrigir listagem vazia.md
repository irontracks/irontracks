## O que está acontecendo
- Sim: é **na aba Treinos (/dashboard)** que o Stories deveria aparecer, **acima do card “Novos recordes”**.
- Pela sua imagem ele não aparece porque o endpoint `GET /api/social/stories/list` hoje devolve `data: []` quando não existe nenhum story ativo.
- Como a UI atualmente esconde o componente quando a lista vem vazia, a seção some completamente.

## O que vou fazer (correção)
### 1) Corrigir a API de listagem
- Ajustar `GET /api/social/stories/list` para **sempre retornar pelo menos o seu “grupo”** (Você), mesmo quando você não tiver stories.
- Assim, a UI consegue exibir:
  - Seu avatar com **+** quando não tem post
  - Estado vazio com instrução de como postar

### 2) Tornar a seção Stories sempre visível no Dashboard
- Ajustar `StoriesBar` para **não sumir** quando `data` vier vazio.
- Mostrar:
  - “Sem stories por enquanto…”
  - Botão **Atualizar**
  - Seu avatar com **+** para postar manualmente

### 3) Validar
- Recarregar `/dashboard` e confirmar que a seção Stories aparece mesmo sem posts.
- Publicar um story e confirmar que ele aparece imediatamente.

Vou aplicar essas mudanças agora.