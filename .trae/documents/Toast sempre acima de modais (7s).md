## Objetivo
- Garantir que o card flutuante de notificação fique **sempre acima de qualquer modal/janela**.
- Garantir autoclose em **7 segundos**.

## Diagnóstico rápido
- O toast atual usa `z-[2000]` em [NotificationToast.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/NotificationToast.js#L64-L90).
- Já existe modal com `z-[2500]` (ex.: StoryComposer), então o toast pode ficar **atrás** em alguns fluxos.
- Duração padrão hoje é **5000ms**.

## Mudanças propostas
1) **Subir o z-index do toast**
   - Alterar a classe do toast para `z-[999999]` (ou similar) para ficar acima de `z-[2500]` e quaisquer outros modais.
   - Arquivo: [NotificationToast.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/NotificationToast.js)
2) **Fixar duração padrão em 7s**
   - Trocar default de `durationMs` de 5000 → 7000 no toast.
   - Arquivo: [NotificationToast.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/NotificationToast.js)
3) **Padronizar o provider para 7s**
   - Ajustar o default `durationMs` do provider para 7000, garantindo que o app inteiro use 7s sem depender de cada tela.
   - Arquivo: [InAppNotificationsContext.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/contexts/InAppNotificationsContext.js)

## Validação
- Rodar lint/build e conferir que:
  - toast aparece por cima de modais (incluindo StoryComposer z-[2500])
  - toast autoclose em ~7s
  - continua respeitando `settings.inAppToasts`.
