## Diagnóstico
- A “faixa” logo abaixo do header (que no print correto fica cinza/vidro) vem da barra de abas do dashboard.
- No localhost, as abas **não aparecem** porque o dashboard está passando `hideTopTabs={isCoach}`.
  - Isso faz o componente [StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx#L214-L261) **não renderizar** os botões **Treinos / Avaliações / Comunidade**.
  - Sem essa barra (que tem `bg-neutral-900/70`), o que sobra por trás é o background geral do shell (`bg-neutral-950`), que parece “preto” no print do localhost.
  - O prop é setado em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L585-L627) com `hideTopTabs={isCoach}`.

## Correção (UI igual ao print correto)
### 1) Reativar as abas exatamente como eram
- Alterar [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L585-L627) para **não esconder** as abas para coach.
- Opções seguras:
  - Setar `hideTopTabs={false}` (abas sempre visíveis), ou
  - Remover o prop `hideTopTabs` (deixa o default do `StudentDashboard` renderizar).

### 2) Corrigir a cor “preta” abaixo do header
- Essa correção vem junto da reativação das abas, porque a barra de tabs aplica o background correto (`bg-neutral-900/70` + blur).
- Se ainda restar um “degrau” escuro em alguma densidade/viewport, ajustar o wrapper do dashboard para manter a mesma camada de background/gradiente da área superior (somente se necessário após validar visualmente).

## Validação
- Subir o localhost e conferir:
  - Header permanece igual.
  - A faixa abaixo do header deixa de ficar preta e volta ao cinza/vidro.
  - Botões **TREINOS / AVALIAÇÕES / COMUNIDADE** aparecem com o mesmo estilo e comportamento.
- Conferir também se `moduleCommunity` está habilitado (quando desabilitado, o botão Comunidade fica oculto por regra).

## Arquivos envolvidos
- [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js)
- [StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx)