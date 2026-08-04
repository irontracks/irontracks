# IronTracks Accessibility Audit (WCAG 2.1 AA)
Data: 2026-05-13

Escopo: auditoria honesta de uso real (mobile-first) — app web Next.js 16 + Capacitor 8.
Método: leitura de código (sem rodar app); `npm run scan:a11y` + `npm run scan:buttons` como baseline; inspeção dirigida em 50+ arquivos críticos (god component do dashboard, modais, listas, charts custom, forms, chat, story composer, biometric lock).
Resultado de scans automatizados: 46 ocorrências de `<div onClick>` inacessível; 63 inputs sem aria-label/id; 2 links com só ícone sem aria-label; 15 avisos no scan de botões. Achados abaixo cobrem o que os scans NÃO pegam.

---

## Resumo executivo

1. **Viewport bloqueia zoom (`userScalable: false`, `maximumScale: 1`) — viola WCAG 1.4.4** (`src/app/layout.tsx:60-67`). Usuários com baixa visão não conseguem fazer pinch-to-zoom em nenhuma tela. Bloqueia uso em produção pra quem precisa ampliar texto.

2. **`AccessibleModal` existe mas é usada por ZERO componentes**; só 5 modais (de ~40) usam `useFocusTrap`. A maioria dos modais (incluindo `BiometricLock`, `IncomingInviteModal`, `UserProfileModal`, todos os 5 modais inline em `DashboardModals.tsx`, e ~20 outros) **não tem focus trap, não fecha com Escape, e/ou falta `role="dialog"` + `aria-modal`**. Usuário de teclado/screen reader fica preso, e o foco vaza pro conteúdo de fundo.

3. **Charts visuais (muscle map, macros, weekly nutrition, recovery score, progress ring) não têm alternativa textual** — sem `role="img"`, sem `aria-label` descrevendo os dados. Cego não tem como saber distribuição de macros, equilíbrio muscular, ou progresso semanal. `BodyMapSvg` usa `<rect onClick>` SVG sem `tabIndex`, sem `role="button"`, sem `aria-label` — músculos não são clicáveis por teclado.

4. **Botões com ícone só + tamanho < 44×44pt em todo o app** (Apple HIG 44pt mínimo). `w-7 h-7` (28px) em `TeamChatDrawer`, `InviteManager`; `w-8 h-8` (32px) em `StoryComposer` header, `ProgressPhotos`, `WhatsNewModal`, `DashboardModals` (fechar completar perfil), `UserProfileModal` (fechar). Hit area pra motor impairment é dolorosa.

5. **`prefers-reduced-motion` não é respeitado em lugar nenhum** (zero ocorrências no codebase). Há ~15 animações ativas (badge slam, button slam, pulse-glow, streak-shake, shimmer, framer-motion, splash-in, toast slide). Usuário com sensibilidade vestibular toma TODAS as animações na cara.

---

## Findings (priorizados)

### F-01. Viewport meta bloqueia zoom — usuário baixa visão fica sem recurso
- **Severidade**: 🔴 bloqueia uso
- **WCAG**: 1.4.4 Redimensionar texto (AA), 1.4.10 Reflow
- **Local**: `src/app/layout.tsx:60-67`
- **O que é**: `viewport = { ..., maximumScale: 1, userScalable: false, viewportFit: 'cover' }` impede pinch-to-zoom em mobile.
- **Quem impacta**: baixa visão (não consegue ampliar texto), idosos.
- **Fix**: remover `maximumScale` e `userScalable` (ou setar `maximumScale: 5, userScalable: true`). O "viewport zoom" iOS é um direito do usuário, não opção do dev.

### F-02. AccessibleModal existe mas não é usada em produção
- **Severidade**: 🟡 dificulta
- **WCAG**: 2.4.3 Ordem do foco (A), 2.1.2 Sem armadilhas de teclado (A)
- **Local**: `src/components/ui/AccessibleModal.tsx` (definido); zero imports no codebase
- **O que é**: existe wrapper com `role="dialog"`, `aria-modal`, focus trap e Escape, mas ninguém usa.
- **Quem impacta**: teclado-only, screen reader.
- **Fix**: refatorar modais mais críticos pra usar AccessibleModal (ver findings F-03 a F-09 pra lista).

### F-03. BiometricLock — gate de entrada do app — sem role=dialog nem aria-modal
- **Severidade**: 🔴 bloqueia uso
- **WCAG**: 4.1.2 Nome, função, valor (A), 1.3.1 Informações e relações (A)
- **Local**: `src/components/BiometricLock.tsx:88-131`
- **O que é**: lock screen full-screen que aparece toda vez que app volta do background, sem `role="dialog"`, sem `aria-modal`, sem focus management. Texto "🔒" / "👆" como emoji (linha 85) sem `aria-label`.
- **Quem impacta**: cego (screen reader não anuncia que é tela de bloqueio), idoso (não entende emoji isolado).
- **Fix**: envelopar em `<div role="dialog" aria-modal="true" aria-labelledby="...">`, dar `aria-label` no ícone, focus inicial no botão "Desbloquear".

### F-04. IncomingInviteModal — interrompe usuário durante treino, sem focus trap nem Escape
- **Severidade**: 🟡 dificulta
- **WCAG**: 2.1.2 Sem armadilhas de teclado (A)
- **Local**: `src/components/IncomingInviteModal.tsx:89-138`
- **O que é**: tem `role="dialog"` e `aria-modal`, mas sem focus trap, sem listener Escape, sem mover foco pra modal quando aparece. Botões "Agora não" / "BORA!" estão acessíveis mas o foco continua onde estava.
- **Quem impacta**: teclado, screen reader.
- **Fix**: usar `useFocusTrap` + Escape handler. Anunciar via `aria-live="assertive"`.

### F-05. UserProfileModal (community) — modal sem nenhuma estrutura semântica
- **Severidade**: 🟡 dificulta
- **WCAG**: 4.1.2 Nome, função, valor (A)
- **Local**: `src/app/(app)/community/UserProfileModal.tsx:52-72`
- **O que é**: `<div className="fixed inset-0 ...">` sem `role="dialog"`, sem `aria-modal`, sem aria-label, sem focus trap, sem Escape (apenas backdrop click). Botão fechar (linha 65-72) com só `<X size={16} />` sem `aria-label`.
- **Quem impacta**: screen reader não anuncia abertura; teclado precisa clicar no X visualmente.
- **Fix**: envelopar com `AccessibleModal` ou copiar padrão dela.

### F-06. DashboardModals — 5 modais inline sem nenhuma a11y
- **Severidade**: 🔴 bloqueia uso (Complete Profile e Import são fluxos críticos)
- **WCAG**: 4.1.2 (A), 3.3.2 Labels ou instruções (A), 1.3.1 (A)
- **Local**: `src/app/(app)/dashboard/DashboardModals.tsx`
  - Linha 207-221: Complete Profile — sem role=dialog, input sem htmlFor label
  - Linha 224-235: Import Workout — sem role, label flutuante (linha 213) sem `htmlFor`
  - Linha 238-251: JSON Import — sem role
  - Linha 253-264: Share Code — sem role
  - Linha 266+: Quick View — sem role, abre com `onClick` em backdrop sem aria-label
- **O que é**: 5 modais zerados em a11y. Inputs sem `<label htmlFor>` associado (só visual `<label>` solta + `<input>` separado). Botões fechar com `<X size={18} />` sem texto alternativo.
- **Quem impacta**: cego (não sabe o que digitar), teclado (foco não trapa).
- **Fix**: trocar `<label className="block ...">Nome de Exibição</label>` por `<label htmlFor="profile-name">`; envelopar em AccessibleModal; adicionar `aria-label` em todos os botões com só ícone.

### F-07. Charts/SVG custom — nenhuma alternativa textual
- **Severidade**: 🔴 bloqueia uso
- **WCAG**: 1.1.1 Conteúdo não-textual (A)
- **Locais**:
  - `src/components/dashboard/nutrition/MacroPieChart.tsx:46-83` — donut chart sem `role="img"` nem aria-label resumindo proteína/carbo/gordura
  - `src/components/dashboard/nutrition/WeeklyChart.tsx:26-67` — barra de 7 dias sem alternativa textual
  - `src/components/MuscleBalanceCard.tsx:67-169` — barras de equilíbrio muscular só com cor; valores ficam só em `<span>` mas o gráfico inteiro não tem `role="img"`
  - `src/components/muscle-map/BodyMapSvg.tsx:139-190` — `<rect onClick>` sem `tabIndex`, sem `role="button"`, sem `aria-label="Selecionar quadríceps"`. Músculos não são clicáveis por teclado/screen reader
  - `src/components/dashboard/MuscleMapCard.tsx:624,744,776` — barrinhas SVG decorativas sem `aria-hidden`
  - `src/components/dashboard/RecoveryScore.tsx:102` — recovery ring sem aria-label
  - `src/components/workout/WorkoutHeader.tsx:132` — progress ring sem texto alternativo (o `{completedSets}/{totalSets}` ao lado salva, mas o ring em si não tem `role="img"`)
  - `src/components/workout-report/ReportMusclePieChart.tsx:83` — pie chart sem fallback
- **Quem impacta**: cego (perde toda a feature de análise muscular/nutricional), baixa visão.
- **Fix**: em cada SVG decorativo `aria-hidden="true"`; em SVG com dados, `<svg role="img" aria-label="Proteína 45%, Carbo 30%, Gordura 25% — total 1800 kcal">`. Pra `BodyMapSvg`, trocar `<rect>` por `<g role="button" tabIndex={0} onKeyDown={...}>` ou hitboxes `<button>` posicionadas absolutamente.

### F-08. Hit area < 44×44pt em botões com ícone só — toque difícil
- **Severidade**: 🟡 dificulta
- **WCAG**: 2.5.5 Tamanho do alvo (AAA — recomendado mas crítico em mobile)
- **Locais (amostras)**:
  - `src/components/StoryComposer.tsx:200,213` — botão fechar `w-8 h-8` (32px) com ícone `size={16-18}`
  - `src/components/ProgressPhotos.tsx:213` — fechar 32×32
  - `src/components/InviteManager.tsx:277` — fechar 32×32
  - `src/components/TeamChatDrawer.tsx:149` — fechar `w-7 h-7` (28px)
  - `src/components/WhatsNewModal.tsx:69` — fechar `w-10 h-10` (40px, ok-ish mas no limite)
  - `src/components/workout/set-renderers/normalSet.tsx:463-475` — botão "Obs" `h-7` (28px)
  - `src/app/(app)/dashboard/DashboardModals.tsx:211` — fechar `w-9 h-9` (36px)
- **Quem impacta**: motor (tremores, parkinson, idoso), uso desktop com touchpad impreciso.
- **Fix**: subir todos os botões fechar/ícones-only para `min-w-[44px] min-h-[44px]`. Em casos de extrema densidade visual (lista de stickers, ferramentas inline), usar pelo menos `w-11 h-11` (44px).

### F-09. Forms sem `<label htmlFor>` — só `aria-label` (ok pra SR mas não conecta visual)
- **Severidade**: 🟡 dificulta
- **WCAG**: 3.3.2 Labels ou instruções (A), 1.3.1 (A)
- **Locais (amostras representativas, padrão é repetido)**:
  - `src/components/ProgressPhotos.tsx:280-293` — peso input só com `aria-label`, sem `<label htmlFor>`
  - `src/app/marketplace/MarketplaceClient.tsx:663-682` — 3 inputs (nome, telefone, CPF) sem `<label>` nenhum, só `placeholder`
  - `src/components/CardioSessionModal.tsx:276` — textarea sem label
  - `src/app/(app)/community/CommunityClient.tsx:312-318` — search field só `aria-label` (ok pra SR mas ícone Search visual sem texto)
  - `src/components/dashboard/IronRankCard.tsx:307-309` — `<div role="button" tabIndex={0}>` simulando button (preferir `<button>`)
- **Quem impacta**: cognitivo (esquece o que era o campo quando o placeholder some), cego (depende do `aria-label` ser preciso, frequentemente está mas é genérico).
- **Fix**: pra cada input crítico (todo o marketplace, perfil, foto), adicionar `<label htmlFor={id}>Texto</label>` visualmente próximo. Não usar placeholder como label.

### F-10. Modais usam `<h3>` direto sem h1/h2 — pula níveis
- **Severidade**: 🟡 dificulta
- **WCAG**: 1.3.1 Informações e relações (A), 2.4.6 Headings e labels (AA)
- **Locais (amostras)**:
  - `src/app/(app)/dashboard/DashboardModals.tsx:210,227,242,258,302,431,447,489,541` — todos `<h3>`
  - Outros modais usam `<div className="font-black">` em vez de heading (ex: `SettingsModal.tsx:233`, `UserProfileModal.tsx:64`).
- **O que é**: modais usam `<h3>` sem h1/h2 ancestral OR usam `<div>` formatado como título (não navegável por SR).
- **Quem impacta**: screen reader (navegação por headings pula níveis e perde orientação).
- **Fix**: dentro do contexto de modal, usar `<h2>` como heading do dialog (ou `<h1>` se for full-screen como BiometricLock). Garantir `aria-labelledby` do dialog aponta pra esse heading.

### F-11. Texto `text-neutral-500` / `text-neutral-600` em fundo escuro — contraste falha
- **Severidade**: 🔴 bloqueia uso (em texto pequeno)
- **WCAG**: 1.4.3 Contraste mínimo (AA — 4.5:1 texto normal, 3:1 texto grande)
- **Locais (uso amplo, exemplos)**:
  - `text-neutral-500` (#737373) em `bg-neutral-950` (#0a0a0a) → contraste **~4.2:1** — falha texto normal AA
  - `text-neutral-600` (#525252) em `bg-neutral-950` → contraste **~2.5:1** — falha texto normal E grande
  - `text-neutral-700` (#404040) em fundo escuro → contraste **~1.8:1** — falha tudo
- **Onde dói mais**:
  - `src/components/workout/normalSet.tsx:436-449` — labels "Peso (kg)", "Reps", "RPE" em `text-neutral-500` (3.5:1 estimado)
  - `src/components/workout/Modals.tsx` — todos os labels e descrições secundárias em `text-neutral-500/600`
  - `src/components/ProfilePage.tsx:288,333,366` — texto explicativo abaixo de campos `text-neutral-500`
  - `src/components/dashboard/IronRankCard.tsx:289-290` — "Toque para ver o ranking" em `text-neutral-700` (1.8:1 — invisível em baixa visão)
  - `placeholder:text-neutral-600` em quase todos inputs
- **Quem impacta**: baixa visão, idoso, uso em sol direto.
- **Fix**: subir textos secundários para no mínimo `text-neutral-400` (#a3a3a3 → ~7:1) ou `text-neutral-300` em fundo neutral-950. Reservar `text-neutral-500` apenas pra disabled/decorativo.

### F-12. `prefers-reduced-motion` não respeitado — animação obrigatória
- **Severidade**: 🟡 dificulta
- **WCAG**: 2.3.3 Animação por interação (AAA), 2.2.2 Pausar/parar/esconder (A)
- **Local**: `src/app/globals.css` (zero `@media (prefers-reduced-motion)`)
- **Animações em loop infinito sem opt-out**: `streak-fire` (rotate+scale), `shimmer-sweep`, `aurora-pulse`, `badgeGlow`, `pulse-glow`, `gold-flow`, `btn-shimmer-sweep`, `splash-in` (LoadingScreen), `framer-motion` em IronRankCard, GuidedTour, MuscleMapCard, etc.
- **Quem impacta**: sensibilidade vestibular (vertigem), TDAH, fotossensibilidade epiléptica (animações com pulse rápido).
- **Fix**: adicionar bloco global no `globals.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
  E `framer-motion`: usar `useReducedMotion()` hook.

### F-13. `<div onClick>` / `<span onClick>` sem teclado — 46 ocorrências confirmadas pelo scan
- **Severidade**: 🔴 bloqueia uso
- **WCAG**: 2.1.1 Teclado (A), 4.1.2 (A)
- **Local**: 46 ocorrências relatadas por `npm run scan:a11y`. Exemplos:
  - `src/app/(app)/dashboard/DashboardModals.tsx:273,275` — backdrop clicável `<div onClick>`
  - `src/app/(app)/community/UserProfileModal.tsx:53` — backdrop
  - Dezenas mais em chat, charts, listas
- **O que é**: divs/spans com onClick sem `role="button"`, `tabIndex={0}` ou `onKeyDown`. Não focáveis, não acessíveis por teclado.
- **Quem impacta**: teclado-only (usuários motor), screen reader, automação de testes.
- **Fix**: para backdrops, padrão já está em alguns lugares (`role="button" tabIndex={-1}` ou `0`). Padronizar usando AccessibleModal que já lida com isso, ou usar `<button>` para cliques verdadeiros.

### F-14. 63 inputs sem id nem aria-label — invisíveis pra screen reader
- **Severidade**: 🔴 bloqueia uso
- **WCAG**: 3.3.2 (A), 4.1.2 (A)
- **Local**: 63 ocorrências confirmadas pelo scan. Exemplos críticos:
  - `src/app/(app)/dashboard/DashboardModals.tsx:214,228` — inputs em modais críticos sem `aria-label`
  - `src/app/marketplace/MarketplaceClient.tsx:665-682` — 3 inputs de checkout sem `aria-label` nem `<label>`
- **Fix**: rodar `npm run scan:a11y`, corrigir cada um. Adicionar `aria-label="..."` ou `<label htmlFor="...">` com texto descritivo.

### F-15. Loading states sem `aria-busy` — SR não sabe que página carrega
- **Severidade**: 🟡 dificulta
- **WCAG**: 4.1.3 Status messages (AA)
- **Local**: apenas 2 ocorrências de `aria-busy` no codebase (`LoginScreen.tsx:488`, `StoryControlPanel.tsx:133`). Listas críticas como `HistoryList`, `CommunityClient`, `MuscleMapCard`, `ProfilePage` mostram `<Loader2 spin>` sem `aria-busy="true"` na seção.
- **Quem impacta**: cego (não sabe que tem que esperar; pode tentar interagir com elementos que ainda nem renderizaram).
- **Fix**: nas seções com loading, adicionar `<section aria-busy={loading} aria-live="polite">...</section>` ou `<div role="status" aria-live="polite">Carregando histórico</div>` durante a espera.

### F-16. Story Composer e tela de chat — vídeos sem captions/descrição
- **Severidade**: 🟡 dificulta
- **WCAG**: 1.2.2 Legendas (A), 1.2.3 Audiodescrição (A)
- **Local**: `src/components/ChatDirectScreen.tsx:646` (eslint-disable explícito `media-has-caption`), `src/components/StoryComposer.tsx:226-234`
- **O que é**: vídeos user-generated sem track de captions, sem descrição. Auto-play em modal/composer.
- **Quem impacta**: surdo, deficiência auditiva.
- **Fix**: difícil em produção (conteúdo gerado pelo usuário). No mínimo: `<video aria-label="Vídeo enviado por <nome>" />` e oferecer captura de texto opcional ao usuário ao postar.

### F-17. Skip link existe mas só aponta pra `#main-content` — sem skip-to-content em rotas profundas
- **Severidade**: 🟢 cosmético
- **WCAG**: 2.4.1 Pular blocos (A)
- **Local**: `src/app/layout.tsx:92` — skip link ok no root, mas nas rotas dinâmicas (`(app)/dashboard`) que renderizam dentro de `<main id="main-content">`, ao mudar de view (community → workout → admin) o foco não vai pro novo conteúdo.
- **Fix**: ao navegar entre views (`useViewNavigation`), fazer `mainRef.current?.focus()` ou rolar pra topo. Adicionar `tabIndex={-1}` no `<main>` para permitir focus programático.

### F-18. Landmarks ausentes na maior parte do app
- **Severidade**: 🟡 dificulta
- **WCAG**: 1.3.1 Informações e relações (A), 2.4.1 Pular blocos (A)
- **Local**: `<nav>` aparece só em 3 lugares; `<aside>` zero; `<footer>` 2 ocorrências. Todo o god component do dashboard, sidebars, headers de modal usam `<div>`.
- **Quem impacta**: screen reader (não consegue pular pra navegação, pra sidebar, etc).
- **Fix**: em `DashboardHeader.tsx`, envelopar o header em `<header role="banner">`. Em `AdminPanelBottomTabs.tsx` (já usa `<nav>`) — bom. Marcar sidebars como `<aside>`.

### F-19. Botões com texto só "<X>" / "Cancelar" sem contexto
- **Severidade**: 🟢 cosmético
- **WCAG**: 2.4.4 Propósito do link (A) / 2.4.6 (AA)
- **Local**: `src/app/(app)/community/UserProfileModal.tsx:65-72` botão fechar com `<X size={16} />` sem `aria-label` (a maioria dos outros modais tem; esse esqueceu).
- `src/app/(app)/dashboard/DashboardModals.tsx:230,248,261,328,392,...` — botões "Cancelar" sem contexto do que cancelam (SR anuncia só "Cancelar, botão").
- **Fix**: `aria-label="Cancelar importação de treino"` etc.

### F-20. Imagens decorativas sem `alt=""` ou `aria-hidden`
- **Severidade**: 🟢 cosmético
- **WCAG**: 1.1.1 (A)
- **Local**: emojis em `GuidedTour.tsx:232` usam `aria-hidden="true"` corretamente (bom!). Mas em outros lugares emojis estão soltos: `src/components/IncomingInviteModal.tsx:134` botão "BORA! 💪" — texto puro vira parte do label, ok. `src/components/BiometricLock.tsx:85` `iconLabel = '👆'` sem aria-hidden.
- **Local crítico**: `src/app/(app)/dashboard/DashboardHeader.tsx:123` — `<img src="/header-dumbbell.png" alt="" />` decorativo correto, mas o `<h1>` que segue usa estilização CSS pra dividir "IRON" (branco) + "TRACKS" (amarelo) — screen reader lê "IRONTRACKS" como uma palavra (correto).
- **Fix**: revisar emojis informativos vs decorativos. Adicionar `aria-hidden="true"` nos decorativos.

### F-21. Body Map SVG (muscle-map) — rects clicáveis inacessíveis por teclado
- **Severidade**: 🔴 bloqueia uso da feature
- **WCAG**: 2.1.1 Teclado (A)
- **Local**: `src/components/muscle-map/BodyMapSvg.tsx:139-190`
- **O que é**: 24+ `<rect onClick={() => onSelect?.('chest')}>` SVG sem `tabIndex`, `role="button"`, `aria-label`, `onKeyDown`. Feature inteira de "tocar no músculo pra ver detalhes" não funciona com teclado/screen reader.
- **Quem impacta**: cego, teclado-only.
- **Fix**: trocar cada `<rect>` por `<rect tabIndex={0} role="button" aria-label="Selecionar peitoral" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect('chest') }} focusable="true">`. OU sobrepor `<button>` HTML com `position: absolute` nos mesmos retângulos.

### F-22. RestTimerOverlay full-screen finished — bloqueia interação sem aviso
- **Severidade**: 🟡 dificulta
- **WCAG**: 4.1.3 Status messages (AA)
- **Local**: `src/components/workout/RestTimerOverlay.tsx:516-537`
- **O que é**: quando timer termina, aparece flash full-screen verde/azul com "BORA!"/"TROCA!" usando `role="presentation"` (linha 518), o que faz screen reader NÃO anunciar. Mas o overlay captura toque (pointer events) e ofusca a tela.
- **Quem impacta**: cego (não sabe que terminou); pode ser confundido com "tela travou".
- **Fix**: trocar `role="presentation"` por `role="alert"` ou `role="status" aria-live="assertive"` no container; manter o pointer capture para evitar taps acidentais.

### F-23. NotificationToast usa `role="button"` no container inteiro — confunde SR
- **Severidade**: 🟢 cosmético
- **WCAG**: 4.1.2 (A)
- **Local**: `src/components/NotificationToast.tsx:153-163`
- **O que é**: `<div role="button" tabIndex={0} aria-label="Fechar notificação">` no toast inteiro, MAS dentro ainda tem um `<button aria-label="Fechar notificação">` separado (linha 191-198). Dois "Fechar notificação" no mesmo card.
- **Fix**: remover `role="button"` do container ou alterar label do externo para "Notificação: <senderName> - <text>". Usar `role="status" aria-live="polite"` no container.

### F-24. `<input type="date">` em iOS — formato `dd/mm/aaaa` esperado pelo usuário, recebe ISO
- **Severidade**: 🟢 cosmético
- **WCAG**: 1.3.5 Identificar propósito do input (AA)
- **Local**: `src/components/LoginScreen.tsx:217-225`
- **O que é**: `type="date"` mostra picker nativo, OK. Mas falta `autoComplete="bday"` pra identificar propósito.
- **Fix**: adicionar `autoComplete="bday"`.

---

## Pontos sãos validados

- **Root `<html lang="pt-BR">`** (`src/app/layout.tsx:73`) — language declarada corretamente.
- **Skip link funcional** (`src/app/layout.tsx:92`) — sr-only com focus visible em yellow.
- **Focus-visible global ring** (`src/app/globals.css:233-253`) — outline gold em buttons, links, inputs. Boa cobertura mesmo com `focus:outline-none` em inputs (o `:focus-visible` no globals reaplica).
- **ToastProvider tem `aria-live="polite"`** (`src/contexts/ToastContext.tsx:69`).
- **ActionToast tem `role="status" aria-live="polite"`** (`src/components/ui/ActionToast.tsx:39-41`).
- **GlobalDialog tem `aria-live="assertive"` region + focus trap** (`src/components/GlobalDialog.tsx:82-83`).
- **LoginScreen tem aria-label, aria-required, aria-invalid, aria-describedby em todos os campos** — exemplar (`src/components/LoginScreen.tsx:198-417`).
- **Inputs de série de treino têm `aria-label="Peso em kg – série N"`** etc. (`src/components/workout/set-renderers/normalSet.tsx:511-540`) — bom.
- **GuidedTour suporta Escape, ArrowLeft/Right, Enter** (`src/components/onboarding/GuidedTour.tsx:70-86`) e tem `role="dialog"`/`aria-modal` (linha 140-142).
- **`<input type="email"> autoComplete="username"`, `autoComplete="current-password"`** em LoginScreen — best practice iOS Keychain.
- **Inputs numéricos têm `inputMode="decimal"`/`"numeric"`** em séries de treino e OTP — teclado correto no iOS.
- **`touch-action: manipulation` global** (`globals.css:147-149`) — elimina tap delay 300ms.
- **AccessibleModal e useFocusTrap implementados** — só não estão sendo usados (ver F-02).
- **DashboardHeader botão home tem `aria-label="Voltar ao dashboard"`** e `focus-visible:ring-2`.
- **Progress photos com `alt={KIND_LABELS[photo.kind]}`** — alt descritivo.

---

## Áreas não cobertas

- **VoiceOver iOS / TalkBack Android em device real** — não testado (requer build native + dispositivo). Recomenda-se sessão de teste real com `npm run cap:sync && npm run ios:release` + VoiceOver ligado, focando: fluxo de login, treino ativo (séries), comunidade (feed), chat, configurações.
- **Lighthouse/axe-core em runtime** — scan estático não captura problemas de cor calculados em runtime, contraste real em estados (hover, active, disabled), nem ARIA dinâmico. Recomenda-se rodar `npx @axe-core/cli http://localhost:3000` ou plugin Lighthouse depois de aplicar fixes.
- **Componentes admin-panel/teacher** — não auditados em profundidade (auditoria focou no user-facing).
- **Onboarding completo (signup + OTP WhatsApp + verificação)** — só LoginScreen visto; fluxo end-to-end com leitor de tela não testado.
- **Print/PDF reports** (`@media print` em globals.css:531) — não auditados; reports VIP exportados para PDF podem ter problemas próprios de a11y (struct PDF, tags).
- **Erro de teclado em iOS WebKit** (zoom-on-focus < 16px font-size) — vários inputs usam `text-sm` (14px), o que faz iOS Safari fazer zoom indesejado ao focar. Considerar usar 16px+ em inputs.
- **Reports do HistoryListPeriodReportModal** — chart `<svg width={width} height={height}>` (linha 53) não auditado pra alternativa textual.
- **Capacitor plugins nativos** (Push, Biometric, HealthKit) — interação com sistema operacional fica a cargo do iOS/Android; auditoria foca na camada web.

---

## Recomendações de priorização

**Sprint 1 (1-2 semanas, fix bloqueia uso real)**:
- F-01 (viewport zoom) — 5 min
- F-11 (contraste neutral-500/600) — substituição global, ~2h
- F-12 (prefers-reduced-motion) — CSS global, 30 min
- F-13 + F-14 (scan a11y já lista 109 ocorrências) — 1 dia
- F-07/F-21 (charts e BodyMapSvg) — 1-2 dias

**Sprint 2 (focus management)**:
- F-02 — refatorar 5-10 modais críticos pra AccessibleModal
- F-03/F-04/F-05/F-06 — adicionar role=dialog, focus trap, Escape
- F-17 — focus restore ao mudar de view

**Sprint 3 (touch + minor)**:
- F-08 — auditoria visual de todos os botões w-7/w-8/w-9
- F-09/F-10 — labels + heading hierarchy
- F-15 — aria-busy em listas
- F-18 — landmarks

**Validação contínua**:
- Adicionar `npm run scan:a11y` no pre-commit (atual `lint-staged` só roda eslint)
- E2E test do tour + login com `@axe-core/playwright`
- Testar com VoiceOver + TalkBack a cada release no TestFlight
