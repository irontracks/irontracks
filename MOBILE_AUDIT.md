# IronTracks Mobile Audit
Data: 2026-05-13

## Resumo executivo

- **Android é projeto morto**: Capacitor 8 + Kotlin plugin paralelo, mas **sem Firebase / FCM configurado** (sem `google-services.json`), sem foreground service pra rest timer, sem Live Activity equivalente (ongoing notification rica), sem Wear OS app. Plugin Kotlin (`IronTracksNativePlugin.kt`) cobre ~10% do plugin iOS (~535 linhas vs 2.597 do Swift). versionCode 7 vs build iOS 37 — Android tá meses atrás.
- **iOS é o produto e tá MUITO bem**: plugin Swift de 2.597 linhas com Live Activities (rest + workout), App Intents (Siri + Shortcuts), SharePlay, geofencing, SQLite3 cache, Notification Service Extension com Communication Notifications, Watch app SwiftUI completo com HealthKit + GPS + WatchConnectivity. Único gap iOS sério: **sem Complications no Watch** — usuário perde acesso rápido na watch face.
- **Watch app sem Complications nem Workout Live Sync**: `IronTracksWatch.entitlements` tem só HealthKit (sem App Groups), Watch não tem widget de watch face (Complications), e o `WatchSessionManager` não responde a um treino em andamento via streaming de FC pro iPhone (só roda HKWorkoutSession isolado e manda summary ao fim).
- **Crash handling nativo é zero**: nenhum Sentry SDK nativo iOS/Android (só `@sentry/nextjs` no web shell rodando dentro do WKWebView). Crashes Swift/Kotlin do plugin custom NÃO são capturados, dSYMs não vão pro Sentry. `uploadSymbols=true` no ExportOptions só manda pra Apple Crashlytics nativo (sem dashboard).
- **Server-driven web app (`server.url = irontracks.com.br`)**: app shell sempre vai online no Vercel — **offline-first é fingido**: sem `webDir: 'out'` real funcionando, se a Vercel cair, o app não abre, apenas o que tá em SQLite native cache (queue + KV) salva. `webDir: 'out'` existe no `capacitor.config.ts` mas é ignorado quando `server.url` está setado (linha 7-8 do config admite isso).

## Findings (priorizados)

### F-001: Android sem `google-services.json` — push notifications quebradas em prod
- **Severidade**: 🔴 crítico
- **Plataforma**: Android
- **Localização**: `android/app/` (arquivo `google-services.json` ausente) + `android/app/build.gradle:64-71` aplica plugin condicionalmente
- **O que é**: O build Gradle tenta aplicar `com.google.gms.google-services` apenas se `google-services.json` existir. O arquivo NÃO existe — confirmei. Sem ele o Capacitor `@capacitor/push-notifications` no Android **não envia token nenhum** (não há instância FCM registrada).
- **Impacto**: usuários Android existentes em produção **não recebem nenhuma push**. Workouts, achievements, comeback, todas as mensagens críticas falham silenciosamente. Confirmar no Supabase quantos device tokens têm `platform = 'android'` — provavelmente zero ou muito antigos.
- **Fix**: criar projeto FCM, baixar `google-services.json`, jogar em `android/app/`, validar token entrega. **1d** (incluindo testar push real no device).

### F-002: Android sem foreground service pra rest timer — Doze mode mata o alarm
- **Severidade**: 🔴 crítico
- **Plataforma**: Android
- **Localização**: `android/app/src/main/java/com/irontracks/app/IronTracksNativePlugin.kt:126-179` (scheduleRestTimer), `RestTimerReceiver.kt:21-54`
- **O que é**: scheduleRestTimer usa `AlarmManager.setExactAndAllowWhileIdle` + ongoing notification "informativa". Em Android 14+ com Doze Mode agressivo (Samsung, Xiaomi, OnePlus), alarmes exatos podem ser atrasados em até ~10 minutos se app não tiver foreground service.
- **Impacto**: usuário fecha o app durante treino, descansa, alarme atrasa 5+ minutos — atrapalha o treino, mata o engajamento. Especialmente ruim em devices chineses.
- **Fix**: implementar ForegroundService `RestTimerService` com `notification.setOngoing(true)` + `Service.startForeground()` durante o descanso. Permission `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_HEALTH` (Android 14+). **2d** (service + lifecycle + testes em devices reais).

### F-003: Plugin Android é uma sombra do iOS — paridade 10%
- **Severidade**: 🔴 crítico (estratégico)
- **Plataforma**: Android
- **Localização**: `android/app/src/main/java/com/irontracks/app/IronTracksNativePlugin.kt` (535 linhas vs 2597 do iOS)
- **O que é**: features ausentes do plugin Android:
  - HealthKit equivalente: **Health Connect não implementado** (Android moderno tem Health Connect, equivalente ao HealthKit)
  - Live Activity equivalente: ongoing notification rica com countdown + progress NÃO existe
  - Geofencing: gym auto check-in não implementado (LocationServices.GeofencingClient)
  - Spotlight indexing: Google App Search / Slice equivalente não implementado
  - Speech recognition nativo
  - HealthKit sleep / steps / HR / HRV / RHR
  - Background tasks (WorkManager) — equivalente ao BGTaskScheduler
  - Siri Shortcuts equivalente — Android App Shortcuts não declarado
  - SharePlay equivalente — pode pular, não tem equivalente Android direto
  - Story video composition — MediaCodec nativo não implementado
  - SQLite3 cache — não implementado (Android cai pro fallback IDB/FS, mais lento)
  - Live Activity push tokens
  - Watch (Wear OS) integration
- **Impacto**: app Android é fundamentalmente downgrade do iOS. Usuários Android pagantes pegam metade das features. Se Android crescer, vai ser pênalti técnico crônico.
- **Fix**: priorizar TOP 5 features Android (Health Connect, geofencing, ongoing notification rica, WorkManager, kvStore) — **1w + iteração contínua**. Considerar contratar Android dev sênior.

### F-004: Watch app sem Complications — perde acesso rápido
- **Severidade**: 🟡 médio
- **Plataforma**: Watch
- **Localização**: `ios/App/IronTracksWatch Watch App/` (sem `Complications/` dir, sem `ComplicationController.swift`, sem entry no Info.plist `CLKComplicationSupportedFamilies`)
- **O que é**: Watch app tem 4 telas (Dashboard, Workout, Cardio, Checkin) mas zero Complications. Usuário não consegue ver streak, próximo treino, ou abrir o app direto da watch face — único acesso é via lista de apps do Watch.
- **Impacto**: engagement do Watch fica baixo. Apps fitness que se destacam (Strong, Hevy, AutoSleep) usam Complications agressivamente como ponto de entrada.
- **Fix**: criar `IronTracksWatchComplications` extension target. Mínimo viável: streak counter na corner family + "Próximo treino" no graphicCircular. **1w** (incluindo design + Xcode wiring).

### F-005: Watch app NÃO tem App Group — não compartilha cache com iPhone
- **Severidade**: 🟡 médio
- **Plataforma**: Watch + iOS
- **Localização**: `ios/App/IronTracksWatch Watch App/IronTracksWatch.entitlements:1-11` (só HealthKit) + `ios/App/App/App.entitlements:1-20` (sem App Group também) + `IronTracksNativePlugin.swift:2306` comenta "entitlement still TODO — using app sandbox for now"
- **O que é**: A `IronTracksKVStore` (SQLite) deveria ser shareable via App Group (`group.com.irontracks.shared`). Hoje cada target (App, Widgets, Watch, NotificationService) tem sandbox isolado. Widgets não conseguem ler nem o streak do KV, NotificationService não consulta o token cache pra deduplicar, Watch app duplica dados que iPhone já tem.
- **Impacto**: Watch app sempre depende de `WCSession.isReachable` — quando iPhone está distante (deixou em casa), Watch funciona em modo cego. Widgets em "Treinando..." stub. NotificationService não consegue customizar título de push.
- **Fix**: criar App Group `group.com.irontracks.shared`, adicionar em todos os 4 entitlements, atualizar `IronTracksKVStore.dbPath()` pra usar `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`. **3h** + 1d de migração de dados.

### F-006: Watch HealthKitManager.heartRateBuffer cresce sem bound — leak silencioso
- **Severidade**: 🟡 médio
- **Plataforma**: Watch
- **Localização**: `ios/App/IronTracksWatch Watch App/Services/HealthKitManager.swift:37,187`
- **O que é**: `heartRateBuffer: [Int] = []` recebe `.append(bpm)` a cada novo sample HR durante a sessão sem cap. Numa corrida de 1h o Watch coleta ~300-600 samples (1 a cada 6-12s). Em sessão longa (2-3h trail run) o buffer pode chegar a 1500+ inteiros. Não é catastrófico mas o `avgHeartRate = buffer.reduce(0,+) / count` recalcula full sum a cada novo sample.
- **Impacto**: drena bateria do Watch em runs longos. Watch já tem RAM constraint forte (256MB-1GB dependendo do modelo) — buffer + UI + WCSession + HK podem causar crash em treinos longos.
- **Fix**: usar média móvel incremental: `avgHeartRate = (avgHeartRate * (n-1) + newBpm) / n`. Ou cap o buffer em 600 (~6h de HR). **30min**.

### F-007: Plugin iOS força-unwraps HKQuantityType — risco de crash em devices sem HealthKit
- **Severidade**: 🟡 médio
- **Plataforma**: iOS
- **Localização**: `ios/App/App/IronTracksNativePlugin.swift:1388,1391,1392,1393,1394,1395,1397`
- **O que é**: `HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!` — force-unwrap. Em dispositivos onde HealthKit retorna nil (iPad Air não-Cellular sem HealthKit, ou Apple TV), o app crasha hard no requestHealthKitPermission.
- **Impacto**: iPad users (sub-população real) podem ver crash de launch quando o app pede permissão HK no onboarding. O guard `HKHealthStore.isHealthDataAvailable()` na linha 1382 cobre o caso geral mas NÃO cobre o caso de quantityType retornar nil mesmo em device com HK disponível (raríssimo mas possível em iOS beta).
- **Fix**: usar `guard let` em cada `quantityType(forIdentifier:)` e fallar gracefully se algum tipo essencial faltar. **30min**.

### F-008: AppDelegate force-cast em BGTask — crash potencial
- **Severidade**: 🟢 baixo (mas evitável)
- **Plataforma**: iOS
- **Localização**: `ios/App/App/AppDelegate.swift:39,45`
- **O que é**: `task as! BGAppRefreshTask` — force cast. Se iOS um dia entregar o tipo errado (improvável mas o `as?` resolveria sem custo).
- **Impacto**: theoretically zero hoje, mas é code smell. Sentry mostraria stack trace claríssimo se acontecer.
- **Fix**: `guard let task = task as? BGAppRefreshTask else { ... }`. **5min**.

### F-009: Watch sendCardioFinish não usa transferUserInfo retry — perde dados se iPhone offline
- **Severidade**: 🟡 médio
- **Plataforma**: Watch
- **Localização**: `ios/App/IronTracksWatch Watch App/Models/WatchSessionManager.swift:93-110`
- **O que é**: `sendMessage` falha → fallback pra `transferUserInfo` é OK, mas se o WCSession nem ativou (`activationState != .activated`), o cardio é só `self.lastError = "Sessão Watch não ativa"` e os dados se perdem. Não há fila local persistida no UserDefaults/SQLite do Watch.
- **Impacto**: usuário termina corrida de 1h, Watch sem reach (modo avião), perde cardio sem feedback. Especialmente ruim em trilhas remotas.
- **Fix**: implementar fila local no Watch (UserDefaults + JSON ou SQLite leve) que recupera quando session activa. Apple recomenda `transferUserInfo` que já tem queueing nativo, mas falta o caso de session inativa. **1d**.

### F-010: Plugin iOS não captura crashes Swift — Sentry só pega JS
- **Severidade**: 🔴 crítico
- **Plataforma**: iOS + Android
- **Localização**: `package.json` (sem `@sentry/capacitor` ou `sentry-cocoa`) + `ios/App/App/*.swift` (nenhum import Sentry)
- **O que é**: O projeto usa `@sentry/nextjs` que roda dentro do WKWebView. Crashes do plugin custom Swift (force unwraps, geofence delegate bugs, HKWorkoutSession failures) **não vão pro Sentry**. Mesmo em Android (Kotlin plugin) — nenhum Sentry Android SDK configurado.
- **Impacto**: crashes nativos invisíveis até usuário reclamar via App Store review. Crash-free rate desconhecido. dSYMs sobem pra Apple via `uploadSymbols=true` mas Apple Crashlytics não tem dashboard útil.
- **Fix**: instalar `sentry-cocoa` no iOS via SPM (init em AppDelegate), `sentry-android` via Gradle. Configurar `auth-token` pra upload de dSYMs/mappings automático no script de release. **1d**.

### F-011: capacitor.config.ts aponta direto pra Vercel — app não funciona se domínio cair
- **Severidade**: 🟡 médio
- **Plataforma**: Capacitor
- **Localização**: `capacitor.config.ts:10-15`
- **O que é**: `server.url = 'https://irontracks.com.br'`. Não há fallback pro `webDir: 'out'` (Next.js static export) embutido. Se o domínio Vercel cair ou cert expirar, todos os apps em produção param de carregar. Usuário só vê tela branca.
- **Impacto**: dependência absoluta da Vercel disponibilidade. SLA do app = SLA da Vercel.
- **Fix**: dois caminhos:
  1. **Fácil**: criar página `out/offline.html` minimal com mensagem "Sem conexão. Tente novamente em alguns minutos." que carrega via Capacitor `errorPath`.
  2. **Robusto**: ship build estático do app em `out/` + service worker que tenta cache-first. Permite uso offline real do dashboard cacheado. **2d** pro robusto, **30min** pro fácil.

### F-012: Watch app não usa WKExtendedRuntimeSession durante cardio — pode ser killed
- **Severidade**: 🟡 médio
- **Plataforma**: Watch
- **Localização**: `ios/App/IronTracksWatch Watch App/Views/CardioView.swift:185-204` (startCardio)
- **O que é**: Durante cardio o `HKWorkoutSession` mantém a app rodando em background MAS apenas durante `workout-processing`. Se o usuário pausa o cardio (`health.pause()` na linha 209) o iOS pode killar o app em segundos. Não há `WKExtendedRuntimeSession` que mantenha a UI viva durante pauses ou stretches longos.
- **Impacto**: usuário pausa cardio pra atender ligação → volta → app fechou → dados parciais perdidos. Reclamação clássica de runner.
- **Fix**: durante pause, iniciar `WKExtendedRuntimeSession(reason: .physicalTherapy)` (legal pra fitness pausado). Encerrar no resume. **2h**.

### F-013: Capacitor pug `@capacitor-mlkit/barcode-scanning` versão 8 + Android sem teste
- **Severidade**: 🟢 baixo
- **Plataforma**: Android
- **Localização**: `package.json:58` + Android plugin não tem ML Kit Vision dependency declarada em `android/app/build.gradle`
- **O que é**: `@capacitor-mlkit/barcode-scanning ^8.0.1` está no JS, mas o `android/app/build.gradle` não declara `play-services-vision` nem `com.google.mlkit:barcode-scanning`. Ou o Capacitor sync auto-instala (provável), ou está broken em Android.
- **Impacto**: scanner de barcode (provável feature de nutrição/check-in) pode não funcionar em Android.
- **Fix**: validar via `cap:sync:android` que dependências MLKit foram adicionadas em `android/capacitor.build.gradle`. Testar barcode em device Android. **30min** validação.

### F-014: NotificationService rich notification sem cache — re-download a cada push
- **Severidade**: 🟢 baixo
- **Plataforma**: iOS
- **Localização**: `ios/App/NotificationService/NotificationService.swift:58-89`
- **O que é**: cada push com `image_url` baixa o asset toda vez via `URLSessionConfiguration.ephemeral` (sem cache). Push de "story posted" do mesmo usuário (avatar idêntico) baixa avatar a cada push.
- **Impacto**: data wasted, latência marginal extra. Em dia de muitos pushes (community ativa) usuário queima dados móveis.
- **Fix**: usar `URLCache.shared` ou cache app-group com TTL 24h. **2h**.

### F-015: `composeStoryVideo` usa DispatchSemaphore.wait em queue global — pode deadlock
- **Severidade**: 🟡 médio
- **Plataforma**: iOS
- **Localização**: `ios/App/App/IronTracksNativePlugin.swift:1821-1849, 2011-2026`
- **O que é**: O método agenda na `.global(qos: .userInitiated)` e dentro do bloco usa `DispatchSemaphore(value: 0); semaphore.wait()` (linha 2011, 2026). Se outro caller pra `composeStoryVideo` chegar enquanto a primeira tá rodando, ambos competem pelo `activeExportSession` propriedade compartilhada — race condition. O semaphore.wait bloqueia uma thread inteira do pool global.
- **Impacto**: dois videos de story compondo simultaneamente (raro mas possível em flow de import multi-arquivo) podem corromper estado. Bloquear thread global por 3-8s tira recursos de outras chamadas Capacitor.
- **Fix**: refatorar pra `withCheckedThrowingContinuation` em `Task { await ... }`, sem semaphore. Mutex em `activeExportSession` com `DispatchQueue.sync`. **3h**.

### F-016: SceneDelegate registra plugin via "becomeActive" — pode race com early JS calls
- **Severidade**: 🟢 baixo
- **Plataforma**: iOS
- **Localização**: `ios/App/App/SceneDelegate.swift:17-25`
- **O que é**: `registerPluginInstance(IronTracksNativePlugin())` roda em `sceneDidBecomeActive`. Se o web shell carregar via `server.url` ANTES da scene ficar ativa (improvável mas possível em cold-start com WKWebView prefetch), uma chamada `IronTracksNative.someMethod()` pode lançar "plugin not implemented". O `registerPlugin` em `irontracksNative.ts:218-224` tem try/catch que cai pro `webFallback` (silent fail).
- **Impacto**: primeiros segundos do cold start podem ter side-effects nativos perdidos (Live Activity stale não termina, push token não chega). Raríssimo em prática mas explica bugs intermitentes.
- **Fix**: registrar plugin em `scene(_:willConnectTo:)` em vez de `sceneDidBecomeActive`, ou registrar no `application(_:didFinishLaunchingWithOptions:)` do AppDelegate via Plugin registry global. **30min**.

### F-017: Sem release script Android — manual gradle assembleRelease + upload
- **Severidade**: 🟡 médio
- **Plataforma**: Android
- **Localização**: `scripts/` (sem `android-release.sh` nem fastlane config)
- **O que é**: o iOS tem `scripts/ios-release.sh` (build + archive + upload TestFlight automatizado) e `scripts/ios-submit.mjs` (submit pra review). Android exige abrir Android Studio, Generate Signed Bundle, upload manual no Play Console. Em projeto com `npm run deploy` automatizando Vercel, o Android fica como cidadão de segunda classe.
- **Impacto**: releases Android ficam meses atrás de iOS porque o trabalho manual desincentiva. Versão atual confirma: versionCode 7 (Android) vs build 37 (iOS).
- **Fix**: criar `scripts/android-release.sh`:
  ```bash
  ./gradlew bundleRelease
  # upload via gcloud/fastlane upload_to_play_store
  ```
  + script Node usando Google Play Developer API. **1d** initial setup + 4h pra automation completa.

### F-018: PrivacyInfo.xcprivacy parcial — falta Capacitor SDK declarations
- **Severidade**: 🟢 baixo
- **Plataforma**: iOS
- **Localização**: `ios/App/App/PrivacyInfo.xcprivacy:1-60+`
- **O que é**: Privacy manifest declara EmailAddress, Name, Photos, Audio — mas falta declarar APIs comumente flagadas pela Apple: `NSPrivacyAccessedAPICategoryUserDefaults` (usado massivamente pelo plugin), `NSPrivacyAccessedAPICategoryDiskSpace`, `NSPrivacyAccessedAPICategorySystemBootTime`. Apple rejeita apps em review se o manifest tá incompleto vs `xcrun privacy-validation` output.
- **Impacto**: futura review rejection ou app pulled inesperadamente. Pequena chance hoje, mas Apple aperta a cada release.
- **Fix**: rodar `xcrun privacy-manifest-tool --analyze` ou consultar https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api e completar. **2h**.

### F-019: Watch dashboard recebe `applicationContext` mas não persiste pra cold start vazio
- **Severidade**: 🟢 baixo
- **Plataforma**: Watch
- **Localização**: `ios/App/IronTracksWatch Watch App/Models/WatchSessionManager.swift:39-41`
- **O que é**: na init, lê `session.receivedApplicationContext` (Apple persiste o último context). MAS o `WatchDashboard` permanece em `.placeholder` se o iPhone NUNCA mandou contexto (Watch instalado novo, ou após reset). UI mostra "0 dias de streak, Olá Atleta" — feio.
- **Impacto**: primeira impressão do Watch app é vazia / quebrada se iPhone estiver desligado / longe.
- **Fix**: detectar "never synced" (lastSyncDate == nil) e mostrar estado "Abra o IronTracks no iPhone pra sincronizar". **1h**.

### F-020: Android `compileSdk = 36` + `targetSdk = 36` mas não há check-in de `play-services` versions
- **Severidade**: 🟢 baixo
- **Plataforma**: Android
- **Localização**: `android/variables.gradle`
- **O que é**: targetSdk 36 (Android 16) é OK, mas não vejo `androidxBiometricVersion`, `androidxBrowserVersion`, dependencies do Capacitor são todas via `project(:capacitor-*)`. Não tem lock em versão de `play-services-base` (Capacitor push notifications usa via transitive). Quando google-services.json for adicionado, pode haver conflito de versões.
- **Impacto**: build Android pode quebrar quando finalmente configurar FCM (F-001).
- **Fix**: junto com F-001, declarar explicitamente `implementation "com.google.android.gms:play-services-base:18.5.0"` etc. **15min** quando F-001 for tackleado.

### F-021: NotificationService timeout de 6s + Communication Upgrade — pode estourar 30s NSE budget
- **Severidade**: 🟢 baixo
- **Plataforma**: iOS
- **Localização**: `ios/App/NotificationService/NotificationService.swift:63-65`
- **O que é**: `timeoutIntervalForRequest = 6` + `timeoutIntervalForResource = 8`. Em rede ruim, 8s já consome quase um terço do budget de NSE. Depois roda Communication Notification upgrade (INSendMessageIntent.donate). Se a CDN estiver degradada (caso real), o handler pode não devolver a tempo.
- **Impacto**: alguns pushes (raros) caem para plain text sem imagem nem upgrade. `serviceExtensionTimeWillExpire` (linha 164) salva entregando o `bestAttemptContent` mas perde o intent donate (sem screen-wake).
- **Fix**: reduzir `timeoutIntervalForResource` pra 5s, deixar 25s pro upgrade. **5min**.

### F-022: Não há check de Apple Pay / IAP em iOS Watch app — usuários iniciam treino sem ser VIP
- **Severidade**: 🟡 médio
- **Plataforma**: Watch
- **Localização**: `ios/App/IronTracksWatch Watch App/Views/WorkoutView.swift:50-56` (onAppear inicia HKWorkoutSession sem checar entitlement) + `CardioView.swift:185-204` (startCardio idem)
- **O que é**: VIP é controlado via RevenueCat no iPhone. Watch app NÃO faz check. Usuário não-VIP que abriu o Watch app inicia treino, registra séries, completa cardio — tudo normal. Depois sincroniza com iPhone que rejeita ("user not VIP").
- **Impacto**: VIP gate parcialmente bypassable. Usuário no Watch pensa que app funciona, posta dados via WCSession que iPhone rejeita silenciosamente. Confusão de UX.
- **Fix**: incluir `isVip: Bool` no `WatchDashboard` payload (já tem campo `userName`, basta adicionar). Watch UI mostra paywall card "Faça upgrade no iPhone pra registrar treinos" se !isVip. **3h**.

### F-023: `watchOS` build/signing — sem `WatchKitAppBundleIdentifier` confirmado no app principal
- **Severidade**: 🟢 baixo
- **Plataforma**: iOS + Watch
- **Localização**: `ios/App/IronTracksWatch Watch App/Info.plist:32-34` declara `WKCompanionAppBundleIdentifier = com.irontracks.app`, OK. Mas o app principal (`ios/App/App/Info.plist`) não declara `WKAppBundleIdentifier` (deprecated pra WatchKit 2 mas ainda usado por App Store Connect pra parear targets).
- **Impacto**: pode haver erro de submission "Watch app not paired" no App Store Connect dependendo da versão Xcode. Build 37 atual aparentemente funciona, então não é blocker.
- **Fix**: confirmar via `xcrun altool --validate-app` se pareamento está OK. Provavelmente já tá. **15min** validação.

### F-024: SQLite `IronTracksKVStore.queue.sync` em métodos públicos — bloqueia caller
- **Severidade**: 🟢 baixo
- **Plataforma**: iOS
- **Localização**: `ios/App/App/IronTracksNativePlugin.swift:2376-2510` (kvSet, kvGet, queuePut etc todos `queue.sync`)
- **O que é**: cada call passa por `queue.sync { ... }` na queue serial `kvstore`. JS calls vindas pelo Capacitor bridge já não bloqueiam main thread (Capacitor dispatcha), MAS se múltiplas threads do app chamarem em paralelo, cada uma bloqueia até a queue serial liberar. Em uma sync de queue offline com 1000 jobs, fica `queue.sync` x 1000 = serial bottleneck.
- **Impacto**: sync de queue offline lenta (perceptível em 1000+ items).
- **Fix**: refactor pra async com `withCheckedContinuation`, ou batch APIs (`kvSetBatch`, `queueGetAllAsync`). Pra hoje OK porque queue raramente passa de 100 items. **4h** se quiser otimizar.

### F-025: Watch CardioView Timer.scheduledTimer em SwiftUI — não cancela em onDisappear
- **Severidade**: 🟢 baixo
- **Plataforma**: Watch
- **Localização**: `ios/App/IronTracksWatch Watch App/Views/CardioView.swift:18,197-202` — `@State private var timer: Timer?` setado em `startCardio()` mas sem `onDisappear { timer?.invalidate() }`. WorkoutView tem padrão similar (`Views/WorkoutView.swift:19,261-269`) — também sem invalidação.
- **O que é**: TabView no Watch troca views frequentemente. Timer.scheduledTimer continua disparando mesmo quando view some — atualiza state que ninguém mais lê, mas mantém ref strong na closure → leak.
- **Impacto**: pequeno leak por sessão Watch. Não é crítico (TabView mantém ContentView vivo) mas é code smell.
- **Fix**: adicionar `.onDisappear { timer?.invalidate(); timer = nil }`. **5min** por view.

## Pontos sãos validados

- **Live Activities (Rest + Workout)**: implementação muito completa — Dynamic Island compact/expanded/minimal, Lock Screen banner com botões interativos (iOS 17+ via `LiveActivityIntent`), auto-finish nativo independente de JS, push tokens observados, cleanup defensivo. (`ios/App/App/IronTracksNativePlugin.swift:455-770`, `ios/App/IronTracksWidgets/RestTimerWidget.swift`)
- **NotificationService Extension com Communication Notifications**: whitelist sólida de tipos, fallback gracioso, image download com timeout, donate INSendMessageIntent corretamente — alinhado com WhatsApp behavior. (`ios/App/NotificationService/NotificationService.swift`)
- **App Intents + Siri Shortcuts**: 5 intents (StartWorkout, StartSpecificWorkout, OpenLastWorkout, CheckStreak, OpenHistory), phrases em pt-BR, AppShortcutsProvider configurado, dynamic SuggestedWorkoutEntity via UserDefaults — bem pensado. (`IronTracksNativePlugin.swift:2133-2597`)
- **BGTaskScheduler**: handlers registrados antes do `didFinishLaunching` return, expirationHandler defendido, timeouts realistas (25s pra refresh, 60s pra processing), reagenda antes de fazer trabalho. (`AppDelegate.swift:35-120`)
- **WatchConnectivity bidirecional**: sendMessage com fallback transferUserInfo, applicationContext persiste estado, sessão activa em init, reachability + paired/installed observados. Wire protocol estável via enum WatchBridgeKind compartilhado entre iPhone e Watch. (`ios/App/App/WatchBridge.swift`, `ios/App/IronTracksWatch Watch App/Models/WatchSessionManager.swift`)
- **iOS release pipeline**: `scripts/ios-release.sh` (bump build via sed em pbxproj + xcodebuild archive + upload via export) + `scripts/ios-submit.mjs` (App Store Connect API via JWT, submit pra review programaticamente). Industrial-grade, raríssimo em app de um dev solo.
- **HealthKit no iPhone-side**: cobre quase tudo importante (workout save, steps, HR, RHR, HRV, active calories, sleep com fallback inBed vs asleep). (`IronTracksNativePlugin.swift:1375-1788`)
- **Geofencing**: throttle 4h, persistência via UserDefaults pra cold-start notif, request always permission com two-step flow corretamente implementado, monitora 1 região por vez (evita acumular). (`IronTracksNativePlugin.swift:1052-1199`)
- **Privacy manifest existe**: muitos projetos Capacitor não têm. Esse tem (`PrivacyInfo.xcprivacy`) — só precisa completar (F-018).
- **Multi-target Xcode bem organizado**: App, IronTracksWidgets, NotificationService, IronTracksWatch Watch App — todos com Info.plist próprios, entitlements próprios, scheme próprio. Padrão correto.
- **Watch app SwiftUI moderno**: `@MainActor`, `@StateObject`, async/await em HKHealthStore.requestAuthorization, decode tolerante em `WatchDashboard.init(from:)` para wire protocol evoluir sem quebrar Watch antigo. (`WatchSessionManager.swift:89-98`)

## Áreas não cobertas

- **Não rodei `xcodebuild archive`** ou `gradlew build` (lentos demais pelo escopo) — não validei build green real, só código estático.
- **Não testei push real** — só análise estática do código FCM + APNs. Quem tem como testar com device físico Android deve validar F-001 antes de qualquer release Android.
- **Não auditei `node_modules/@capacitor/**`** — confiei nas versões 8.x do package.json. Vulnerabilidades nos plugins do Capacitor (raras) não foram checadas.
- **Não testei perda de bateria real** — análise estática sugere alto consumo durante cardio (GPS contínuo + HR + Live Activity + push tokens rotating) mas não medi mWh.
- **iPad layout** — Info.plist suporta iPad orientations mas não vi tratamento de split-view ou multi-scene. Pode ser que UX iPad seja só "iPhone esticado". Fora do escopo deste audit (mais UX).
- **App Store screenshots & ASO** — fora do escopo (mencionado mas não auditado a fundo).
- **Resource size analysis** — `ios/App/App/Assets.xcassets/` não foi auditado pra ver se há imagens não comprimidas / sem @2x/@3x adequados.
- **Watch face Complications images** — não existem (parte do F-004) então não auditei design.
- **iOS Settings Bundle / In-App settings** — não verifiquei se app tem `Settings.bundle` pra integrar com Settings.app nativo.
- **Sentry Replay Mobile** (não existe ainda, mas mencionar): se for adotar Sentry nativo, considerar Replay também.

## Próximos passos sugeridos (ordenados por ROI)

1. **F-001 + F-020 (1d)**: configurar `google-services.json` + FCM no Android. Sem isso o Android está literalmente quebrado em produção. ROI imenso — destrava push pra metade dos usuários (assumindo split iOS/Android equilibrado, na verdade Android pode ser <10% mas mesmo assim é quebra contratual com quem comprou VIP).
2. **F-010 (1d)**: instalar Sentry nativo (cocoa + android). Não dá pra melhorar o que não se mede. Crash-free rate vira métrica imediata, e qualquer bug Swift novo do plugin (F-007, F-008) ganha visibilidade.
3. **F-002 (2d)**: foreground service Android pra rest timer. Pareado com F-001, deixa Android utilizável em devices chineses (Samsung especialmente). Sem isso, qualquer review Android negativo é justificado.
4. **F-005 (3h + 1d migração)**: App Group entitlement. Destrava Widgets de iOS lerem streak/treinos sem WCSession, NotificationService deduplicar pushes, Watch ter cache offline real. Fundação pra F-004 (Complications) também precisar.
5. **F-022 + F-009 (4h)**: gating VIP no Watch + fila local de cardio. Watch app vira robusto. Usuário que paga pelo Watch app não fica perdendo dados em trilhas.

Esses 5 itens são ~5 dias de trabalho focado e movem o produto de "iOS-only com Android quebrado" pra "ambas as plataformas profissionais". Tudo mais é otimização sobre uma base já sólida.
