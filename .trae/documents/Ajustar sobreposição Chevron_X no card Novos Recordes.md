## Diagnóstico
- No componente [RecentAchievements.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/RecentAchievements.tsx), o botão do X fica `absolute top-0 right-0` sem `z-index`.
- A linha do header (onde está o `ChevronDown`) é renderizada depois no DOM, então pode ficar por cima do X quando a UI fica apertada, causando a sobreposição.

## Plano
### 1) Reservar espaço para o botão X
- Adicionar padding à direita no header (`div.flex` do topo) para o chevron nunca entrar na área do X (ex.: `pr-12` ou `pr-14`).

### 2) Garantir que o X fica acima visualmente
- Adicionar `z-10` no wrapper do X (`absolute top-0 right-0`) para o botão sempre ficar na frente.

### 3) Validar
- Recarregar o `/dashboard` e checar o card “Novos Recordes” em telas menores/larguras diferentes para confirmar que a seta não sobrepõe o X e ambos continuam clicáveis.