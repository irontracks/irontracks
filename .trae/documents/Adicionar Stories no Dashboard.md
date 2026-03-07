## Verificação
- Hoje o Stories **não está aparecendo no dashboard** porque a barra `StoriesBar` **não está plugada** no JSX do dashboard.
- Existe o componente pronto ([StoriesBar.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StoriesBar.tsx)) e existe o setting `showStoriesBar`, mas `StudentDashboard` não renderiza nada relacionado a Stories ([StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx)).

## Plano
### 1) Plugar StoriesBar no dashboard
- Importar `StoriesBar` em [StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx).
- Renderizar no topo da view `dashboard` (aba “Treinos”), logo após o card de “Perfil incompleto” e antes do resto do conteúdo.
- Passar `currentUserId` para o componente: `currentUserId={props.currentUserId}`.

### 2) Respeitar configurações
- Condição de exibição:
  - `props.settings?.moduleSocial !== false`
  - `props.settings?.showStoriesBar !== false`
  - `props.currentUserId` presente

### 3) Validação
- Garantir que o Stories aparece tanto no Chrome quanto no Safari (não há gating por Safari no código; o problema hoje é só falta de render).
- Conferir se a chamada `/api/social/stories/list` está retornando (barra deve aparecer mesmo sem stories, com o avatar “+”).

Se você confirmar, eu implemento isso em 1 arquivo (StudentDashboard.tsx) e valido no build.