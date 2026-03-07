## Diagnóstico
- A área de histórico está ganhando espaçamento extra por dois pontos:
  - O container do HistoryList usa `pt-header-safe` (80px fixo) em [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js#L591-L600).
  - O wrapper do `view === 'history'` ainda adiciona `p-4` em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L1733-L1741).

## Mudanças
### 1) Remover padding duplicado do wrapper
- Trocar o wrapper `div className="p-4 pb-24"` do `view === 'history'` para não adicionar padding-top extra (deixar apenas o HistoryList cuidar do layout).

### 2) Ajustar o offset do HistoryList para o header real
- Em [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js#L591-L600):
  - Substituir `pt-header-safe` (80px fixo) por um padding-top que bate com o header fixo: `pt-[calc(4rem+env(safe-area-inset-top))]`.
  - Remover o `pt-safe` do bloco do título do histórico (evita somar safe-area duas vezes).

## Validação
- Conferir visual no desktop e no mobile (safe-area) para garantir:
  - Header continua fixo.
  - “Histórico” encosta mais bonito logo abaixo do header, sem “vão”.
  - Sem regressão em outras telas.

Se estiver ok, eu aplico essas 2 alterações e valido no dev server.