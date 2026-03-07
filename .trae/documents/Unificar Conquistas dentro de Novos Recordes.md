## O que existe hoje
- O card **Novos Recordes** é o componente [RecentAchievements.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/RecentAchievements.tsx).
- As **Conquistas** (chips/badges) ficam dentro do componente [BadgesGallery.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/BadgesGallery.tsx) (seção “Conquistas (N)”).
- No dashboard, ambos aparecem separados em [StudentDashboard3.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard3.tsx#L578-L589).

## Objetivo
- Colocar os cards/chips de **Conquistas** dentro do card **Novos Recordes** para “limpar” a dashboard.
- Manter **Iron Rank** separado (continua fazendo sentido como card próprio) e evitar perder informação caso o usuário desative o card de recordes.

## Mudanças propostas
### 1) Tornar o card “Novos Recordes” um container também de Conquistas
- Estender [RecentAchievements.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/RecentAchievements.tsx) para aceitar props opcionais:
  - `badges?: Badge[]` (mesmo tipo do BadgesGallery)
  - `showBadges?: boolean`
- Quando `expanded === true`, renderizar uma segunda seção abaixo dos PRs:
  - título “Conquistas (N)”
  - lista de chips igual ao visual atual
- Opcional (para dar mais sentido ainda à união): no subtitle do card fechado mostrar “X recordes • Y conquistas” quando houver dados.

### 2) Evitar duplicação (Conquistas não aparecem duas vezes)
- Ajustar [StudentDashboard3.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard3.tsx):
  - Se `showNewRecordsCard` estiver ligado, passar `badges={props.streakStats?.badges}` para `RecentAchievements`.
  - Renderizar `BadgesGallery` com `showBadges={false}` (mantendo `showIronRank` como está).
  - Se `showNewRecordsCard` estiver desligado, **não** passar badges para `RecentAchievements` (ele nem aparece) e manter `BadgesGallery` exibindo Conquistas normalmente (para não “sumir” conquistas).

### 3) Reutilização de UI de badge
- Opção A (mais limpa): extrair o grid/chips de conquistas para um novo componente pequeno `BadgesInline.tsx` e reutilizar tanto em `BadgesGallery` quanto em `RecentAchievements`.
- Opção B (mais rápida): duplicar o trecho de render dos chips em `RecentAchievements` (menos ideal, mas simples).

## Validação
- Garantir que:
  - Dashboard fica com 1 card a menos (Conquistas somem do bloco principal).
  - Ao expandir “Novos Recordes”, Conquistas aparecem dentro.
  - Se o usuário desativar “Novos Recordes”, Conquistas continuam visíveis via `BadgesGallery`.
- Rodar `npm run lint` e `npm run build`.

## Arquivos envolvidos
- [StudentDashboard3.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard3.tsx)
- [RecentAchievements.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/RecentAchievements.tsx)
- [BadgesGallery.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/BadgesGallery.tsx)