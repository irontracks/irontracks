## Diagnóstico (por que acontece no desktop também)
- Abrir o vídeo em outra aba e voltar pode fazer o navegador:
  - descartar o estado do React (tab em background / economia de memória), ou
  - re-renderizar a árvore principal, fazendo o `showAdminPanel` voltar para `false`.
- Resultado: você volta para o dashboard porque o Painel de Controle é um **modal controlado por estado**.

## Correção que vou implementar (robusta)
1) **Persistir “Painel aberto” e “aba atual” em sessionStorage**
- Ao abrir o Painel, gravar `admin_panel_open=1`.
- Sempre que a aba do Painel mudar, gravar `admin_panel_tab=videos` (ou a aba atual).
- Ao fechar o Painel, limpar esses valores.

2) **Auto-restaurar o Painel ao voltar para o IronTracks**
- No `IronTracksAppClient` (onde existe `showAdminPanel`), adicionar listeners:
  - `visibilitychange` e `pageshow`
- Quando o usuário voltar e `admin_panel_open=1`, reabrir o Painel e forçar a aba salva (`admin_panel_tab`).

3) **Integrar com o `?tab=` do URL (opcional, mas ajuda)
- Se existir `?tab=videos` no URL e o painel estiver marcado como aberto, abrir diretamente na aba correta.

## Resultado esperado
- Você abre Painel → VÍDEOS.
- Clica “Abrir no YouTube”.
- Ao voltar para o IronTracks (desktop ou mobile), o Painel reabre automaticamente na aba VÍDEOS, sem precisar clicar no Painel de Controle de novo.

## Validação
- Testar desktop: abrir 2–3 vídeos em sequência e alternar de aba.
- Testar refresh (F5) com Painel aberto.
- Confirmar que sempre volta para VÍDEOS enquanto o Painel estiver “marcado como aberto”.