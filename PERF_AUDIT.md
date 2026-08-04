# IronTracks Performance + Bundle Audit
Data: 2026-05-13

> Análise estática do bundle gerado (`.next/static/chunks/` em disco), `node_modules`, e código-fonte. **Não rodei `npm run build` nem `analyze`** — usei os artefatos do build mais recente (`12 May`) que já estavam em `.next/`. Tamanhos abaixo são **uncompressed em disco** (gzip seria ~30–40% destes valores; brotli mais ainda).
>
> Audit React anterior (REACT_AUDIT.md) já tratou re-renders/memo — este foca em **bundle, boot, runtime não-render, network, images, PWA, Capacitor**.

---

## Resumo executivo

Em ordem de "ROI por hora de trabalho":

1. **🔴 9.4MB de splash logo carregada em TODA primeira tela do app** (`/logo-irontracks-transparent.png`, 4864×4864 RGBA, `unoptimized`). Em 3G/4G de academia subsolo isso bloqueia visualmente o usuário por 5–15s. Fix: regerar PNG/WebP em 1024×1024 (~50–150KB) e remover `unoptimized`. **Ganho estimado: ~9.3MB → ~100KB no primeiro paint.**
2. **🔴 ~30MB de lixo no `/public` servido pra todo cliente que prefetcha** (zip de 22MB + 18MB de PNGs 16-bit raw da página `/comercial` + PNG redundante de 9.4MB em `/public/screenshot/logoirontrackssemfundo.png`). Service Worker pode estar até cacheando alguns. Fix: mover pra fora de `/public` ou regerar em tamanho web.
3. **🔴 33 componentes usam `next/image` com `unoptimized`** — desligam WebP/AVIF e resize do Vercel pra imagens que ficam 600–700KB cada (rank-1.png…rank-8.png, badges, vip-crown, login-hero, default-avatar). Conjunto de 8 ranks = ~4.5MB servidos raw quando o dashboard renderiza o IronRankCard. Fix: remover `unoptimized` exceto onde Cloudinary/Supabase já entregam otimizado.
4. **🟡 framer-motion (~80KB chunk) NÃO está em `experimental.optimizePackageImports`** — 17 arquivos importam, mas o tree-shake atual do webpack 5 do Next só funciona bem pra libs configuradas. Fix: adicionar `'framer-motion'` ao array em `next.config.ts:23`. Modest gain mas zero-risk.
5. **🟡 `IronTracksAppClientImpl.tsx` (1287 linhas, 70KB raw) importa eager 30+ hooks customizados** — todos rodam no boot, mesmo features que nunca vão ser usadas pelo usuário daquela sessão (geofence, push-sync, intent-router, biometric). Fix: gating por feature flag ou role (aluno comum não precisa de hooks de admin/teacher).

---

## Findings (priorizados por impacto × esforço)

### 🔴 F1 — Splash logo de 9.4MB carregada em TODO boot
- **Categoria**: images / boot
- **Localização**: `src/components/LoadingScreen.tsx:57-66` + `public/logo-irontracks-transparent.png`
- **O que é**: PNG **4864×4864 RGBA = 9,851,779 bytes**. Renderizada via `<Image priority unoptimized sizes="460px" />`. O flag `unoptimized` desliga o pipeline `/_next/image` do Vercel (WebP/AVIF + resize). `priority` força preload no `<head>`. Resultado: o cliente baixa **9.4MB raw** antes do app fazer qualquer coisa, em 3G/4G isso = 8–20s.
- **Sugestão**:
  - Regerar em **1024×1024 PNG** (~120KB) ou **WebP** (~50KB).
  - Remover `unoptimized` para que Vercel sirva AVIF/WebP em 460px reais.
  - Considerar SVG inline (mais simples, ~5KB).
- **Ganho mensurável**: -9.3MB (-99%) no first paint.

### 🔴 F2 — Lixo em `/public` servido pela CDN
- **Categoria**: bundle / network
- **Localização**: `public/`
- **O que é**:
  - `public/P_gina comercial Irontracks.zip` — **22 MB**, nenhuma referência no código (`grep` retornou zero).
  - `public/screenshot/` — **18 MB** total: 6 PNGs **16-bit/cor** (1179×2556) capturas do iPhone (`IMG_7427.PNG`–`IMG_7432.PNG`). Usados em `src/app/comercial/ComercialContent.tsx` com `unoptimized`. Cada uma 500KB–2.5MB.
  - `public/screenshot/logoirontrackssemfundo.png` — 9.4MB, **PNG idêntico** ao `logo-irontracks-transparent.png` (mesmo SHA provável, mesmo `9,851,779` bytes).
  - `public/seasonal/mothers-day-2026.png` — **1.3MB** + sibling `.webp` mais novo de 73KB. Componente `MothersDayModal.tsx:34` já usa o `.webp`. **PNG é dead weight**.
- **Sugestão**: deletar o `.zip`, deletar o PNG duplicado em `/screenshot/`, mover screenshots de marketing pra fora do `/public` (S3/Cloudinary), reotimizar páginas comerciais via `<Image>` sem `unoptimized`. Apagar `seasonal/mothers-day-2026.png`.
- **Ganho mensurável**: `/public` cai de 75MB → ~25MB. CDN propaga mais rápido, deploys Vercel mais leves.

### 🔴 F3 — `unoptimized` em 33 arquivos / 47 ocorrências
- **Categoria**: images
- **Localização**: 47 matches em `src/components/**/*.tsx` e `src/app/**/*.tsx`
- **O que é**: O prop `unoptimized` no `<Image>` do Next desliga o `/_next/image` (WebP/AVIF + DPR resize). Aplicado consistentemente em imagens **locais** que poderiam ser otimizadas. Casos mais caros:
  - `src/components/dashboard/IronRankCard.tsx:236` → `<NextImage src={RANK_EMBLEMS[level]?.src} fill unoptimized />` — 8 ranks de 472KB–722KB. Total carregado lazy mas raw.
  - `src/components/dashboard/IronRankCard.tsx:527` → `/default-avatar.png` 442KB, fallback de avatar — exibido pra TODO usuário sem foto em rankings.
  - `src/components/LoginScreen.tsx:139` → `/login-hero.png` 453KB, `priority unoptimized`. Mostrado em todo unauth.
  - `src/components/WorkoutReport.tsx:589,755,837,893,895` → vários assets `.png` 414KB–631KB, todos `unoptimized`.
  - `src/components/StoryComposer.tsx:353` → `sticker-fire.png` (~200KB) + `sticker-lightning.png` (418KB), `unoptimized`.
- **Sugestão**:
  - Remover `unoptimized` de **TODAS** referências a paths locais (`/rank-*`, `/badge-*`, `/login-hero.png`, `/report-*`, `/sticker-*`, `/default-avatar.png`).
  - Manter `unoptimized` apenas onde `src` é remoto incerto (Cloudinary já entrega WebP) ou para imagens dinâmicas pequenas.
  - Confirmar que paths estão whitelisted em `next.config.ts:31-58` `localPatterns` — todos já estão.
- **Ganho mensurável**: Vercel serve AVIF/WebP em DPR correto. PNG 600KB → WebP 30–60KB típico. Em dashboard com rank + avatar default: -2MB típico.

### 🔴 F4 — `icone.png` (PWA icon) é 1.2MB em 1080×1080
- **Categoria**: images / PWA / boot
- **Localização**: `public/icone.png` + `src/app/layout.tsx:54-56,75-76` + `public/manifest.json:13-23`
- **O que é**: PNG **1080×1080 = 1,267,695 bytes**. Declarado no manifest PWA como `192×192` E como `512×512` (mesma URL, sempre baixa 1.2MB). Também é o favicon, apple-touch-icon, e Service Worker `precache` (`src/app/sw.js/route.ts:24`). Service Worker faz `caches.addAll([...,'/icone.png'])` no install — bloqueia o SW install até baixar 1.2MB.
- **Sugestão**: gerar 3 variantes (`icone-192.png`, `icone-512.png` PNG comprimido, `icone-180.png` apple-touch-icon Apple-quality). Cada ~10–30KB. Atualizar manifest, layout, SW precache. Pode usar `next-pwa-icon-generator` ou ImageMagick.
- **Ganho mensurável**: -1.2MB no install do SW; favicon carrega em 1ms.

### 🔴 F5 — `useAppEffects.ts` faz preload eager de 6 modais 1s após mount
- **Categoria**: boot
- **Localização**: `src/hooks/useAppEffects.ts:128-139`
- **O que é**: 1 segundo após o app montar, dispara `void import('@/components/SettingsModal')`, `WorkoutWizardModal`, `HistoryList`, `ActiveWorkout`, `IncomingInviteModal`, `InviteAcceptedModal`. Isso baixa **5 chunks adicionais** pra usuário que pode nem usar nenhum (ex: novato que só veio ver dashboard). `ActiveWorkout` sozinho puxa `RestTimerOverlay` + dependências. Em 3G/4G compete com bootstrap fetch + workout fetch + push register.
- **Sugestão**: 
  - Manter o preload mas usar `requestIdleCallback` (com fallback `setTimeout`) — só executa quando CPU/network estão idle.
  - Ou condicionar ao role/state: `WorkoutWizardModal` só faz sentido pra usuário com 0 treinos; `ActiveWorkout` só se usuário historicamente faz workouts (cache local).
- **Ganho mensurável**: economiza ~150–300KB de chunks em paralelo durante boot ativo.

### 🔴 F6 — `IronTracksAppClientImpl.tsx` god component (1287 lines, 70KB raw)
- **Categoria**: boot / bundle
- **Localização**: `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx`
- **O que é**: O dashboard root client importa **30+ hooks customizados eager**, **20+ dynamic components**, e o arquivo compila pra **~150KB** dentro do chunk `2482-2cdf623565f84761.js` (203KB) — esse é o **2º maior chunk** do bundle inicial. Inclui hooks que muitos usuários NUNCA precisam:
  - `useGymGeofence`, `useLiveActivityPushSync`, `useBackgroundRefresh`, `useNativeIntentRouter` (Siri/Shortcuts), `useHealthKit`, `useStudentControlNotice`, `useAdminPanelState`, `useUtmAcquisition` — todos rodam no boot mesmo pra usuário não-iOS / não-admin / sem health permission.
  - `useBootstrap` faz 1 fetch (`/api/dashboard/bootstrap`) já gerenciado por SSR — bom.
  - `useWorkoutFetch` (já com cache localStorage) — bom.
- **Sugestão**:
  - Wrappar hooks platform-specific em `if (isIosNative()) useNativeIntentRouter()`. Atualmente eles fazem nada interno pra Android/web, mas o **bundle ainda carrega o código todo**. Mover pra `useEffect` interno c/ check + lazy import.
  - Hooks `useAdminPanelState`, `useStudentControlNotice` — só fazem sentido pra role específico. Carregar via `dynamic()` se role ≠ user comum.
  - Extrair "presence/notification" hooks (`usePresencePing`, `useUnreadBadges`, `useWhatsNew`) para um único hook composto que defer 2–3s pós-mount.
- **Ganho mensurável**: -30 a -50KB do chunk inicial; -3 a -5 fetches no primeiro 1s pra usuário aluno comum.

### 🟡 F7 — framer-motion fora do `optimizePackageImports`
- **Categoria**: bundle
- **Localização**: `next.config.ts:23` + 17 arquivos em `src/components/`
- **O que é**: `next.config.ts:23` lista apenas `['lucide-react', 'chart.js', 'react-chartjs-2', '@tanstack/react-virtual']`. **framer-motion (~80KB no chunk 8122)** NÃO está. Imports comuns:
  - `import { motion, AnimatePresence } from 'framer-motion'` em 13 arquivos
  - `import { Reorder, useDragControls } from 'framer-motion'` em 3 arquivos
  - `import { motion } from 'framer-motion'` em vários
  Sem `optimizePackageImports`, webpack 5 pega tudo do barril.
- **Sugestão**: adicionar `'framer-motion'` ao array. Zero risco — framer-motion é tree-shake-safe.
- **Ganho mensurável**: -20 a -30KB no chunk compartilhado. Cumulativo com F8.

### 🟡 F8 — Chart.js (161KB chunk) carregado sync em 4 componentes
- **Categoria**: bundle / boot
- **Localização**: 
  - `src/components/admin-panel/DashboardTab.tsx:2-12` (admin-only)
  - `src/components/vip/VipPeriodizationPanel.tsx:4-5` (VIP-only)
  - `src/components/admin/AdminVipReports.tsx:7-16` (admin-only)
  - `src/components/assessment/AssessmentHistory.tsx:3-15` (todos)
- **O que é**: Chart.js + react-chartjs-2 = 161KB gzipped. `DashboardTab` e `AdminVipReports` já entram via `dynamic()` no `AdminPanelV2`. Mas `AssessmentHistory` é importado por `IronTracksAppClientImpl.tsx:104` via `dynamic()` (bom!) — só dispara quando aluno entra em "Avaliações".
- **Sugestão**: já está bem isolado. Verificar se o admin user comum ativa o chunk no boot via `useAdminPanelState` (provavelmente não). 
- **Ganho mensurável**: nenhum extra acima do que já tem; manter vigilância.
- Adicional: `ReportMusclePieChart` (workout-report) usa SVG inline puro (`src/components/workout-report/ReportMusclePieChart.tsx`) — bom exemplo, não precisa de chart.js. **Replicar esse padrão** nos outros gráficos simples (donut/bar 1D).

### 🟡 F9 — Sentry 200KB no chunk principal
- **Categoria**: bundle / boot
- **Localização**: `sentry.client.config.ts:1` (`import * as Sentry from "@sentry/nextjs"`), chunk `4844-caf8a45c499ea04f.js` (455KB, ~200KB Sentry + Next runtime).
- **O que é**: Replay já é lazy (`Sentry.lazyLoadIntegration('replayIntegration')` linha 45) — bom. Mas o core do Sentry (tracing, breadcrumbs, transport) ainda é eager. `@sentry/nextjs` package em `node_modules` ocupa **63MB**.
- **Sugestão**: difícil reduzir sem perder coverage. Opções:
  - `tracesSampleRate: 0` em mobile/Capacitor pra reduzir overhead em runtime (sample só web).
  - Verificar `tunnelRoute: "/monitoring"` em `next.config.ts:188` — adiciona uma rota client que pode estar bloqueando rate-limited (overhead minor).
- **Ganho mensurável**: limitado, mas se removesse Sentry tracing client-side, ~80KB a menos. Não recomendo sem alternativa.

### 🟡 F10 — `PerformanceReporter` monkey-patches `window.fetch`
- **Categoria**: runtime
- **Localização**: `src/components/PerformanceReporter.tsx:290-340`
- **O que é**: `window.fetch = async (...) => { ... }` intercepta **toda** chamada fetch do app pra medir API_TIME. Adiciona overhead por call (~0.1ms + sync I/O do trackUserEvent). Roda também no SSR? Tem guard `window`. Side-effect: outros packages que avaliam `window.fetch` antes do PerformanceReporter montar não pegam o patch. RAF loop linha 270–287 mede FPS — sempre rodando.
- **Sugestão**:
  - Limitar amostragem (10% das requests pra alimentar telemetria, não 100%).
  - Skip patch em mobile/Capacitor (já temos Sentry tracing).
  - O FPS loop está bem (auto-stop após 5s, linha 273).
- **Ganho mensurável**: trivial em runtime, mas reduz noise/telemetry costs.

### 🟡 F11 — `LoginScreen` canvas `GoldParticles` RAF infinito
- **Categoria**: runtime
- **Localização**: `src/components/LoginScreen.tsx:14-79`
- **O que é**: Canvas com 18 partículas douradas animadas via `requestAnimationFrame` em loop infinito durante login. Não pausa se usuário sai da aba (sem `visibilitychange`) — Capacitor iOS WebView paga CPU mesmo backgrounded. Cada frame: 18 `ctx.beginPath`/`ctx.arc`/`ctx.fill` com `shadowBlur` (caro). Em iPhone barato isso pode jankar a transição pro dashboard.
- **Sugestão**:
  - CSS pure: 18 `<div>` absolute com `@keyframes` translateY → CPU 0% em background, GPU compositing.
  - OU: pausar `cancelAnimationFrame` no `document.visibilitychange` !== 'visible'.
- **Ganho mensurável**: -2 a -5% CPU em background em iPhones antigos.

### 🟡 F12 — Service Worker faz `cache.put(request, res.clone())` em **toda** navegação
- **Categoria**: runtime / network
- **Localização**: `src/app/sw.js/route.ts` (gerado dinamicamente)
- **O que é**: Em `request.mode === 'navigate'` o handler **sempre** faz `cache.put` (Network-first + cache fallback). Pra usuário com 50+ navegações por sessão, o storage cresce sem teto. Sem TTL ou limite de tamanho. Apenas o `activate` listener limpa caches de versões antigas.
- **Sugestão**:
  - Adicionar quota check (`navigator.storage.estimate()`) e LRU eviction quando > 50MB.
  - Skip cache pra responses > 1MB (evita guardar PNGs gigantes acidentalmente).
- **Ganho mensurável**: previne degradação. Não imediato.

### 🟡 F13 — Manifest PWA `localPatterns` ausente para sub-pastas usadas
- **Categoria**: images / boot
- **Localização**: `next.config.ts:31-58`
- **O que é**: A allowlist tem `/illustrations/**`, `/badge-**`, `/muscle-overlays/**`, etc., mas comentário linha 33 diz que faltavam — o autor já corrigiu. **Sem ação adicional necessária aqui**, é só validação.

### 🟢 F14 — `Inter` font carregada via `next/font/google` (correto)
- **Categoria**: fonts
- **Localização**: `src/app/layout.tsx:11-20`
- **O que é**: `Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })`. Single weight default. CSS inlining via `--font-inter` no `globals.css:420`. Boa prática. Sem FOUT/FOIT issues conhecidos.
- **Ação**: nenhuma.

### 🟢 F15 — Leaflet já é dynamic
- **Categoria**: bundle
- **Localização**: `src/components/workout/RouteMapLeaflet.tsx:69` (`const L = (await import('leaflet')).default`)
- **O que é**: 148KB chunk `d0deef33` = Leaflet inteiro. Já é dynamic import dentro de `useEffect`, e `CardioGPSPanel` (consumer) é dynamic em `IronTracksAppClientImpl.tsx:17`. Boa.
- **Nota**: a CSS `leaflet/dist/leaflet.css` (661 linhas) é importada sync em `RouteMapLeaflet.tsx:8` — mas como o componente é dynamic, o CSS chunk também é split. OK.

### 🟢 F16 — RevenueCat e Gemini só no server / lazy
- **Categoria**: bundle
- **Localização**: 
  - `@google/generative-ai` (612KB node_modules) — usado apenas em `src/app/api/**/route.ts` (server). Não vai pro client bundle. **OK.**
  - `@revenuecat/purchases-capacitor` — usado apenas em `src/app/marketplace/MarketplaceClient.tsx`, que é dynamic-importable. **OK.**

### 🟢 F17 — Capacitor não duplica assets
- **Categoria**: capacitor
- **Localização**: `ios/App/App/public/index.html` (80 bytes), `ios/App/App/public/` (4KB total).
- **O que é**: `capacitor.config.ts:7` define `webDir: 'out'` mas `server.url: 'https://irontracks.com.br'` faz o WebView carregar tudo do Vercel em runtime. O `ios/App/App/public/` é praticamente vazio. **Nenhum asset duplicado**. `Assets.xcassets` = 2.4MB (só app icons + splash, ok).

### 🟢 F18 — Imagens raw `<img>` muito poucas
- **Categoria**: images
- **Localização**: apenas 3 arquivos com `<img>` raw:
  - `src/components/ProgressPhotos.tsx:223` — `preview` blob URL (OK, é runtime user upload)
  - `src/components/ui/PremiumUI.tsx:441` — `photo` runtime (OK)
  - `src/components/dashboard/nutrition/CustomFoodScanner.tsx:178` — `previewUrl` blob (OK)
- Todos blob URLs de user upload. Não otimizáveis via `next/image` (já são bytes em memória).

---

## Métricas de baseline

**Build de 12 May 2026 (sem rodar build novo):**

| Chunk | Tamanho disco | Conteúdo principal |
|-------|--------------|-------------------|
| `4844-caf8a45c499ea04f.js` | **455 KB** | Next router + Sentry SDK runtime |
| `9884.f7e924be6e854d76.js` | **219 KB** | lucide-react (centenas de ícones) |
| `6357.e518c49e1d699476.js` | **211 KB** | workout-report deload constants + report logic |
| `2482-2cdf623565f84761.js` | **203 KB** | `IronTracksAppClient` + Supabase createBrowserClient |
| `4bd1b696-e356ca5ba0218e27.js` | **200 KB** | React DOM |
| `framework-...js` | **190 KB** | Next/React framework |
| `ca377847-...js` | **161 KB** | chart.js core |
| `7113.6f22d5f4ca3f6b1d.js` | **155 KB** | server-actions runtime + lucide-react icons |
| `d0deef33.3966d0ce670a6335.js` | **148 KB** | Leaflet (lazy, ok) |
| `main-3f5e056a878f10ab.js` | **147 KB** | Next page loader + utilities |
| `6405.5de14dc66e75ae3a.js` | **127 KB** | useVipCredits + muscleMap renderer |
| `8122-a9cc6e8566baa2ca.js` | **117 KB** | framer-motion |
| `polyfills-...js` | **113 KB** | Node polyfills (webpack auto) |
| `7439.26b8c5c059cb5574.js` | **110 KB** | (não identificado) |
| `app/page-f4953ebf72b927e3.js` | **55 KB** | root page (`/`) |
| `app/comercial/page-...js` | **42 KB** | `/comercial` (landing marketing) |

**Total `.next/static`**: **6.6MB uncompressed**, ~280KB CSS.

**`/public`**: **75MB** (dos quais ~40MB lixo conforme F2 + assets oversized F1/F4).

**node_modules**: 940MB (não afeta cliente; só CI/deploy).

**Heavy deps em disco**:
- `@sentry` — 63MB
- `lucide-react` — 44MB (tree-shake leva 200KB final)
- `chart.js` — 6.2MB
- `framer-motion` — 5.2MB
- `leaflet` — 3.8MB
- `html-to-image` — 500KB
- `@google/generative-ai` — 612KB (server-only)

**Estimativa "first-load JS" (uncompressed)**: 
- Polyfills (113KB) + framework (190KB) + main (147KB) + Sentry chunk (455KB) + main-app + supabase chunk (~200KB) + page route ≈ **~1.3MB uncompressed em 5–7 paralelos**. 
- Gzipped: ~400–500KB.
- Em 3G (1.6Mbps real): ~2.5s só do JS. Mais 9.4MB do logo = +20s = 22s pra usuário ver UI completa.

---

## Áreas não cobertas

- **Não rodei `npm run analyze`** — o sizes acima são de chunks já minified mas não compressed. Para AVG real ao usuário precisa medir gzip + brotli no Vercel (response headers).
- **Não medi Real User Metrics (RUM)** — `PerformanceReporter.tsx` já coleta TTFB/DOMReady/FPS/JANK_FRAMES — basta consultar a tabela `user_events` no Supabase com `name='perf_metric'`. **Recomendo um dashboard simples no admin agregando p50/p95 por path antes de medir antes/depois de cada fix.**
- **Não toquei o Android `res/`** — não verifiquei se asset bundle Android tem PNGs duplicados (estrutura espelha iOS, provavelmente também vazia).
- **Não validei se o `tunnelRoute: "/monitoring"` do Sentry está consumindo bandwidth significativo** — só anotei como suspeita em F9.
- **API waterfall** — `/api/dashboard/bootstrap` (paralelizado bem) + `/api/gps/gyms` (fetch em paralelo no useEffect linha 164) + `/api/notifications/...` + `/api/updates/unseen` + push register — todos disparam em 100–300ms do boot, **sem coordenação**. Não consegui medir o impacto exato sem RUM. Worth investigar com Sentry tracing ou DevTools network.
- **Code path admin/teacher** — não analisei rotas exclusivas de admin/teacher; foco no path principal do aluno.
- **PWA install size** — não testei "Add to Home Screen" no iOS Safari nem Android Chrome para medir o cache real que cada plataforma persiste.

---

**TL;DR de onde começar:**
1. Apaga/reduz F1, F2, F4 (puro trabalho de assets, zero risco no código): pode salvar **10–30MB no boot do iPhone novato**.
2. Remove `unoptimized` em paths locais (F3): mais 1–4MB por tela típica.
3. Adiciona `framer-motion` em `optimizePackageImports` (F7): 1 linha, -20–30KB.
4. Lazy-conditiona platform hooks no `IronTracksAppClientImpl` (F6): trabalho cirúrgico, -50KB chunk inicial.
