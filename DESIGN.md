# IronTracks — Inventário UI/UX

> Documento técnico do estado atual do design do app, escrito como input para um redesign assistido por Claude Design. **O objetivo é evoluir, não recriar.** O DNA visual (gold + dark + italic black branding) deve ser preservado; tudo o mais (componentes, padrões, tokens) está aberto para refinamento.
>
> **Stack:** Next.js 16 · React 19 · TypeScript strict · Tailwind v4 · Capacitor 8 (iOS/Android) · Supabase. App roda em web (Vercel) e mobile híbrido (Capacitor) com a **mesma codebase** — paridade de UX é um requisito, não uma escolha.

---

## 1. Identidade visual e tom

### 1.1 Marca
- **Wordmark:** `IRONTRACKS` em **italic + font-black (900)**, letterSpacing -0.04em, ~1.7rem em mobile.
- **Logo:** halter 3D dourado (`/public/header-dumbbell.png`, 32×32 PNG) com `filter: drop-shadow(0 0 6px rgba(245,158,11,0.55))` — glow gold sempre.
- **Tagline (não visível na UI ainda, está só em metadata):** "SISTEMA DE ALTA PERFORMANCE".

### 1.2 Cor da marca
**Gold/Amber é a cor principal.** Não é decoração — é a personalidade. Aparece em ~70% dos CTAs, badges, headers, focus states.

```
Gradient principal:
linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)

Glow forte (usado em hover/celebração):
0 0 40px rgba(234, 179, 8, 0.28)
```

### 1.3 Tom de voz
Curto, agressivo, motivacional, premium. Nada de UX writing acolhedor/explicativo demais. Exemplos da copy atual:
- `Concluído` (não "Você concluiu!")
- `Iniciar Treino` (não "Vamos lá começar")
- `PENDENTES`, `OFFLINE`, `SISTEMA` em caps
- Toast de PR: `TRIPLE PR!` (nada sutil)
- Badges: `LADO L`, `LADO R`, `NORMAL`, `DROP`, `VIP`

**Princípio para evoluir:** se a copy soar como app de meditação, está errado. O usuário-alvo é alguém que treina pesado e quer feedback imediato e direto.

### 1.4 Modo
**Dark only.** Não há modo claro. Tentativa de luz única é em PDFs gerados (white background forçado em print stylesheet). Manter dark como única opção é decisão deliberada — mudar isso requer discussão de produto.

---

## 2. Design tokens

### 2.1 Sistema de cores

**Brand (gold/amber) — usar com intenção:**
| Token | Hex | Uso |
|---|---|---|
| `yellow-500` | `#fbbf24` | Primário (CTAs, badges, highlights) |
| `amber-600` | `#d97706` | Variante mais quente |
| `amber-400` | `#fbbf24` | Iconografia interativa |
| Gold gradient | gradient acima | Botão principal "Iniciar Treino", celebração de PR |

**Estados semânticos:**
| Estado | Cor base | Usado em |
|---|---|---|
| Sucesso / concluído | `emerald-500` | Set done, exercício completo, badge ✓ |
| Aviso / pendente | `yellow-500` | Sync pendente, série não-feita |
| Erro / destrutivo | `red-500` | "Parar", danger buttons, erros |
| Informativo / neutro | `blue-500` | Lado L (unilateral), focus rings |
| Acento secundário | `orange-500` | Lado R (unilateral), warning soft |

**Backgrounds (profundidade):**
```css
.bg-depth-0 { background: #0a0a0a; }   /* page base */
.bg-depth-1 { background: #0f0f0e; }   /* warm black, cards */
.bg-depth-2 { background: #151514; }   /* elevated cards */
.bg-depth-3 { background: #1a1a18; }   /* modals, popovers */
```

**Bordas e divisórias:** `neutral-700` (forte), `neutral-800` (sutil), `neutral-700/80` (com opacidade).

### 2.2 Tipografia

**Família única:** Inter (Google Fonts, swap, var `--font-inter`). Importada em `src/app/layout.tsx:10-19`.

**Pesos em uso:**
| Peso | Uso |
|---|---|
| `font-black` (900) | Wordmark, badges, números grandes (timer), CTAs |
| `font-bold` (700) | Buttons, títulos secundários |
| `font-medium` (500) | Raro |
| `font-normal` (400) | Body text, descrições |

**Escala responsiva (custom utilities em `src/app/globals.css:458-462`):**
```css
.text-title-hero  { font-size: clamp(1.75rem, 5vw, 2.5rem); }
.text-title-lg    { font-size: clamp(1.25rem, 3.5vw, 1.75rem); }
.text-title-md    { font-size: clamp(1rem, 2.5vw, 1.25rem); }
.text-title-sm    { font-size: clamp(0.8125rem, 2vw, 0.9375rem); }
.text-body-lg     { font-size: clamp(0.875rem, 2vw, 1rem); }
```

**Padrão de label/badge:** uppercase, `tracking-widest` (0.18em–0.25em), `text-[9px]`, `text-[10px]` ou `text-[11px]`. Cor `text-neutral-500` quando inativo, cor temática quando ativo.

### 2.3 Espaçamento e formas

| Categoria | Padrão | Variante |
|---|---|---|
| Padding card | `p-3` (12px) ou `p-4` (16px) | `px-2.5 py-2` em rows estreitas |
| Gap entre cards | `gap-3` (12px) ou `gap-4` (16px) | `space-y-1` em listas densas |
| Border radius | `rounded-xl` (12px) padrão, `rounded-2xl` (16px) modais | `rounded-full` em pills/badges |
| Largura mínima toque | 44px (iOS HIG) | `min-h-9` ou `min-h-11` |

### 2.4 Safe areas (Capacitor iOS)

Obrigatório em qualquer container que toque borda:
```css
.pt-safe         { padding-top: env(safe-area-inset-top); }
.pb-safe         { padding-bottom: env(safe-area-inset-bottom); }
.pb-safe-extra   { padding-bottom: calc(env(safe-area-inset-bottom) + 80px); }
```

---

## 3. Sistema de componentes

### 3.1 PremiumUI — primitivos de marca

Localização: `src/components/ui/PremiumUI.tsx`. Esses são os blocos de identidade gold:

| Componente | Função |
|---|---|
| `<GoldBadge>` | Pill dourada, font-black, 10px tracking |
| `<GoldGradientBorder>` | Wrapper com `p-[1px]` + gradient border |
| `<GoldCard>` | Wraps GoldGradientBorder pra cards premium |
| `<SectionHeader>` | Título + label badge + ícone (padrão de seção) |
| `<GoldDivider>` | Linha gradient horizontal |
| `<PremiumButton>` | Variantes: `gold` (CTA principal), `ghost`, `danger`, `subtle` |
| `<PremiumToggle>` | Switch w-12 h-6 com thumb animado |

Esses são os átomos da identidade. **Em qualquer redesign, esses componentes podem mudar de visual mas o conceito (CTA dourado, divisor gradient, badge premium) deve continuar reconhecível.**

### 3.2 Componentes funcionais — workout (críticos)

Localização: `src/components/workout/`

| Componente | Função | Notas de design |
|---|---|---|
| `ExerciseCard.tsx` | Container colapsável de exercício, dispatcher de renderer | Borda muda para emerald quando todas as séries feitas + scroll auto pro próximo |
| `set-renderers/normalSet.tsx` | Renderiza UMA série bilateral (peso/reps/RPE) | Header de colunas só na primeira série, badge slam ao concluir |
| `set-renderers/normalSet.tsx` (modo unilateral) | Mesmo arquivo, modo L/R com badges azul/laranja | Cada lado tem seu próprio botão de "feito"; série só conta como done quando ambos feitos |
| `set-renderers/dropSetSet.tsx`, `restPauseSet.tsx`, etc. | Variantes pra métodos especiais (drop-set, rest-pause, cluster, FST-7, sistema 21, onda, group methods) | 14 renderizadores. Precisam revisão de consistência visual entre eles |
| `PlankSetInput.tsx` | Modal específico de Prancha (peso corporal + tempo + countdown integrado) | Recém-adicionado, padrão para futuros isométricos |
| `RestTimerOverlay.tsx` | Fullscreen countdown overlay | Compartilhado entre rest entre séries E execução de Prancha (`context.kind`: `'rest' \| 'plank'`) |
| `SetInputRow.tsx` | Renderer simples (não usado no fluxo principal — `ExerciseCard` despacha direto pros set-renderers) | **Atenção:** legacy. Pode ser removido em refactor |
| `WorkoutFooter.tsx` | Botão "Finalizar" + cronômetro + pause | Footer fixo bottom, glow on completion |

### 3.3 Componentes funcionais — dashboard

| Componente | Função |
|---|---|
| `dashboard/DashboardHeader.tsx` | Logo + sync badge + menu, fixed top |
| `dashboard/StudentDashboard.tsx` | Home view, lista de treinos do dia |
| `dashboard/WorkoutCard.tsx` | Card de treino na lista, mostra exercícios e botão "Iniciar" |
| `dashboard/WeeklyAIReport.tsx` | Insights de IA |
| `dashboard/CalorieTimeline.tsx`, `MacroPieChart.tsx` | Tab de nutrição |

### 3.4 Modais e overlays

Carregados via `next/dynamic` para code-splitting:

| Componente | Tipo | Quando aparece |
|---|---|---|
| `WorkoutWizardModal` | Fullscreen step | Ao criar treino com IA |
| `ExpressWorkoutModal` | Fullscreen | Treino rápido |
| `SettingsModal` | Sidesheet | Configurações |
| `IncomingInviteModal` | Center modal, backdrop-blur-md | Convite de coach/grupo |
| `GlobalDialog` | Confirm/alert | Via `DialogContext` (qualquer lugar) |
| `PreCheckinModal` | Bottom-sheet | Antes de iniciar treino |
| `RestTimerOverlay` | Fullscreen | Countdown |

Padrão: backdrop com `backdrop-blur-md` + `bg-black/70`, conteúdo `rounded-2xl border border-yellow-500/20`, animação `overlay-enter` (fade + scale).

### 3.5 Inputs

```css
/* base — inputs roomy (peso) */
.bg-black/40 .border .border-neutral-700/80 .rounded-xl .px-2.5 .py-2 .text-sm .text-white
.outline-none .focus:ring-1 .ring-yellow-500 .focus:border-yellow-500/50
.placeholder:text-neutral-600 .placeholder:text-xs .focus:placeholder:opacity-0

/* compact — inputs estreitos (reps, RPE) */
mesma base + .px-1.5 .text-center
```

**Padrão importante:** `inputMode="decimal"` em peso/reps (teclado numérico em mobile sem necessidade de `type="number"` que causa spinners feios).

### 3.6 Botões

| Variante | Quando usar | Visual |
|---|---|---|
| Gold solid | CTA principal único na tela | `bg-yellow-500 text-black font-black` |
| Gold gradient | Ações de celebração / iniciar | Gradient gold + pulse-glow on success |
| Ghost (border) | Ação secundária | `border border-neutral-700 text-neutral-300 bg-transparent` |
| Subtle | Toggle, action interna | `bg-neutral-900/50 border border-neutral-800` |
| Danger | Destrutivo | `bg-red-500/90 text-white` ou `border-red-500/40 text-red-400 bg-transparent` |
| Success | Confirmação após ação | `bg-emerald-500 text-black` |

**Padrão de feedback:** `active:scale-95 transition-all duration-150` em todos os botões. Plus haptic feedback em mobile (`triggerHaptic()`).

### 3.7 Cards (estados)

```
Default:       bg-neutral-900/50 border border-neutral-800/80 rounded-xl
Hover:         translateY(-2px), shadow lift (utility .card-interactive)
Done state:    bg-emerald-950/30 border-emerald-500/30 (transição 0.6s)
Active state:  border-yellow-500/40 shadow-yellow glow
```

---

## 4. Animações e microinterações

Todas em `src/app/globals.css:5-366` (keyframes) + utilities. **Não são decoração — comunicam estado.** Em qualquer redesign, o vocabulário de animação deve ser preservado mesmo que as durações/curvas mudem.

| Nome | Duração | Quando dispara | Significado |
|---|---|---|---|
| `badge-slam` | 0.5s | Ao marcar série como feita | Celebração de conquista |
| `button-slam` | 0.3s | Press de botão de complete | Feedback tátil visual |
| `pulse-glow` | 1.6s ∞ | Botão "Finalizar" quando todos exercícios feitos | "Você terminou — clique aqui" |
| `shimmer` | 1.5s | Loading skeletons + sweep no logo | Atividade |
| `gold-flow` | 3s | Botão "Iniciar Treino" gradiente | Convite |
| `aurora-pulse` | ∞ | Story rings (se story disponível) | Atenção sutil |
| `streak-shake` | 2.5s | Emoji 🔥 do streak | Conquista de hábito |
| `prBadgeIn` | 0.5s | Quando PR detectado | Celebração grande |
| `dropdownIn` | 0.18s | Menus | Snap responsivo |
| `slideUp` | 0.3s | Bottom-sheets, toasts | Entrada padrão |
| `overlay-enter` | 0.2s | Modais | Fade + scale |

**Stagger pattern:** `.stagger-children > *` aplica delay incremental (0–300ms) em até 6 itens. Usado em listas que aparecem (ex: dashboard ao carregar).

**Princípio:** animação só justifica seu peso se comunicar algo. Em mobile, durações curtas (≤300ms) pra parecer responsivo. Glow/pulse infinito apenas em estado de "atenção pendente" (CTA principal aguardando ação).

---

## 5. Iconografia

**Pacote:** `lucide-react` (40+ usos). Tamanhos comuns: 12, 14, 16, 18, 20 (props diretos no JSX, não Tailwind).

**Top icons usados:**
- `Dumbbell` (logo, headers, exercise indicator)
- `Check` / `CheckCircle2` (completion)
- `X` (close)
- `ArrowLeft` (back)
- `Crown` (VIP)
- `Loader2` (`animate-spin`)
- `MessageSquare` (notas/observações)
- `Play` / `Square` (timer iniciar/parar)
- `ChevronDown` / `ChevronUp` (collapse)
- `Edit` (editar)
- `Camera` (avatar)

**Custom SVG/PNG:** halter 3D em `/public/header-dumbbell.png` (a única imagem rasterizada de marca).

**Princípio:** Lucide é a baseline. Substituir por SVG custom só quando a forma for marca (halter). Tamanhos sempre em múltiplos de 2 (12/14/16/18/20).

---

## 6. Telas e fluxos

### 6.1 Roteamento via state, não router

Todas as telas principais vivem em `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx` num único componente client-side. O state `view: string` controla qual tela renderiza. **Não é Next.js routing tradicional.**

```ts
type View =
  | 'dashboard'        // home, default
  | 'active-workout'   // treino em andamento (fullscreen, sem bottom nav)
  | 'history'          // treinos passados
  | 'chat-list'        // conversas
  | 'chat-direct'      // DM
  | 'community'        // feeds sociais
  | 'admin'            // painel coach (admin only)
  | 'profile'          // perfil do usuário
  | 'exercise-editor'  // criar/editar exercício
  | 'workout-report'   // relatório pós-treino
  | 'vip-hub'          // features premium
```

**Implicação para redesign:** transições entre telas podem ser animadas (não há reload). Bottom nav é condicional (esconde em fullscreen views).

### 6.2 Fluxos críticos

**Iniciar treino:**
1. Dashboard mostra cards de treino do dia
2. Usuário toca "Iniciar Treino" → confirm modal com tempo estimado
3. Pre-checkin (se ativo): mood/energia/sono
4. Entra em `active-workout` (fullscreen)
5. Sequência de exercícios → cada exercício tem N séries
6. Series tipo padrão: peso + reps + RPE → botão OK marca como feita
7. Series unilaterais: dois lados (L/R), cada um com seu OK
8. Series Prancha: peso corporal + tempo alvo + botão Iniciar (timer integrado)
9. Ao terminar todas: botão Finalizar (pulsa)
10. Post-checkin opcional → salva sessão → vai pra `workout-report`

**Pós-treino:**
1. `workout-report`: cards de métricas (volume, duração, PRs detectados, gráfico de músculos trabalhados, insights de IA)
2. Botão "Compartilhar" → screenshot ou link para feed social

**Admin/coach:**
1. View `admin` (só pra usuários com role coach/admin)
2. Lista de alunos, criação/edição de templates, aprovação, assinatura de planos
3. Sistema separado de UI mas usa os mesmos primitivos PremiumUI

### 6.3 Sistema de PRs e gamificação

- **Iron Rank:** sistema de níveis baseado em volume total levantado (0kg → Lenda Imortal). Mostrado no header da home.
- **PRs (Personal Records):** detectados automaticamente via Epley 1RM ou peso×reps direto. Animação `prBadgeIn` celebra quando aparece.
- **Streak de treinos:** emoji 🔥 com animação `streak-shake` no header.
- **Badges:** crown (VIP), volume tier, frequência semanal.

**Princípio:** gamificação é central pro engajamento, mas nunca atrapalha o flow de treino. Badges aparecem em momentos de pausa (header, home, post-workout) — nunca no meio de uma série.

---

## 7. Padrões UX específicos do fitness

### 7.1 Header de treino ativo
```
[← Voltar]  [+ adicionar ex]  [⋮ menu]   [progress ring] X/Y  [⏰ hh:mm:ss]
```
- Voltar: sai com confirm
- Add exercise: insere extra
- Menu: opções (skip, edit)
- Progress: ring circular com % de séries feitas
- Timer: cronômetro do treino (pode pausar)

### 7.2 Exercise card colapsável
- Borda **yellow** quando ativo (em progresso ou próximo)
- Borda **emerald** quando todas as séries feitas
- Header com número + nome + sets + tempo descanso + método
- Bloco de instruções (collapsible)
- Toolbar de ações (vídeo, IA, link, refresh, deload, edit)
- Lista de séries (cada uma é um set-renderer)
- "Série extra" pra adicionar manual
- Lixeira pra remover (com confirm)

### 7.3 Set input row (3-col grid)
```
[💬 notes] [Peso] [Reps] [RPE] [✓ OK]
```
Bilateral: única linha por série
Unilateral: duas linhas por série (L em azul, R em laranja), badge `LADO L`/`LADO R`, OKs separados

### 7.4 Rest timer overlay
- Fullscreen com backdrop opaco
- Timer central XX:XX (animado)
- Contexto (próximo exercício/série)
- Botões: Pular, +30s, Parar
- Som + vibração ao terminar
- Background task em iOS via Capacitor

### 7.5 Toasts e notificações inline
- `ActionToast` no top-center
- Animação `toast-enter` (slide down + fade)
- Auto-dismiss em 4s
- Tipos: success (emerald), warning (yellow), error (red)
- Sem push notifications via web (só Capacitor mobile)

---

## 8. Capacitor / mobile

### 8.1 Plugins ativos
- `@capacitor/core`, `@capacitor/filesystem` (save Blob)
- Custom `irontracksNative.ts` registra: haptic feedback, push notifications, native timer actions, Apple Health sync
- Live Activities iOS (timer no Dynamic Island/Lock Screen)

### 8.2 Web vs mobile — diferenças intencionais
- Mobile: scroll handle hidden, touch-action manipulation, haptic em buttons
- Web desktop: scrollbar custom (gold), hover states explícitos

### 8.3 Constraints
- Nenhum push em web (apenas in-app `ActionToast`)
- Câmera/upload usa `<input type="file">` em web, plugin nativo em mobile
- Compartilhamento usa Web Share API com fallback

---

## 9. O que está bom (preservar)

1. **DNA gold + dark + italic** — funciona, é reconhecível, não faltar.
2. **Animações que comunicam estado** — slam ao concluir, glow no botão Finalizar, shimmer em loading. Bem calibradas.
3. **Hierarquia tipográfica responsiva** — `clamp()` nos `text-title-*` escala bem entre mobile e desktop.
4. **Safe areas no Capacitor** — bem aplicadas, sem falhas de UI cortada.
5. **Sistema de cores semânticas** — emerald/yellow/red consistentes através do app.
6. **Modal pattern** — backdrop-blur-md + border yellow/20 + rounded-2xl é coeso.

## 10. Áreas com ressalva (vale repensar)

1. **14 set-renderers diferentes** (`normalSet.tsx`, `dropSetSet.tsx`, `clusterSet.tsx`, `restPauseSet.tsx`, `fST7Set.tsx`, etc.) com inconsistências visuais menores entre eles. Vale unificar a base e diferenciar só por tokens (cor de header da série, ícones).
2. **3 tipos `SetDetail` diferentes** (`src/types/app.ts`, `src/types/workout.ts`, `src/components/ExerciseEditor/types.ts`) — débito técnico que mistura camelCase/snake_case. Não é UI mas afeta como dados chegam à UI.
3. **`SetInputRow.tsx` legacy** — não é o renderer real do treino ativo (ExerciseCard despacha pros set-renderers). Pode ser removido ou clarificado.
4. **Bottom nav inconsistente** — algumas views têm, outras não. Falta um padrão claro de quando aparece.
5. **`LoadingScreen` que mostra "não foi possível carregar" depois de 8s** — UX defensiva mas confusa em dev mode lento. Vale repensar safety valve.
6. **Padrão de "edit exercise during workout"** — modal denso com muitos campos (`Modals.tsx` linhas 524-560 só pro toggle unilateral). Pode ser progressive disclosure.
7. **Pre/post-checkin** — atualmente são modais separados; pode virar um wizard mais coeso.
8. **Estatísticas e insights** — gráficos de musculatura, calorias, volume — bem feitos individualmente mas não conversam visualmente entre si. Falta um sistema de chart compartilhado.
9. **VIP / Iron Rank / Badges** — gamificação funciona mas o visual de cada elemento é levemente diferente (gradients diferentes, tamanhos diferentes). Vale unificar.
10. **Exercise editor (`ExerciseEditor/`)** — é a tela mais densa do app. Tem campos demais visíveis ao mesmo tempo. Candidato a refatoração com tabs ou steps.

---

## 11. Princípios para evolução

Se o Claude Design vai trabalhar nesse app, esses princípios não são negociáveis:

1. **Performance > polish.** App precisa abrir e responder em sub-segundos. Animações nunca podem bloquear interação. Transições entre telas devem ser visualmente ricas mas computacionalmente baratas.

2. **Mobile-first absoluto.** Toda decisão de layout começa no breakpoint mobile (< 640px). Desktop é uma evolução, não a referência.

3. **Touch-targets generosos.** Mínimo 44px de altura em qualquer elemento interativo (input, botão, toggle, link).

4. **Dark only.** Manter. Reconsiderar luz só com proposta sólida que mantenha tom premium.

5. **Gold é o herói.** Não diluir a cor da marca em "modo plano" ou "estilo neutro". O usuário associa gold = ação importante.

6. **Tipografia black/italic é assinatura.** Wordmark IRONTRACKS, headers de PR, toasts de celebração — tudo italic black. Resto do app pode ser regular/medium.

7. **Animação só comunica.** Nada de "delight" gratuito. Toda animação deve ter um significado funcional (estado mudou, atenção precisa ir aqui, sucesso aconteceu).

8. **Densidade vs respirar.** Tela de treino ativo precisa de densidade (muitas séries visíveis). Dashboard pode respirar mais. Não generalizar.

9. **Coach vs aluno são apps diferentes na mesma casa.** O painel admin tem necessidades distintas (tabelas, listas grandes, edição em batch) — não forçar o mesmo visual do app de aluno.

10. **Capacitor é first-class.** Considerar safe areas, haptics, Live Activities iOS, plugins nativos em todas as decisões. Web é a "versão para desktop", não o contrário.

---

## 12. Mapa rápido para começar

Se for só ler 5 arquivos pra entender o app:

1. `src/app/globals.css` — todos os tokens, animações, utilities
2. `src/components/ui/PremiumUI.tsx` — primitivos de marca
3. `src/components/workout/set-renderers/normalSet.tsx` — UI mais usada do app (renderer de série)
4. `src/components/workout/ExerciseCard.tsx` — dispatcher e card colapsável
5. `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx` — view router e state global

Se for só rodar 1 fluxo:
- Login → dashboard → iniciar treino de SEG → completar 2 séries de qualquer exercício → finalizar → ver report.

---

**Última atualização:** 2026-04-20 · Claude Code (auditoria automatizada do estado atual + síntese para input de redesign).
