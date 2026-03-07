## 1) Verificação do “Seguir” e card de aceitar/rejeitar
- Conferir os dois fluxos existentes:
  - **Tela Comunidade**: seção “Pedidos para seguir” já renderiza botões **Aceitar** e **Negar** (confirmado no código).
  - **Modal automático** ao receber notificação: `FollowRequestModalGate` mostra **Aceitar** e **Negar**.
- Ajuste (se necessário): garantir que o card/notification de follow_request sempre abre o modal e que não exista nenhuma UI alternativa exibindo só “Aceitar”.

## 2) Corrigir modal “Últimas atualizações” para aparecer só uma vez
- Bug identificado: a condição atual abre o modal repetidamente (especialmente quando `whatsNewRemind24h` está ativo).
- Mudança proposta:
  - Regra padrão: **se `whatsNewLastSeenId === entry.id`, não auto-abrir**.
  - Só auto-abrir quando existir **um entry novo** (id diferente).
  - Ao fechar, sempre salvar `whatsNewLastSeenId` e `whatsNewLastSeenAt = Date.now()`.
  - Manter botão “Abrir” nas configurações para ver manualmente.

## 3) Opção para desabilitar Stories no Dashboard
- Adicionar um setting `showStoriesBar` (default `true`) em `DEFAULT_SETTINGS`.
- Incluir um toggle em `SettingsModal` (ex.: “Stories no Dashboard: Ativo/Desligado”).
- Em `StudentDashboard`, renderizar `<StoriesBar />` apenas quando `settings.showStoriesBar === true`.

## 4) Validação
- Testar:
  - Pedido de seguir → o destinatário vê **Aceitar/Negar** (na Comunidade e/ou modal).
  - “Últimas atualizações” abre 1x, não reaparece a cada refresh.
  - Toggle de Stories oculta/mostra no Dashboard sem quebrar layout.
- Rodar lint/build.
