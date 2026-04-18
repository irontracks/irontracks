# IronTracks Native iOS — Design Spec

**Data:** 2026-04-18  
**Autor:** Maicon + Claude (brainstorming)  
**Status:** Aprovado para implementação  
**Release alvo:** v2.0.0 — substitui a versão Capacitor atual no mesmo bundle ID `com.irontracks.app`

---

## 1. Visão e Objetivo

Reescrever o IronTracks (hoje em Next.js + Capacitor) como **app iOS 100% nativo** em Swift/SwiftUI, mantendo paridade total de features e adicionando integrações que só são possíveis via APIs nativas da Apple (HealthKit, Apple Watch, Live Activities, Widgets, Siri Shortcuts).

O app é distribuído via App Store como **update normal (v2.0.0)** do bundle existente — usuário atualiza e encontra todos os seus dados, sessão, e VIP intactos. A versão web (Next.js) e o backend no Vercel permanecem inalterados.

### Princípios não-negociáveis
1. **Feature parity antes do release público** — usuário não pode perder nada ao atualizar
2. **Performance Instagram-level** — 120fps no ProMotion, cold start < 1.2s, optimistic UI em todas as ações
3. **Offline-first** — SwiftData como source of truth local, sync em background
4. **Modularização por feature** — Swift Packages desde o dia 1, impossível gambiarrar dependências entre features

---

## 2. Stack Técnica

| Camada | Decisão |
|---|---|
| Linguagem | Swift 6 |
| UI framework | SwiftUI (~95%) + UIKit embed pontual (câmera, casos específicos) |
| iOS mínimo | iOS 17 |
| Device support | Universal (iPhone + iPad) |
| State management | MVVM + Observation framework (`@Observable`) |
| Persistência local | SwiftData |
| Backend remoto | **Next.js no Vercel** mantido — `/api/ai/*`, `/api/billing/*`, `/api/workouts/*` continuam servindo |
| Supabase | SDK oficial `supabase-swift` (auth, PostgREST, realtime, storage) |
| IAP | `RevenueCat/purchases-ios` SDK nativo, entitlement `vip` mantido |
| Imagens | **Nuke** (melhor performance que Kingfisher em iOS 17) |
| Design | Híbrido — Apple HIG (navegação, tipografia, gestos) + acentos de marca IronTracks (dourado, identidade) |
| Monitoring | Sentry iOS SDK (mesmo projeto Sentry atual) |
| Analytics | Vercel Analytics mantido + Firebase Analytics opcional |
| Package manager | Swift Package Manager (SPM) |
| Localização | String Catalogs (iOS 16+) — pt-BR + en |
| Testing | XCTest + Swift Testing |

---

## 3. Estrutura de Módulos (Swift Packages)

```
IronTracks/                           (Xcode workspace + App target)
├── App/                              (entry point @main, routing, TabView raiz)
├── Extensions/
│   ├── IronTracksWatch/              (Apple Watch companion)
│   ├── IronTracksWidgets/            (Home + Lock Screen widgets)
│   ├── IronTracksLiveActivities/     (Dynamic Island / Live Activities)
│   └── NotificationService/          (rich notifications, pré-fetch de imagens)
└── Packages/
    ├── Core/
    │   ├── Networking/               (URLSession tipado, Vercel API client, interceptors)
    │   ├── SupabaseClient/           (supabase-swift setup, Keychain session)
    │   ├── DataStore/                (SwiftData models + SyncEngine com Supabase)
    │   ├── RevenueCat/               (wrapper, entitlement checking)
    │   └── Analytics/                (Sentry + telemetria)
    │
    ├── DesignSystem/                 (cores, tipografia, spacing, componentes)
    │
    ├── Features/
    │   ├── Auth/                     (login, cadastro, onboarding, forgot password)
    │   ├── Dashboard/                (TabView, Iron Rank card, overview stats)
    │   ├── Workouts/                 (criar, executar, sets, reps, cluster sets, timer)
    │   ├── Nutrition/                (log manual, foto, scan, chef IA, relatórios)
    │   ├── Social/                   (feed, stories, perfis, following)
    │   ├── VIP/                      (paywall, checkout, restore, Face ID)
    │   └── Settings/                 (perfil, preferências, privacy, legal)
    │
    └── Integrations/
        ├── Health/                   (HealthKit: ler peso/bpm, escrever treinos/calorias)
        ├── Watch/                    (WatchConnectivity, protocolo de mensagens)
        ├── LiveActivities/           (ActivityKit, rest timer)
        └── Shortcuts/                (App Intents, Siri)
```

### Regras de dependência (enforçadas pelo compilador)
- `Features/*` só importam `Core`, `DesignSystem`, `Integrations` — **nunca** outras Features
- `Core/*` só importa outros módulos de `Core`
- `DesignSystem` só importa SwiftUI (zero dependência de rede/Supabase)
- `Integrations/*` importam `Core` para persistência

Feature deletada = `Package.swift` removido do workspace, zero dangling code.

---

## 4. Mapa de Features (Paridade)

### Features portadas do Capacitor

| Feature atual | Package nativo | Notas |
|---|---|---|
| Login / cadastro / onboarding | `Features/Auth` | Supabase Auth via `supabase-swift`, sessão no Keychain, Face ID opcional |
| Dashboard com tabs | `Features/Dashboard` | `TabView` raiz, Iron Rank card, overview de stats |
| Criar/executar treino | `Features/Workouts` | Biblioteca, sets, reps, carga, cluster sets |
| Timer de descanso | `Features/Workouts` + `Integrations/LiveActivities` | Timer local + Live Activity |
| Input de voz para exercício | `Features/Workouts` | Speech framework nativo + `/api/ai/parse-exercise-voice` |
| Log manual de nutrição | `Features/Nutrition` | Busca de alimentos, cálculo de macros |
| Foto de refeição | `Features/Nutrition` | `AVFoundation` + `/api/ai/nutrition-photo` (Gemini) |
| Scan de label nutricional | `Features/Nutrition` | Vision framework + `/api/ai/scan-nutrition-label` |
| Chef IA | `Features/Nutrition` | Chat streaming URLSession + `/api/ai/chef-ia` |
| Relatório semanal | `Features/Nutrition` | `/api/ai/nutrition-weekly-report` |
| Estimativa nutricional | `Features/Nutrition` | `/api/ai/nutrition-estimate` |
| Sugestão alimentar | `Features/Nutrition` | `/api/ai/nutrition-suggest` |
| Feed social + stories | `Features/Social` | PhotosKit upload, Nuke pre-fetch, realtime |
| Queue offline de stories | `Features/Social` + `Core/DataStore` | SwiftData como fila |
| Iron Rank | `Features/Dashboard` + `Core/DataStore` | Cálculo local + sync |
| VIP paywall | `Features/VIP` | `purchases-ios`, offerings nativos |
| Restore purchases | `Features/VIP` | `Purchases.restorePurchases()` |
| Push notifications (inclui REST_TIMER) | `NotificationService` ext | Rich content, actions nativas |
| Offline mode | `Core/DataStore` | SwiftData source of truth, sync em background |

### Features novas (exclusivas do nativo)

| Feature | Package | Detalhes |
|---|---|---|
| Apple Health | `Integrations/Health` | Importa peso/bpm/calorias; escreve treinos (`HKWorkout`) |
| Apple Watch companion | `IronTracksWatch` | Timer série no pulso, marcar série, bpm real-time |
| Live Activities / Dynamic Island | `IronTracksLiveActivities` | Timer de descanso sempre visível |
| Widgets Home + Lock Screen | `IronTracksWidgets` | 4 widgets: próximo treino, streak, nutrição, semana |
| Siri Shortcuts / App Intents | `Integrations/Shortcuts` | "Iniciar treino de peito", "Registrar refeição" |
| Face ID para dashboard VIP | `Features/VIP` | `LocalAuthentication` |
| Share sheet nativo | `Features/Social` | `UIActivityViewController` para exportar pro IG/WhatsApp |

### Fora de escopo do 2.0.0

- **Marketplace Asaas** (removido no backend também, desativado pelo usuário)
- **App macOS** (o Capacitor tem target macOS 1.0 em preparação — adiado para v2.1+ via Mac Catalyst)
- **Registro de treino 100% independente no Watch** (sem iPhone por perto) — fase 2 do Watch

---

## 5. Arquitetura de Dados (SwiftData ↔ Supabase)

### Modelo offline-first

SwiftData é a **source of truth local**. Todas as UIs leem de SwiftData via `@Query`. SyncEngine mantém sincronia com Supabase em background.

```swift
@Model
final class Workout {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var name: String
    var startedAt: Date
    var finishedAt: Date?
    var exercises: [Exercise]
    
    var localCreatedAt: Date = .now
    var syncState: SyncState = .pending
    var remoteUpdatedAt: Date?
    var locallyModified: Bool = false
}

enum SyncState: String, Codable {
    case synced, pending, failed
}
```

### SyncEngine (serviço central em `Core/DataStore`)

```swift
@MainActor
final class SyncEngine {
    static let shared = SyncEngine()
    
    func start()                                    // inicia listeners e timers
    func syncPending() async                        // sobe mudanças pendentes
    func fullRefresh() async                        // pull-to-refresh manual
    func handleRealtimeEvent(_ event: RealtimeEvent) async
}
```

Todas as features consomem `SyncEngine`, nunca Supabase direto.

### Fluxo de mudança local

1. Usuário toca "marcar série"
2. SwiftData grava (`syncState = .pending`)
3. Views re-renderizam imediatamente (optimistic UI)
4. SyncEngine detecta pending → POST Supabase
5. Sucesso → `syncState = .synced` + `remoteUpdatedAt` atualiza
6. Falha → `syncState = .failed`, retry exponencial

### Primeiro login / hidratação

1. Auth bem-sucedido
2. Backfill paginado: `SELECT *` dos últimos 6 meses + stats acumuladas
3. Upsert em SwiftData por `id`
4. Realtime listeners registrados para tabelas ativas (`workouts`, `meals`, `stories`, `user_entitlements`)
5. Mudanças remotas aplicadas automaticamente em SwiftData → Views reagem via `@Query`

### Conflict resolution

Inicialmente: **last-write-wins** baseado em `updated_at` do servidor. Caso futuro: CRDT ou versioning por feature específica se necessário.

### Realtime selectivo

| Feature | Realtime? | Razão |
|---|---|---|
| Stories/Feed | ✅ | Atualização social |
| Workouts | ✅ | Multi-device |
| `user_entitlements` | ✅ | VIP muda status (ex: cancelamento) |
| Nutrição | ❌ | Raramente concorrente |
| Iron Rank | ❌ | Recalculado em intervalos |

### Storage de mídia

Upload direto para Supabase Storage. Cache local em `FileManager.default.temporaryDirectory` com LRU eviction quando passa 500MB.

---

## 6. VIP / Billing / Assinaturas

### Situação atual mantida

Múltiplos canais de billing, com entitlement canônico em Supabase (`user_entitlements`, `app_subscriptions`):

| Canal | Provedor | Status |
|---|---|---|
| iOS (app) | Apple IAP via RevenueCat | **Mantido** |
| Web (`irontracks.com`) | MercadoPago (cartão/PIX) | **Mantido** por enquanto (plano futuro de consolidar em Apple/Google) |
| Marketplace Asaas | Asaas | **Removido/desativado** |

### Compra no iOS nativo

- **Apple IAP only** (regra da Apple para conteúdo digital)
- UI com botão único "Assinar com Apple" via RevenueCat SDK
- `Purchases.purchase()` → webhook RC → `user_entitlements`

### Verificação de VIP (dupla checagem)

```swift
func checkVIP() async -> Bool {
    // 1. Cache rápido via RC (resposta imediata)
    if let customer = try? await Purchases.shared.customerInfo(),
       customer.entitlements["vip"]?.isActive == true { return true }
    
    // 2. Fallback Supabase (pagamentos por fora da App Store)
    let entitlement = try? await supabase
        .from("user_entitlements")
        .select("active, expires_at")
        .eq("user_id", currentUserID)
        .eq("entitlement", "vip")
        .single()
    
    return entitlement?.active == true && entitlement.expires_at > Date()
}
```

### UI diferenciada
- VIP ativo via Apple → "Assinatura via App Store, gerenciar em Ajustes"
- VIP ativo via web (MercadoPago) → "Assinatura via site IronTracks"
- Inativo → paywall com "Assinar com Apple" (única opção in-app)

### Restore purchases
Botão "Restaurar Compras" chama `Purchases.restorePurchases()` + força revalidação de `user_entitlements`.

### ⚠️ Bloqueador conhecido
**Paid Applications Agreement no App Store Connect está com status "Novo"** (não assinado). Precisa ser resolvido antes da Fase 2 terminar — sem ele, TestFlight com IAP quebra com o mesmo erro atual.

---

## 7. Features Nativas (detalhes de implementação)

### Apple Health (HealthKit)
**Lê:** peso, percentual de gordura, bpm, resting HR, passos, calorias ativas.  
**Escreve:** `HKWorkout` com duração/tipo/calorias; heart rate samples (se Watch conectado).  
**Permissões:** solicitadas no onboarding. Se negado, app funciona sem integração.

### Apple Watch Companion
- Iniciar/executar treino, timer de série, marcar série completa
- Frequência cardíaca real-time durante treino
- Registrar treino offline (sem iPhone por perto) e sync quando reconectar (fase 2 Watch)
- Tech: `WatchConnectivity` + `HealthKit` (disponível no watchOS)

### Live Activities + Dynamic Island
- Timer de descanso aparece na Dynamic Island durante treino
- Lock Screen: card com countdown + botão "Pular"
- StandBy mode: card horizontal quando carregando
- Tech: `ActivityKit` (iOS 16.1+)
- Limitação Apple: 8h máx + 8h extensão (mais que suficiente)

### Widgets (Home + Lock Screen)
1. **Próximo treino** — split do dia + botão iniciar
2. **Streak diário** — dias consecutivos com chama 🔥
3. **Nutrição do dia** — calorias/macros consumidos vs meta
4. **Progresso semanal** — barra de treinos concluídos

Tamanhos: small (Lock Screen circular/rectangular), medium, large (Home Screen).  
Tech: `WidgetKit` + `AppIntents` (widgets interativos iOS 17+).

### Siri Shortcuts / App Intents
- "Iniciar treino de peito" → abre app na tela correta
- "Registrar refeição" → abre Nutrition com câmera pronta
- "Quanto falta pra minha meta?" → Siri responde inline

Tech: `AppIntents` framework. Usuário cria automações customizadas no Atalhos.

### Face ID para dashboard VIP
Opcional — usuário pode ativar em Settings. Protege visualização de histórico de pagamento, próxima cobrança.  
Tech: `LocalAuthentication`.

---

## 8. Performance ("Instagram-level smoothness")

### Metas mensuráveis (CI gates)

| Métrica | Target | Ferramenta |
|---|---|---|
| Cold start (iPhone 13+) | < 1.2s | Instruments > App Launch |
| Warm start | < 400ms | Instruments |
| Scroll feed | 120fps ProMotion / 60fps mínimo | Instruments > SwiftUI View Bodies |
| Primeira imagem do feed | < 200ms após scroll parar | Network + Image Decode profiling |
| Ação → UI reage | < 16ms (1 frame) | Optimistic UI sempre |
| Memory baseline | < 150MB | Instruments > Allocations |
| Main thread blocks | zero > 16ms | Thread Sanitizer |

### 10 regras técnicas obrigatórias

1. **Optimistic UI em 100% das ações do usuário.** Exceção apenas para pagamento.
2. **Lazy loading + prefetch preditivo** em listas (pre-fetch quando usuário está a 5 items do fim).
3. **Thumbnails progressivos** — `thumb` → `medium` → `full` conforme interação.
4. **Main thread só pra UI.** Tudo que demora > 1ms vai pra background (`Task.detached`, `@ModelActor`).
5. **Cache agressivo de imagens:** in-memory (NSCache 100MB) + disk (500MB LRU) + URL cache HTTP.
6. **Pre-warming no splash** (~500ms): hidrata SwiftData, Auth session, thumbs do dashboard, RevenueCat.
7. **Scroll nunca bloqueado.** Nada de `GeometryReader` em células. Evitar `.animation()` globais.
8. **Observation escopado.** Views observam só o que precisam (granular, não struct inteira).
9. **Imagens decodificadas off-main** — `UIImage(data:)` em background queue, entregar já decodificada.
10. **Zero memory leaks** — `weak self` em closures de Supabase/Realtime. Instruments > Leaks roda em CI.

### Recommendations técnicas
- **Imagens remotas:** lib [Nuke](https://github.com/kean/Nuke) (30% menos memória e 2x mais rápido que Kingfisher em iOS 17)
- **Listas longas:** `LazyVStack` em `ScrollView` pra controle fino. Compor views como `struct` pequenos.
- **Feed social:** pre-fetching agressivo (próximos 3–5 items em background)
- **Animations:** `.animation(.snappy)` (iOS 17+) ao invés de `.easeInOut`

---

## 9. Notifications / Push

### Stack
- Remote push: APNs diretamente via `UNUserNotificationCenter` (sem intermediário)
- `NotificationService` extension: modifica payload, pré-baixa imagens
- `NotificationContent` extension: UI customizada para notificações longas (opcional)
- Local notifications: `UNTimeIntervalNotificationTrigger` / `UNCalendarNotificationTrigger` — sobrevivem reboot

### Categorias

```swift
enum NotificationCategory: String {
    case restTimer          // REST_TIMER (existente)
    case workoutReminder
    case streak
    case socialActivity     // like, comment, follow
    case vipEvent           // renovação, trial expirando
    case chefIA             // resposta longa do chef
    case generalAnnouncement
}
```

### REST_TIMER (o que hoje buga no Capacitor)

**Fix nativo:**
1. `UNUserNotificationCenter.add(UNNotificationRequest(trigger: UNTimeIntervalNotificationTrigger))` — agendamento no kernel iOS, sobrevive WebView morto
2. Live Activity paralela via ActivityKit → visível na Dynamic Island
3. Actions "Pular" (`skipRest`) e "+30s" (`extendRest`) registradas como `UNNotificationAction` na categoria `restTimer`
4. Tap na action → iOS acorda app em background → `AppDelegate.didReceive(response:)` atualiza SwiftData → Live Activity refresh
5. Deep link via `NSUserActivity` → abre tela do timer com state preservado

### Push para feed/stories

Padrão Instagram: `NotificationService` pré-baixa avatar e thumb do post antes da notificação aparecer. Usuário abre e imagem já está no cache local.

### Deep links
Cada push inclui `deep_link` no payload. Handler converte em `NSUserActivity` → SwiftUI navegação via `.onContinueUserActivity(_:perform:)`.

### Registro de device token
No app launch: pede permissão → `UIApplication.shared.registerForRemoteNotifications()` → POST para `/api/devices/register` (endpoint novo no Vercel) → grava em `user_devices` do Supabase.

### Backend
`/api/notifications/send` envia via APNs HTTP/2 direto (bib `node-apn` ou `apn`). Sem Firebase.

---

## 10. Plano de Release / Fases

**Total estimado: ~24 semanas (~6 meses)**

| Fase | Descrição | Semanas | Acumulado |
|---|---|---|---|
| 0 | Setup (Xcode, SPM, certificados, CI/CD, fastlane, Sentry, RC nativo) | 1 | 1 |
| 1 | Core Foundation (Supabase, Networking, DataStore, DesignSystem, Auth) | 3 | 4 |
| 2 | Workouts + Apple Health + Watch companion + Live Activities + REST_TIMER push | 5 | 9 |
| 3 | Nutrition + Chef IA + todos os 7 endpoints de IA | 4 | 13 |
| 4 | Social + Stories (feed 120fps com pre-fetch) | 3 | 16 |
| 5 | VIP (paywall nativo, Face ID) + Widgets + Siri Shortcuts | 3 | 19 |
| 6 | Polish + performance audit + acessibilidade + i18n + TestFlight amplo | 2 | 21 |
| 7 | Submit App Store 2.0.0 + Phased Release (1%→100% em 7 dias) | 2 | 23 |
| — | Margem pra imprevistos | 1 | **24** |

### Milestones críticos
- **Final Fase 1:** TestFlight interno com login funcionando
- **Final Fase 2:** TestFlight amplo (50 beta users). Treinar já é melhor que no Capacitor.
- **Final Fase 5:** Todas as features portadas + novas. Paridade atingida.
- **Final Fase 7:** 2.0.0 em 100% dos usuários.

### Pré-requisitos externos (bloqueadores)

Antes da Fase 5 (IAP) entrar em TestFlight:
- [ ] **Paid Applications Agreement assinado** no App Store Connect (status atual: "Novo")
- [ ] Requisitos DSA (União Europeia) completos
- [ ] Produtos IAP em "Ready to Submit" no ASC: `vip_start1_month`, `vip_pro1_month`, `vip_elite1_month` (+ `yearly`/`lifetime` se for manter)

---

## 11. Riscos e Mitigações

### Técnicos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Paid Apps Agreement não assinado | Confirmado | Alto | Assinar antes da Fase 2 terminar |
| Dados em `localStorage` do Capacitor não migrados | Médio | Médio | Audit antes da Fase 6, script de migração no primeiro launch |
| Apple rejeita 2.0.0 | Baixo | Alto | Buffer 1 semana + Phased Release |
| SwiftData bug em edge case | Médio | Médio | Fallback CoreData em package separado (improvável em 2026) |
| supabase-swift lag em features | Médio | Baixo | Fallback URLSession direto no PostgREST |
| Realtime WebSocket instável | Baixo | Baixo | Reconnect exponencial + polling por tabela crítica |
| Performance abaixo das metas | Médio | Alto | Instruments pass obrigatório em cada fase (não só no fim) |

### Produto

| Risco | Mitigação |
|---|---|
| Usuário estranha UI nativa ao abrir 2.0.0 | Changelog in-app na primeira abertura destacando os ganhos |
| Review 1-estrela por "quebraram meu app" | Phased Release 1%→100% em 7 dias, monitor Sentry + reviews (pausar se crash rate > 2%) |
| Feature parity ter gap não-visto | QA checklist com os 47 fluxos críticos do Capacitor, QA manual pré-submit |

### Migração de dados (primeiro launch 2.0.0)

```swift
func migrateFromCapacitorIfNeeded() {
    let key = "migrated_from_capacitor_v1"
    guard !UserDefaults.standard.bool(forKey: key) else { return }
    
    // 1. Capacitor Preferences plugin grava em UserDefaults (mesmo container)
    //    → ler chaves relevantes e converter
    if let savedTheme = UserDefaults.standard.string(forKey: "CapacitorStorage.theme") {
        DesignSystem.applyTheme(savedTheme)
    }
    
    // 2. Fila offline em localStorage (via WKWebsiteDataStore) — recuperar se existir
    
    // 3. Dados no Supabase intactos — nada a migrar
    
    UserDefaults.standard.set(true, forKey: key)
}
```

Executa em `@main → init()`, blocking no máx 500ms, falha silenciosa.

### Rollback plan

1. **Pausar Phased Release** no ASC (1 clique)
2. **Patch hotfix** → submit 2.0.1 urgente (Apple prioriza)
3. Se impossível consertar rápido → submit de emergência da versão 1.x.y anterior (doloroso, Apple permite com justificativa)

Nunca removemos o build 1.x do Capacitor da store até o 2.0.0 estar 100% estável por 2 semanas.

---

## 12. Open Questions / Decisões pra Fase de Implementação

Estas são decisões menores que podem ser tomadas durante o plano de implementação, mas ficam documentadas aqui:

1. **CI/CD:** Xcode Cloud vs GitHub Actions? Fastlane é comum a ambos. Decidir na Fase 0.
2. **Localização:** String Catalogs a partir do dia 1, mas quais idiomas no 2.0.0? Mínimo: pt-BR + en.
3. **Testing framework:** XCTest tradicional ou Swift Testing (novo em iOS 18)? Recomendação: Swift Testing pra código novo, XCTest pra UI tests.
4. **Coordinator pattern:** NavigationStack puro ou Coordinator customizado? Recomendação: NavigationStack puro no v1, avaliar Coordinator se virar complexo.
5. **Swift Charts vs lib externa** para gráficos do dashboard? Recomendação: Swift Charts (nativo, iOS 16+).
6. **Telemetria detalhada de performance** — PostHog, Amplitude, Firebase Performance? Decidir na Fase 6.

---

## 13. Definition of Done (release 2.0.0)

- [ ] 100% das features do Capacitor portadas e testadas
- [ ] Apple Health integrado (read + write workouts)
- [ ] Watch companion funcional (timer, marcar série, bpm)
- [ ] Live Activities funcionando na Dynamic Island
- [ ] 4 widgets publicados
- [ ] Siri Shortcuts operacionais
- [ ] Todas as 7 metas de performance da Seção 8 batidas em CI
- [ ] VoiceOver 100% funcional em fluxos críticos
- [ ] Dynamic Type + dark mode + reduced motion respeitados
- [ ] i18n completo (pt-BR + en)
- [ ] Zero crashes críticos no TestFlight amplo por 1 semana
- [ ] QA manual de 47 fluxos críticos aprovado
- [ ] Paid Applications Agreement assinado no ASC
- [ ] Produtos IAP aprovados no ASC
- [ ] App Store assets atualizados (screenshots, vídeo, descrição)
- [ ] Phased Release configurado
- [ ] Rollback plan documentado e testado

---

**Próximo passo:** escrever o plano de implementação detalhado usando o skill `superpowers:writing-plans`.
