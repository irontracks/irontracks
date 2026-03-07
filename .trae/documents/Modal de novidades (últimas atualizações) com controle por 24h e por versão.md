## Recomendação (uso do dia a dia)
- Melhor UX: **aparecer 1x por atualização (por “versão”/changelog)** e só voltar a aparecer quando existirem **novas atualizações**.
- Motivo: modal repetindo por 24h em todo acesso tende a irritar e vira “clique automático em fechar”, reduzindo o valor do aviso.
- Para não perder informação, deixo também um acesso manual (“Ver novidades”) dentro de Configurações.

## Regra de exibição (como vai funcionar)
- O app terá um `changelogId` atual (ex.: `2026-01-21` ou `2.4.15`).
- Ao entrar no app:
  - Se `changelogId` **diferir** do `lastSeenChangelogId` salvo do usuário → abre o modal automaticamente.
  - Ao fechar o modal → grava `lastSeenChangelogId = changelogId` e `lastSeenAt = now`.
  - Se você publicar um novo changelog antes de 24h, ele **aparece mesmo assim** (porque o ID mudou).
- (Opcional, fácil de ligar depois) modo “lembrar por 24h”: reabrir enquanto `now - lastSeenAt < 24h` e o usuário não marcou “Não mostrar novamente”.

## Implementação
### 1) Fonte das atualizações
- Criar um arquivo único com a lista de novidades (mantido no código):
  - `src/content/whatsNew.ts` exportando `{ id, title, date, items[] }` (itens em bullet).
  - Sempre considera o primeiro item como “últimas atualizações”.

### 2) Modal de novidades
- Criar `src/components/WhatsNewModal.tsx` seguindo o padrão visual do `SettingsModal`.
- UI:
  - Título “Novidades”
  - Lista de bullets das mudanças
  - Botões: “Entendi” (fecha) e “Ver tudo” (se quiser expandir para histórico).

### 3) Persistência por usuário
- Usar o sistema existente `user_settings.preferences` via `useUserSettings`.
- Adicionar chaves:
  - `whatsNewLastSeenId` (string)
  - `whatsNewLastSeenAt` (timestamp em ms)
  - (opcional) `whatsNewAutoOpen` (boolean)

### 4) Gatilho ao entrar no app
- No `IronTracksAppClient`, após carregar `userSettingsApi.settings` e `user.id`, comparar IDs e abrir o modal quando necessário.
- Ao fechar, salvar as prefs via `userSettingsApi.updateSetting(...)`/`save(...)`.

### 5) Acesso manual
- No `SettingsModal`, adicionar um botão “Ver últimas atualizações” que abre o mesmo modal.

## Validação
- Testar cenários:
  - 1º login após atualizar changelog → modal abre.
  - Fechar → não abre de novo.
  - Alterar `changelogId` → abre de novo mesmo dentro de 24h.
  - Lint/build OK.
