## Diagnóstico
- O “vão” no topo acontece porque o offset do header está sendo aplicado **duas vezes**:
  - O container principal (scroll) já aplica `paddingTop: calc(4rem + env(safe-area-inset-top))` quando o header está visível: [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L1644-L1650)
  - O HistoryList também aplica padding-top (`pt-[calc(4rem+env(...))]` / antes `pt-header-safe`): [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js#L591-L599)

## Ajuste
- Remover o `padding-top` do container **não-embedded** do HistoryList e deixar só o container principal controlar o offset do header.
- Manter o restante do layout (paddings laterais `p-4` e `pb-safe-extra`) intacto.

## Validação
- Recarregar `dashboard?view=history` e confirmar que o título “Histórico” encosta logo abaixo do header.
- Validar no mobile (safe-area) para não ficar escondido atrás do header.
- Rodar `npm run build` para garantir que nada quebra.