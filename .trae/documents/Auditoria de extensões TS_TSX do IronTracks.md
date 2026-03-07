## Escopo e Regras de Classificação
- Varredura feita em: `src/`, `scripts/`, `public/`, raiz do projeto, `claude/src/` e `_archive/duplicates/`.
- Diretórios ignoráveis para “código do app” (mas ainda listados no relatório): `_archive/duplicates/` e `claude/` (conteúdo auxiliar/backup).
- Critério:
  - Arquivo com JSX → deve ser `.tsx`.
  - Arquivo sem JSX → deve ser `.ts` (ou `.js/.mjs/.cjs` se for script Node).

## Estatísticas (medidas por extensão)
- **`src/` (código do app)**
  - `.tsx`: **100**
  - `.ts`: **201**
  - `.js/.jsx`: **0**
  - **Conformidade TypeScript por extensão em `src/`: 100%**
- **`scripts/` (scripts Node/testes)**
  - `.js`: **5**
  - `.cjs`: **11**
  - `.mjs`: **2**
  - `.ts/.tsx/.jsx`: **0**
- **`public/`**
  - `.js`: **1** (`public/sw.js`)
- **Raiz do projeto**
  - `.ts`: **2** (`middleware.ts`, `capacitor.config.ts`)
  - `.d.ts`: **1** (`next-env.d.ts`)
  - `.mjs`: **3** (`next.config.mjs`, `eslint.config.mjs`, `postcss.config.mjs`)
- **`claude/src/` (auxiliar)**
  - Total: **9** (8 TypeScript + 1 JavaScript)

## Achados (inconsistências reais)
### 1) Arquivos `.tsx` sem JSX (devem ser `.ts`)
Estas ocorrências **não têm JSX** (são rotas/utilitários com strings HTML), então a extensão correta é `.ts`.
- [route.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/report/route.tsx) → **trocar para** `.ts`
- [buildHtml.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/buildHtml.tsx) → **trocar para** `.ts`
- [templates.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/templates.tsx) → **trocar para** `.ts`
- [generatePdf.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/generatePdf.tsx) → **trocar para** `.ts`
- [buildPeriodReportHtml.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/buildPeriodReportHtml.tsx) → **trocar para** `.ts`

Recomendação: renomear para `.ts` para evitar:
- tooling confuso (linters/TSX parsing),
- heurísticas de “component detection” erradas,
- import paths divergentes quando refatorar.

### 2) Inconsistência de nomenclatura/estrutura (diretório com espaço)
- [canonicalize 2/backfill/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/admin/exercises/canonicalize%202/backfill/route.ts)
  - Extensão está ok (`.ts`), mas **nome do diretório** contém espaço e “2” (padrão típico de arquivo duplicado/“save as”).
  - Recomendações (prioridade alta):
    - Se for duplicado acidental: remover endpoint.
    - Se for versão nova deliberada: renomear para algo estável (ex.: `canonicalize-v2/`), e ajustar imports/rotas.

### 3) JS em diretório auxiliar `claude/src/`
- [featureFlags.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/claude/src/utils/featureFlags.js)
  - Se esse diretório for mantido como referência, recomenda-se migrar para `.ts` ou mover para `_archive/`.

### 4) Duplicatas em `_archive/duplicates/`
- Existem dezenas de arquivos com sufixos `" 2"`, `" 3"` e extensões mistas (`.js`, `.ts`, `.tsx`).
- Como é um diretório de arquivo morto, isso não afeta o app, mas afeta auditorias automatizadas.

## Inventário: componentes React do app (`src/`)
### Componentes em `src/components/` (todos `.tsx`, portanto corretos)
- [ActiveWorkout.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.tsx) → **OK (.tsx)**
- [WorkoutReport.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/WorkoutReport.tsx) → **OK (.tsx)**
- [OfflineSyncModal.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/OfflineSyncModal.tsx) → **OK (.tsx)**
- [NotificationCenter.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/NotificationCenter.tsx) → **OK (.tsx)**
- [LoginScreen.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/LoginScreen.tsx) → **OK (.tsx)**
- [HistoryList.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.tsx) → **OK (.tsx)**
- [ExerciseEditor.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ExerciseEditor.tsx) → **OK (.tsx)**
- [CoachChatModal.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/CoachChatModal.tsx) → **OK (.tsx)**
- [ChatScreen.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ChatScreen.tsx) → **OK (.tsx)**
- [ChatDirectScreen.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ChatDirectScreen.tsx) → **OK (.tsx)**
- [ExecutionVideoCapture.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ExecutionVideoCapture.tsx) → **OK (.tsx)**
- [ErrorBoundary.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ErrorBoundary.tsx) → **OK (.tsx)**
- [SettingsModal.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/SettingsModal.tsx) → **OK (.tsx)**
- [AdminPanelV2.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/AdminPanelV2.tsx) → **OK (.tsx)**
- [TeamRoomCard.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/TeamRoomCard.tsx) → **OK (.tsx)**
- [VipHub.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/VipHub.tsx) → **OK (.tsx)**
- [WelcomeFloatingWindow.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/WelcomeFloatingWindow.tsx) → **OK (.tsx)**
- [StoryComposer.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/StoryComposer.tsx) → **OK (.tsx)**
- (demais arquivos `.tsx` em `src/components/` também estão OK; lista completa foi usada para contagem: 63 arquivos)

### Componentes em `src/components/` sem JSX (corretos como `.ts`)
- [ServiceWorkerRegister.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ServiceWorkerRegister.ts) → **OK (.ts)** (componente “headless”, retorna `null`)
- [RealtimeNotificationBridge.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/RealtimeNotificationBridge.ts) → **OK (.ts)** (retorna `null`)

### App Router (`src/app/`) com JSX (corretos como `.tsx`)
- Lista completa (30):
  - [page.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/page.tsx)
  - [layout.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/layout.tsx)
  - [error.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/error.tsx)
  - [global-error.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/global-error.tsx)
  - [not-found.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/not-found.tsx)
  - [icon.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/icon.tsx)
  - [opengraph-image.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/opengraph-image.tsx)
  - [DashboardClientEntry.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/DashboardClientEntry.tsx)
  - [IronTracksAppClientImpl.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClientImpl.tsx)
  - [ScheduleClient.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/schedule/ScheduleClient.tsx)
  - [MarketplaceClient.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/marketplace/MarketplaceClient.tsx)
  - (demais páginas `.tsx` do `src/app/` estão OK; 1 exceção: `api/report/route.tsx` listada acima como incorreta)

### Providers/contexts React (corretos como `.tsx`)
- [DialogContext.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/contexts/DialogContext.tsx)
- [TeamWorkoutContext.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/contexts/TeamWorkoutContext.tsx)
- [InAppNotificationsContext.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/contexts/InAppNotificationsContext.tsx)

## Inventário: JavaScript existente fora do app
- `scripts/` (Node):
  - `.js`: `e2e/deload.e2e.js`, `test-deload-calculation.js`, `test-story-validation.js`, `test-trimming.js`, `validate-media-logic.js`
  - `.cjs`: 11 arquivos de smoke tests
  - `.mjs`: `ensure-next-compiled-commander.mjs`, `feature-flags-report.mjs`
- `public/`:
  - `sw.js`

## Prioridade das correções
- **P0 (corrigir já)**
  - Renomear os 5 arquivos `.tsx` sem JSX para `.ts` (evita confusão de tooling e mantém regra consistente).
  - Resolver o diretório `canonicalize 2/` (normalmente duplicata acidental; risco de rotas duplicadas e manutenção confusa).
- **P1 (higiene do repositório)**
  - Decidir o destino de `claude/src/` (migrar JS → TS ou mover para `_archive/`).
- **P2 (opcional)**
  - Limpar/compactar `_archive/duplicates/` ou garantir que auditorias o ignorem.

## Plano de execução (após sua confirmação)
1) Renomear os 5 arquivos `.tsx` sem JSX para `.ts` e ajustar todos os imports.
2) Resolver `src/app/api/admin/exercises/canonicalize 2/`:
   - verificar se é duplicata (comparar com `canonicalize/backfill/`),
   - remover ou renomear para `canonicalize-v2/` e ajustar rotas.
3) Rodar validação: `tsc --noEmit` e `next build` para garantir que nada quebre.
4) (Opcional) Ajustar auditoria/estrutura de `claude/` e `_archive/duplicates/`.

Se você aprovar, eu aplico as correções P0 imediatamente (renomes + ajustes de imports) e valido o build.