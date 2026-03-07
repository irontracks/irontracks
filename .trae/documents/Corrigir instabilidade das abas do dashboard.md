## Diagnóstico pelo print
- O “bagunçar” na barra **TREINOS / AVALIAÇÕES / COMUNIDADE** no reload é típico de **layout shift**: a UI renderiza num estado e, logo após hidratar/montar, muda a quantidade/largura de abas.

## Causas mais prováveis (no código)
1) **Comunidade aparece 1 frame depois**
- Em [StudentDashboard3.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard3.tsx#L191-L249) existe `showCommunityTab` como `useState(false)` e ele só vira `true` num `useEffect`. Isso faz a barra nascer com 2 botões e, após montar, virar 3 → muda largura e “pula”.

2) **Dashboard é renderizado vazio antes do mount**
- Em [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js#L2450-L2487) tem `dashboardMounted ? <StudentDashboard /> : <div className="p-4 pb-24" />`. No reload, a página mostra um placeholder e depois injeta o dashboard completo → aumenta a sensação de instabilidade.

## Correção proposta
### 1) Deixar as abas determinísticas (sem state/efeito)
- Trocar `showCommunityTab` para ser **derivado direto** de `props.communityContent` (ou de `settings.moduleCommunity`) e remover `useState/useEffect`.
- Resultado: a barra já nasce com o número correto de botões, sem “pulo”.

### 2) Remover o “render vazio” antes do mount (ou trocar por skeleton com mesma altura)
- Opção A (preferida): renderizar `StudentDashboard` direto, sem `dashboardMounted`.
- Opção B: manter `dashboardMounted`, mas renderizar um skeleton que preserve a mesma altura/estrutura da barra de abas (não um div vazio).

## Implementação (arquivos)
1) [StudentDashboard3.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard3.tsx)
- Remover `showCommunityTab` como estado.
- Usar `const showCommunityTab = Boolean(props.communityContent)` (ou `props.settings?.moduleCommunity !== false`).

2) [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js)
- Remover o gate `dashboardMounted` OU substituir o placeholder por skeleton.

## Validação
- Recarregar a página (hard reload) algumas vezes e confirmar que a barra de abas não muda de largura/posição.
- Rodar lint/build pra garantir que não quebrou nada.