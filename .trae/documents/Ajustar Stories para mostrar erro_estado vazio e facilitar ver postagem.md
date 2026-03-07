## Problema atual
- Você postou, mas **não aparece** porque quando a API falha (401/500) o componente pode acabar escondendo a seção inteira.

## Objetivos
- Tornar impossível “postar e não saber onde ver”.
- Adicionar opção de **deletar** a foto/story.

## Mudanças que vou implementar
### 1) Stories sempre visível (com erro/empty state)
- Ajustar `StoriesBar` para:
  - Não retornar `null` quando houver `error`.
  - Mostrar estado vazio (“Você ainda não tem stories”) quando não existir story ativo.
  - Manter o botão **Atualizar** funcionando e exibindo erro caso a API não responda.

### 2) Publicação mais clara
- No modal da Foto (StoryComposer):
  - Manter a mensagem “Publicado no IronTracks” e instrução curta de onde ver.
  - (Opcional) Forçar recarregar a lista de stories ao fechar (para aparecer imediatamente).
  - Exibir mensagem de erro mais específica quando a API falhar (ex.: migration não aplicada/RLS/env).

### 3) Deletar story (DB + arquivo)
- Backend:
  - Criar `POST /api/social/stories/delete`:
    - Exige login.
    - Valida `storyId`.
    - Marca `is_deleted = true` no `social_stories` (ou delete físico, mas vou preferir soft-delete pelo schema).
    - Remove o arquivo do Storage (`social-stories`) via admin client.
- UI:
  - No viewer do story, se o story for do **próprio usuário**, mostrar botão **Deletar**.
  - Após deletar, atualizar a lista (sumir anel e story).

## Validação
- Publicar story → aparece no avatar “Você”.
- Abrir story → marca visto.
- Deletar story → some imediatamente da lista e não retorna ao atualizar.
- Rodar lint/build.

Vou aplicar esses ajustes agora.