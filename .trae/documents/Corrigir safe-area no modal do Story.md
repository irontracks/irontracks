## Diagnóstico
- No modal de foto do Story ([StoryComposer.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/StoryComposer.js#L731-L761)), o wrapper usa `pt-safe`, mas o card do modal tem `max-h-[calc(100vh-24px)]`.
- Em iPhones com notch, quando o modal encosta no limite de `max-h`, o `pt-safe` **soma** na altura total e o topo “vaza” para trás da safe-area (o header fica por baixo da notch).

## Mudanças
1) Ajustar o limite de altura do modal para respeitar safe-area
- Trocar `max-h-[calc(100vh-24px)]` por uma versão com viewport dinâmica e subtraindo o safe inset top:
  - `max-h-[calc(100dvh-24px-env(safe-area-inset-top))]`

2) Garantir padding interno no header do modal
- Trocar o header de `p-4` para:
  - `px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]`
  - Assim, mesmo quando o modal ficar “full height”, o conteúdo do header (título + botão fechar) nunca entra na notch.

## Validação
- Abrir o StoryComposer no iPhone (simulado) e confirmar que:
  - O topo do header não fica sob a notch.
  - Scroll do conteúdo continua funcionando.
- Rodar `npm run build` para garantir que nada quebrou.
