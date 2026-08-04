# Auditoria de UX/UI — IronTracks

## 1. Resumo

O foco do dono era **"tamanho de telas / botões vazando"** — e a auditoria confirma esse instinto. Os achados mais graves estão exatamente aí: o **editor de treino do professor (AdminWorkoutEditor) com grade de 6 colunas sem breakpoint** vira inputs de ~18px e fica **inutilizável no celular**, e a **tab bar do dashboard corta rótulos** ("Comunidad", "Avaliaçõe") na largura mais comum de Android pequeno. Esses dois são os representantes diretos da queixa original e abrem a lista de prioridades.

**Avaliação geral honesta:** o app é **visualmente polido e tem identidade forte** — paleta dourada/âmbar consistente como espinha dorsal, cards bem construídos, hierarquia clara. Boa parte dos achados não é "feio", é **inconsistência**: ilhas de azul/roxo/índigo que escapam da marca dourada, e alvos de toque alguns pixels abaixo do mínimo. Nada disso compromete a usabilidade no nível de "o app está quebrado" — exceto os dois casos de responsividade acima. É um produto maduro que precisa de **alinhamento de detalhe**, não de reconstrução.

**Achados por severidade:**
- **High:** 1
- **Medium:** 16
- **Low:** 22
- **Polish:** 4
- **Total:** 43 (agrupados de ~46 brutos)

**Temas principais:**
1. **Off-brand color (azul/roxo/índigo)** — de longe o tema dominante (~20 achados). Azul em editores, roxo em "IA = premium", índigo em banners. Quebra a identidade dourada em telas de alta frequência.
2. **Touch targets abaixo de 44px** — botões de 28px (notas de série, fechar modal, deletar notificação) na tela mais usada (treino ativo) e no header.
3. **Responsividade em telas estreitas (≤360px)** — grids sem breakpoint, rótulos cortados, valores numéricos que estouram cards.
4. **Estados de erro mascarados como "empty state"** — falhas de rede viram "Siga amigos" / "Nenhuma atividade", sem retry, culpando o usuário.
5. **Modais sem max-height/scroll + back nativo Android** — risco de corte com teclado aberto e navegação "presa".

---

## 2. Achados por severidade

### 🔴 HIGH

#### H1. AdminWorkoutEditor: grade de 6 colunas esmaga inputs no mobile
- **Telas/devices:** Editor de treino do professor (StudentDetailPanel, modais do admin). Quebra em todo telefone; crítico em 320–360px.
- **`src/components/AdminWorkoutEditor.tsx:133`**
- **Problema:** `grid grid-cols-6 gap-2` sem breakpoint (Sets, Reps, RPE, Rest, Cad, Método) dentro de card `p-4`. A 360px sobram ~42px/coluna; com `p-2` no input o campo numérico fica ~18–26px — número digitado não aparece inteiro. A coluna Sets (l.134-152) ainda divide espaço com um botão de duplicar. É onde o professor monta o treino: **inutilizável no celular.**
- **Correção:** `grid grid-cols-3 gap-2 sm:grid-cols-6` (ou `grid-cols-2 sm:grid-cols-3 md:grid-cols-6`); reduzir padding para `px-1.5`; mover o botão de duplicar para o header do exercício. **Esforço: M**

---

### 🟠 MEDIUM

#### M1. Cores off-brand sistêmicas (azul/roxo/índigo) — *agrupado*
Tema dominante. Vários componentes de alta frequência fogem da paleta dourada:
- **GlobalDialog** (`src/components/GlobalDialog.tsx:57-66`) — modal de confirmação **app-wide**: tipo 'prompt' todo roxo, 'loading' todo azul, dentro de moldura âmbar. Caso mais sistêmico (um componente visto por todos). → paleta âmbar (`bg-amber-500/15`, `text-amber-400`, botão `bg-amber-500 text-black`). **Esforço: S**
- **NotificationCenter** (`src/components/NotificationCenter.tsx:39-99`) — `TYPE_CONFIG` arco-íris (azul/roxo/índigo/violeta/ciano/rosa). Tela mais "arco-íris" do app. → reduzir a âmbar (neutros), verde (conquistas), laranja (streak), vermelho (avisos); diferenciar por ícone. **Esforço: M**
- **Relatório pós-treino** (`ReportExerciseCard.tsx:209,252,255,265`; `ReportTimePanel.tsx:47,72,96,101`; `ReportSummaryCards.tsx:54,55`; `WorkoutReport.tsx:840`) — azul como destaque sistemático ('1RM est', 'Melhor', painel de tempo) + roxo em 'Análise Inteligente'. Alta frequência. → âmbar/dourado. **Esforço: M**
- **ActiveWorkout** (`ActiveWorkout.tsx:203-236`) — banner 'Prof. no controle' índigo + banner 'editou o treino' azul na tela central. → âmbar. **Esforço: S**
- **ExerciseEditor** (`ExerciseEditor.tsx:255,287,430,443,455`) — toggle Cardio/Força, selects e bloco de vídeo todos azuis no fluxo mais usado. → yellow/amber. **Esforço: S**

#### M2. Botão de excluir notificação só aparece no hover (invisível no touch)
- **Telas/devices:** Dropdown de notificações (sino). Todos os devices touch.
- **`src/components/NotificationCenter.tsx:399-405`**
- **Problema:** `opacity-0 group-hover:opacity-100` — sem hover em WKWebView/Android, fica permanentemente invisível; usuário não consegue apagar notificações. Mesmo visível, `p-1` + ícone 13 = ~21px de alvo.
- **Correção:** sempre visível (`opacity-60` base) + `min-h-[44px] min-w-[44px]`; considerar swipe-to-delete no mobile. **Esforço: S**

#### M3. Botão de Observações das séries com alvo de 28×28px (treino ativo)
- **Telas/devices:** Treino ativo, todos os tipos de série. Todos, pior em <360px.
- **`src/components/workout/set-renderers/normalSet.tsx:548-559`** (repete em clusterSet:166, heavyDutySet:59, groupMethodSet:89, pontoZeroSet:55, forcedRepsSet:55, partialRepsSet:55, waveSet:63, fST7Set:63, dropSetSet:106)
- **Problema:** botão de notas `w-7 h-7` (28px), ícone 12 — bem abaixo de 44px na tela mais usada, com mãos suadas em movimento.
- **Correção:** ≥`h-9 w-9` (36px) ou 44px via padding; **classe compartilhada** entre todos os renderers. **Esforço: M**

#### M4. Classificação de IMC em shade -600 (ilegível no tema escuro) + azul
- **Telas/devices:** Preview de resultados da avaliação. Todos.
- **`src/components/assessment/ResultsPreview.tsx:123-134`**
- **Problema:** `text-blue-600`/`text-gray-600`/`-600` em fundo neutral-900/950 — contraste insuficiente na informação central da tela; azul off-brand.
- **Correção:** shades `-400` (`text-emerald-400`, `text-amber-400`, `text-red-400`); 'baixo' → âmbar; default → `text-neutral-300`. **Esforço: S**

#### M5. WorkoutWizard card 'Por Voz': `text-blue-600/80` ilegível
- **Telas/devices:** Modal de criação de treino (wizard). Todos.
- **`src/components/dashboard/WorkoutWizardModal.tsx:410-421`**
- **Problema:** card inteiro azul (gradiente inline + `text-blue-400`), subtítulo `text-blue-600/80` sobre fundo quase preto — baixa legibilidade e inconsistente com os outros cards do mesmo wizard.
- **Correção:** alinhar ao estilo neutro/âmbar dos demais; subtítulo `text-neutral-400`. **Esforço: S**

#### M6. Falha de envio do chat sem bolha otimista
- **Telas/devices:** Chat direto. Conexão lenta/3G/academia.
- **`src/components/ChatDirectScreen.tsx:449-492`**
- **Problema:** input limpa imediatamente (l.459) mas a bolha só renderiza após o insert no Supabase retornar (l.461). Em rede ruim, o campo esvazia e nada aparece por segundos — parece que a mensagem sumiu. Outras áreas (CommunityClient, NutritionMixer) já usam otimismo de verdade; o chat não.
- **Correção:** inserir bolha 'enviando' com id temporário **antes** do await; trocar pelo id real ao confirmar; em erro marcar 'falhou' com botão **Reenviar**. **Esforço: M**

#### M7. Erro de rede no Ranking vira "Siga amigos" sem retry
- **Telas/devices:** Comunidade › Ranking. Todos.
- **`src/app/(app)/community/LeaderboardPanel.tsx:40-66`**
- **Problema:** `catch {}` silencioso; falha deixa `rankings` null e cai em "Siga amigos para ver o ranking." — culpa o usuário por falha de rede. Sem distinção entre vazio e erro, sem retry.
- **Correção:** estado de erro separado + card "Tentar novamente" que chama `load()`; manter "Siga amigos" só quando carregou vazio. **Esforço: S**

#### M8. Feed da Comunidade: falha vira "Nenhuma atividade" sem retry
- **Telas/devices:** Comunidade › Feed. Todos.
- **`src/app/(app)/community/useCommunityData.ts:217-234`**
- **Problema:** `catch {}` em `loadFeed`; falha deixa `feedItems` `[]` e renderiza EmptyState idêntico ao de sucesso-vazio. Usuário com amigos ativos acha que ninguém treinou.
- **Correção:** adicionar `feedError` ao hook; quando `feedError && vazio`, card de erro com "Recarregar" (`loadFeed(true)`). **Esforço: M**

#### M9. DashboardTabs: até 5 abas em `flex-1` cortam rótulos
- **Telas/devices:** Navegação primária do dashboard. <360px, pior com VIP+Nutrição (5 abas).
- **`src/components/dashboard/DashboardTabs.tsx:47,85-167`**
- **Problema:** `flex-1 ... text-[10px] whitespace-nowrap overflow-hidden` — a 320–360px cada aba tem ~58-62px; "Avaliações"/"Comunidade" são cortados sem reticências ("Comunidad", "Avaliaçõe"). É a navegação mais importante do app. **(Achado central da queixa do dono.)**
- **Correção:** `truncate` no `<span>` (falta ellipsis) OU rótulos curtos em <sm ('Aval.', 'Social') com nome cheio em `sm:`; ou permitir 2 linhas. Validar com 5 itens a 320px. **Esforço: S**

#### M10. Seletor de modo da IA (VipHub) quebra em 2 linhas
- **Telas/devices:** Chat de IA do VIP (Coach/Planner/Diagnóstico). <360px.
- **`src/components/VipHub.tsx:529-547`**
- **Problema:** rótulo `text-[11px] font-black` sem `whitespace-nowrap` — '🔬 Diagnóstico' quebra em 2 linhas a 320px, desalinhando a altura das 3 abas.
- **Correção:** `whitespace-nowrap` (l.545) + `text-[10px]`/`px-1.5` no base, ou 'Diag.' em <sm. **Esforço: S**

#### M11. Back nativo do Android não fecha modais
- **Telas/devices:** Todos os modais full-screen (Config Comunidade, UserProfileModal, chats, CoachChatModal, CardioSessionModal, HistoryList). Android (Capacitor).
- **`src/components/dashboard/CommunityClient.tsx:330-396, 660-665`** (e demais `fixed inset-0`)
- **Problema:** não existe `App.addListener('backButton')` no código. Sem o handler, o Voltar nativo navega a rota anterior ou minimiza o app em vez de fechar o overlay — sensação de "navegação presa".
- **Correção:** handler global de `backButton` com stack de overlays (contexto): se houver overlay aberto, `event.preventDefault` + fecha o topo; só sai da rota quando não há overlay. **Esforço: L**

---

### 🟡 LOW

#### L1. Mais instâncias de azul off-brand — *agrupado*
- `AdminWorkoutEditor.tsx:109` — botão Salvar **verde** (`bg-green-600`) em vez do CTA dourado. **S**
- `AdminWorkoutEditor.tsx:210,215` + `ExerciseEditor.tsx:255-455` — bloco de vídeo todo azul (label/input/link/aba). → âmbar. **S**
- `admin-panel/TeachersTab.tsx:393` — stats 'Treinos' azul / 'Histórico' violeta. → `text-yellow-400`/neutro. **S**
- `nutrition/NutritionWorkoutCorrelation.tsx:135` + `WaterTracker.tsx:78` + `NutritionEntryCard.tsx:251` — azul `#3b82f6` em legendas/botões de água. **M**
- `vip/VipWeeklySummaryCard.tsx:116-140` — roxo (Recordes) + índigo (Sono) dentro de card de header âmbar. **S**
- `assessment/AssessmentListItem.tsx:212` — badge 'Bioimpedância' azul, único da lista. **S**
- `MotivationalPushCard.tsx:138` — estado **default** (o mais comum) em gradiente violeta+azul no topo do dashboard. **S**
- `ProgressPhotos.tsx:502,532` — slot/botão B azul vs A dourado (par incoerente). **S**
- `ExerciseEditor/CardioFields.tsx:61` — `ring-blue-500` no input de tempo vs `ring-yellow-500` no de intensidade ao lado. **S**

#### L2. Padrão "IA = roxo/violeta" espalhado
- **`src/components/dashboard/WeeklyAIReport.tsx:78-208`** (+ VipInsightsPanel:165, VipHub:455-456, WorkoutReport:835-840, MotivationalPushCard)
- **Problema:** tudo que é "IA/insights" é pintado de roxo/violeta — justamente o diferencial premium vendido, roubando a identidade dourada nos pontos de maior destaque.
- **Correção:** tema IA em âmbar; definir 1 token único `ai-accent` para reuso. **Esforço: M**

#### L3. Fragmentação do dourado (amber vs yellow)
- **`src/components/WorkoutShareCard.tsx:123`** (+ dezenas de componentes)
- **Problema:** `#eab308`/`#facc15`/`#fde047`/`#ca8a04` misturados com os amber oficiais. `#eab308` é mais esverdeado e "briga" quando aparece ao lado de `#f59e0b`. Pior caso: o wordmark 'TRACKS' do card que o usuário **posta nas redes**.
- **Correção:** tokens CSS (`--brand-gold:#f59e0b`, `--brand-gold-deep:#d97706`, `--brand-gold-light:#fbbf24`); começar pelo WorkoutShareCard (exposição pública). **Esforço: L**

#### L4. Accent roxo rotativo nos cards de treino
- **`src/components/dashboard/WorkoutCard.tsx:36-41,69,147-148`**
- **Problema:** `accentColors` rotaciona `[yellow, orange, amber, purple]` — todo 4º card de treino ganha borda/gradiente roxo na lista principal do aluno.
- **Correção:** trocar a 4ª entrada por tom da marca (`border-amber-600`/`from-amber-600/5`). **Esforço: S**

#### L5. `text-neutral-600/700` como texto informativo — contraste baixo
- **`src/components/dashboard/IronRankCard.tsx:289-561`** (+ BadgesGallery, RecoveryScore, WorkoutCalendarModal)
- **Problema:** dicas/legendas reais ('Toque para ver o ranking', labels 'Volume') em neutral-700 sobre neutral-900/950 — quase imperceptíveis, pior sob sol. Também inconsistente com lugares que usam neutral-400.
- **Correção:** texto secundário em `text-neutral-400`, legendas mín. `neutral-500`; reservar 600/700 para ícones/divisores/placeholders. **Esforço: M**

#### L6. ReportExerciseCard: nome do exercício sem `min-w-0`/truncate empurra stats
- **`src/components/workout-report/ReportExerciseCard.tsx:196`**
- **Problema:** `<h3 text-xl uppercase>` sem truncate em `flex justify-between`; nomes longos empurram o bloco de stats para fora / quebram feio, agravado pelo badge '🏆 PR'. Estoura a 320px.
- **Correção:** `min-w-0 flex-1` + `truncate` no nome; `shrink-0` nos stats; empilhar abaixo de sm. **Esforço: S**

#### L7. ReportSummaryCards: volume `text-2xl font-mono` estoura card de 2 colunas
- **`src/components/workout-report/ReportSummaryCards.tsx:70`**
- **Problema:** volume de 7 dígitos ('1.301.247') em mono 2xl ocupa ~140px num card de ~118px úteis a 320px — vaza sobre 'kg'.
- **Correção:** `text-xl sm:text-2xl` + `tabular-nums`/`truncate`; ou sufixo '1,3M kg'. **Esforço: S**

#### L8. GymPresenceCard: nome de aluno sem truncate pode estourar
- **`src/components/social/GymPresenceCard.tsx:57-84`**
- **Problema:** `display_name` (l.80) sem truncate/max-w num chip; nome longo empurra o dot de presença para fora em <360px (flex-wrap só quebra entre chips).
- **Correção:** `truncate max-w-[120px]` no nome + `shrink-0` no dot. **Esforço: S**

#### L9. WorkoutCard: título em CAPS sem clamp ocupa 3 linhas
- **`src/components/dashboard/WorkoutCard.tsx:162`**
- **Problema:** h3 `uppercase` sem `line-clamp`; títulos longos quebram em 3+ linhas em iPhone SE, desalinhando subtítulo e botões. (Não é overflow horizontal — `pr-28` protege.)
- **Correção:** `line-clamp-2`. **Esforço: S**

#### L10. DashboardHeader: logo 1.7rem + `px-6` no limite a 320px
- **`src/app/(app)/dashboard/DashboardHeader.tsx:144`**
- **Problema:** conteúdo soma ~293px de 320px; badge VIP (`ml-3`) estoura e é **cortado** por `overflow-x-clip` (l.118) — o clip mascara o aperto.
- **Correção:** `px-4 sm:px-6` e/ou título `text-[1.5rem] sm:text-[1.7rem]`. **Esforço: S**

#### L11. MuscleMapCard: legenda de 5 colunas aperta 'Nenhum'/'Na meta'
- **`src/components/dashboard/MuscleMapCard.tsx:525`**
- **Problema:** `grid-cols-5 gap-1.5` com `p-2` e `text-[10px]`; a 320px sobram ~36px/célula — 'Nenhum'/'Na meta' encostam nas bordas ou quebram, desalinhando alturas.
- **Correção:** `p-1.5`/`text-[9px]`, ou `grid-cols-3 sm:grid-cols-5` + `leading-none`. **Esforço: S**

#### L12. Grid da série encosta badge/notas/inputs com gap de 6px
- **`src/components/workout/set-renderers/normalSet.tsx:529-559`**
- **Problema:** `gap-1.5` (6px) entre badge (long-press muda tipo), botão de notas e input — toques errados disparam o popover de tipo de série ao mirar nas notas/peso, em <360px.
- **Correção:** aumentar gap ou empilhar notas abaixo (como no caso unilateral); alvos 36-44px. **Esforço: M**

#### L13. NutritionMixer: CTAs com 32px de altura (h-8)
- **`src/components/dashboard/nutrition/NutritionMixer.tsx:836-837`** (+ 1051)
- **Problema:** 'Cancelar'/'Salvar'/'Estimar com IA' em `h-8` (32px), abaixo de 44px — CTAs de confirmação merecem alvo maior.
- **Correção:** `h-11` (44px) nos CTAs; mín. `h-10` nos secundários. **Esforço: S**

#### L14. Botões de fechar de modal com 28px
- **`src/components/NotificationCenter.tsx:484-489`** (+ settings/AvatarUploadModal.tsx:153, settings/ChangePasswordModal.tsx:107)
- **Problema:** X de fechar `w-7 h-7` (28px) no topo da tela.
- **Correção:** componente `ModalCloseButton` reutilizável com `min-h-[44px] min-w-[44px]`. **Esforço: S**

#### L15. StoryControlPanel: reset de posições com alvo ~26px
- **`src/components/stories/StoryControlPanel.tsx:136-138`**
- **Problema:** `p-1.5` + ícone 14 (~26px), única forma de desfazer arrastos no modo LIVE.
- **Correção:** `p-2.5` ou botão com label `min-h-[44px]`. **Esforço: S**

#### L16. AccessibleModal sem max-height/scroll
- **`src/components/ui/AccessibleModal.tsx:51-72`**
- **Problema:** centraliza mas não aplica `max-h`/`overflow-y-auto` nem padding no backdrop; com teclado aberto/landscape o conteúdo corta sem rolar (altura delegada ao consumidor).
- **Correção:** `p-4` no backdrop + `max-h-[90vh] overflow-y-auto` no container (ou prop com default seguro). **Esforço: M**

#### L17. ChangePasswordModal/AvatarUploadModal sem max-height
- **`src/components/settings/ChangePasswordModal.tsx:96-98`** (+ AvatarUploadModal:149)
- **Problema:** com teclado virtual aberto, 'Alterar Senha'/header podem ficar fora da viewport sem rolar.
- **Correção:** `max-h-[90vh] overflow-y-auto` no painel. **Esforço: S**

#### L18. Inputs <16px e sem `inputMode` — *agrupado (forms)*
- `HistoryListManualModal.tsx:203,215,222-244` — grids de 4 col em `text-sm`; campos de peso/reps sem `type`/`inputMode` (abre teclado de texto). → `text-base`, `inputMode='numeric'`, `grid-cols-3` em <360px. **S**
- `ExerciseEditor/SetDetailsSection.tsx:98-259` — inputs de série `text-sm` apertados. → `text-base`; `inputMode` explícito. **S**

#### L19. Desafios: criar/aceitar/recusar engole todos os erros
- **`src/app/(app)/community/ChallengesPanel.tsx:75-109`**
- **Problema:** `catch` silencioso em `createChallenge`/`respondChallenge`; falha ou `data.ok=false` não fecha o form e nada é dito — parece que o botão não funcionou.
- **Correção:** tratar `!data.ok`/catch com toast inline; reusar o padrão de toast existente. **Esforço: S**

#### L20. ChatListScreen: empty state com microcopy de dev
- **`src/components/ChatListScreen.tsx:205-212`**
- **Problema:** "Crie usuários para iniciar conversas" — linguagem de admin; aluno final não 'cria usuários'.
- **Correção:** "Siga amigos na Comunidade para conversar aqui." + botão que leva à Comunidade. **Esforço: S**

#### L21. 'Novo Treino' reseta loading por timeout fixo de 900ms
- **`src/components/dashboard/StudentDashboard.tsx:358-411`**
- **Problema:** spinner some após 900ms fixos, não ao fim da ação; em rede lenta o botão volta a 'Novo Treino' com a ação em curso — risco de duplo-clique.
- **Correção:** resetar quando a Promise de `onCreateWorkout` resolver (finally); manter timeout só como fallback (8–10s). **Esforço: M**

#### L22. Volume sempre em toneladas mostra '0.6t' em vez de '600kg'
- **`src/components/body-photo/BodyPhotoCorrelationView.tsx:41,69`**
- **Problema:** sempre `(kg/1000).toFixed(1)+'t'` — 600kg vira '0.6t'. `HistoryList.tsx:276` faz o correto (t só ≥1000kg). Inconsistência de unidade entre telas.
- **Correção:** helper `formatVolume(kg)` compartilhado com a regra do HistoryList; reusar nos relatórios. **Esforço: S**

---

### ⚪ POLISH

#### P1. Histórico: Excluir e Editar adjacentes com gap de 6px (40px cada)
- **`src/components/HistoryList.tsx:282-301`** — ação destrutiva colada à comum (`gap-1.5`, 40px). → 44px + `gap-2.5/gap-3`. **S**

#### P2. Drop-Set: botão 'Abrir' com gap de 4px dos vizinhos
- **`src/components/workout/set-renderers/dropSetSet.tsx:123-143`** — `gap-1` (4px) em linha densa durante o treino. → `gap-2`, notas 36-44px, 'Abrir' `min-h-[44px]`. **S**

#### P3. Escala de z-index inconsistente: GlobalDialog (5000) atrás de overlays (9999)
- **`src/components/GlobalDialog.tsx:79`** — confirm() global pode renderizar atrás de BiometricLock/LoginScreen/Confetti (z-9999): backdrop visível mas botões inalcançáveis. Conflito raro, mas latente. → escala nomeada de z-index; GlobalDialog ≥ maior overlay bloqueante. **M**

---

## 3. Quick wins (esforço S, alto impacto — atacar primeiro)

Atacar nesta ordem maximiza impacto visível com mínimo esforço:

1. **GlobalDialog → âmbar** (M1) — *um* componente conserta o off-brand visto por **todo** usuário em toda confirmação. Melhor relação impacto/esforço da lista.
2. **DashboardTabs: `truncate`/rótulos curtos** (M9) — resolve a queixa direta do dono na navegação principal.
3. **Botão deletar notificação sempre visível + 44px** (M2) — desbloqueia uma função hoje **inacessível** no touch.
4. **VipHub: `whitespace-nowrap` no seletor de modo** (M10) — uma linha conserta o reflow torto.
5. **Ranking: estado de erro + retry** (M7) — para de culpar o usuário por falha de rede.
6. **IMC: shades -400 + tirar azul** (M4) — legibilidade da informação central da avaliação.
7. **WorkoutWizard 'Por Voz' neutro/âmbar** (M5) e **ActiveWorkout banners âmbar** (M1) — telas de alta frequência.
8. **WorkoutCard: `line-clamp-2` + 4ª cor não-roxa** (L9, L4) — duas linhas, lista de treinos consistente.
9. **NutritionMixer CTAs h-11** (L13) e **microcopy do chat** (L20) — toques e clareza.
10. **Volume `formatVolume()` compartilhado** (L22) — corrige '0.6t'.

---

## 4. Roadmap priorizado

**Sprint 1 — Desbloqueio + queixa do dono (responsividade crítica)**
- H1 AdminWorkoutEditor responsivo (M) — *o achado nº1 da queixa "botões vazando"*
- M9 DashboardTabs rótulos cortados (S)
- M2 Deletar notificação no touch (S)
- M10 VipHub seletor de modo (S)
- Quick wins de cor S: M1 (GlobalDialog/ActiveWorkout/ExerciseEditor), M4, M5

**Sprint 2 — Estados de erro + touch targets**
- M6 Chat otimista (M), M7 Ranking retry (S), M8 Feed retry (M), L19 Desafios erros (S)
- M3 Botão de notas das séries → classe compartilhada 44px (M)
- L13 NutritionMixer CTAs (S), L14 ModalCloseButton (S), L15 StoryControlPanel (S)
- L16/L17 Modais max-height/scroll (M/S)

**Sprint 3 — Consistência de marca (sistêmico)**
- L2 Token `ai-accent` (acaba com "IA = roxo") (M)
- M1 NotificationCenter + Relatório pós-treino → âmbar (M)
- L1 Limpeza de azul residual (admin, vídeo, nutrição, badges, A/B) (S–M)
- L3 Tokens de dourado `--brand-gold-*`, começando por WorkoutShareCard (L)
- L4 4ª cor dos cards, L5 contraste neutral-400

**Sprint 4 — Polish + plataforma**
- M11 Back nativo Android (L) — fluxo de navegação, requer stack de overlays
- L6–L11 overflow/responsivo restante (S cada)
- L18 forms text-base/inputMode (S), L21 loading 'Novo Treino' (M), L22 formatVolume (S)
- P1–P3 polish (gaps, z-index scale)

**Nota de cuidado (produção):** M11 (back Android) e P3 (z-index) tocam navegação/overlays globais — testar login, biometria e fluxo de modais em device real antes de mergear. Nenhum achado toca auth, schema ou pagamentos.