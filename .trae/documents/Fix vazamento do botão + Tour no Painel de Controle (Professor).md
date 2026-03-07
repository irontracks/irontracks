## Diagnóstico (pelos prints)
- **Botão “vazando”**: a barra de ações do tour (Pular/Voltar/Próximo/Concluir) está estourando o layout em alguns cenários (principalmente quando o tooltip fica estreito ou perto da borda). Isso é clássico de `flex` sem wrap + botões com largura mínima.
- **Tour do professor não chega no Painel de Controle**: hoje o tour termina no dashboard. Para professor, o fluxo mais importante está no `AdminPanelV2` (Painel de Controle) e precisa continuar lá.

## Objetivo
- Garantir que **nenhum botão do tooltip estoure/“vaze”** em desktop e mobile.
- Fazer o tour do professor **abrir o Painel de Controle automaticamente** e continuar com passos dentro dele (tabs, alunos, criar treino etc.).

## Implementação
### 1) Corrigir vazamento do botão (tooltip)
- Ajustar o footer do tooltip em [GuidedTour.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/onboarding/GuidedTour.js):
  - Trocar layout para `flex-col` no mobile e `sm:flex-row` no desktop.
  - Usar `flex-wrap`/`gap` e botões com `w-full` no mobile para evitar overflow.
  - Garantir `maxWidth` do tooltip `min(360px, 100vw-24px)` e `maxHeight` com scroll interno se necessário.
  - Recalcular a posição do tooltip usando o **tamanho real do tooltip** (via `ref` + measure) em vez de valores fixos (isso evita posicionar e “cortar” o footer).

### 2) Suporte a passos com ação (para abrir Painel de Controle)
- Estender o `GuidedTour` para aceitar `step.action` (executado uma única vez ao entrar no passo). Exemplos:
  - `open_admin_panel` (chama `openAdminPanel('dashboard'|'students'|...)`)
  - `set_admin_tab` (opcional, mas podemos reusar `openAdminPanel(tab)` como setter)
  - `click_selector` (opcional para abrir menu, se precisarmos)
- Guardar um `lastActionStepIdRef` para não executar repetido.

### 3) Anchors dentro do Painel de Controle
- Adicionar `data-tour` nos pontos estáveis do [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js):
  - `adminpanel.root`
  - `adminpanel.tabs.desktop` e `adminpanel.tabs.mobileTrigger`
  - `adminpanel.dashboard.totalStudents`
  - `adminpanel.dashboard.coachInbox`
  - `adminpanel.students.search`, `adminpanel.students.statusFilter`, `adminpanel.students.create`
  - `adminpanel.student.subtabs`, `adminpanel.student.workouts.create`, `adminpanel.student.workouts.history`

### 4) Atualizar roteiro do professor para continuar no painel
- Em [tourSteps.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/tourSteps.js), quando `role` for teacher/admin:
  - Inserir passo “Painel de Controle” com `action: open_admin_panel('dashboard')`.
  - Adicionar sequência de passos dentro do painel, priorizando:
    1) Tabs do painel
    2) Coach Inbox (prioridade do professor)
    3) Aba Alunos (buscar/filtrar)
    4) Abrir aluno → subtabs
    5) Criar treino / Histórico

## Validação
- Desktop + mobile:
  - Tooltip nunca vaza; botões quebram para 2 linhas/coluna quando necessário.
  - Tooltip fica ancorado e não sai do viewport.
- Professor:
  - Tour abre Painel de Controle e continua destacando elementos reais.
- Rodar `npm run lint` e `npm run build`.

## Arquivos a alterar
- [GuidedTour.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/onboarding/GuidedTour.js)
- [tourSteps.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/tourSteps.js)
- [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js)
- (se precisar abrir menu automaticamente) [HeaderActionsMenu.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HeaderActionsMenu.js)