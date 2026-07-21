# IronTracks — Apple Watch App

App nativo SwiftUI para watchOS 9.0+ que se comunica com o app iPhone (Capacitor) via **WatchConnectivity**. Funciona como companion: o iPhone é a fonte da verdade, o Watch é uma interface remota.

## Estrutura

```
IronTracksWatch Watch App/
├── IronTracksWatchApp.swift     # @main entry — instancia singletons via @StateObject
├── ContentView.swift            # Root com TabView de 4 telas (page style)
├── Models/
│   ├── SharedModels.swift       # Workout / Dashboard / Set / CardioSummary / WatchMessage
│   └── WatchSessionManager.swift # WCSession delegate + fila offline
├── Services/
│   ├── HealthKitManager.swift   # HKWorkoutSession + heart rate query + route builder
│   └── LocationManager.swift    # CLLocationManager c/ filter pipeline (accuracy, drift, spike)
├── Views/
│   ├── DashboardView.swift      # Streak + semana + próximo treino
│   ├── WorkoutView.swift        # Exercício atual, série, reps, timer descanso
│   ├── CardioView.swift         # GPS + pace + FC + calorias
│   └── CheckinView.swift        # Lista de academias próximas + check-in
├── Assets.xcassets/             # AppIcon (1024x1024) + AccentColor
├── Info.plist                   # WKApplication + companion bundle ID + permissions
└── IronTracksWatch.entitlements # HealthKit
```

## Lado iPhone (já configurado neste repo)

- **`ios/App/App/WatchBridge.swift`** — singleton WCSession do lado iPhone. Posta NotificationCenter eventos que o IronTracksNativePlugin reenvia pro JS.
- **`ios/App/App/IronTracksNativePlugin.swift`** — métodos `watchGetState`, `watchSendDashboard`, `watchSendWorkout`, `watchSendNearestGyms`. Eventos JS: `watchSetLogged`, `watchCardioFinished`, `watchRefreshRequested`, `watchCheckinRequested`, `watchReachabilityChanged`.
- **`src/utils/native/irontracksNative.ts`** — wrappers TS dos métodos.
- **`src/hooks/useWatchBridge.ts`** — hook React.
- **`src/components/WatchSyncProvider.tsx`** — componente headless que sincroniza automaticamente.

## Wire protocol

Cada mensagem é `{ kind: WatchMessageKind, payload: Data?, sentAt: Date }` serializada via `WCSession`.

### iPhone → Watch
| kind | payload | uso |
|---|---|---|
| `dashboard.update` | `WatchDashboard` JSON | Estado completo (streak, semana, próximo treino) |
| `workout.push` | `WatchWorkout` JSON | Atualizar treino do dia isoladamente |
| `gym.nearest` | `WatchGym[]` JSON | Lista pra tela de check-in |
| `session.auth` | reservado | (futuro) tokens pro Watch fazer chamadas diretas |

### Watch → iPhone
| kind | payload | iPhone faz |
|---|---|---|
| `refresh.request` | nenhum | revalida o dashboard via SWR/mutate |
| `set.log` | `WatchSetLog` | POST `/api/workouts/log-set-from-watch` |
| `cardio.finish` | `WatchCardioSummary` | POST `/api/gps/cardio/save` |
| `checkin.request` | `WatchGym` | POST `/api/gps/qr-checkin` |

## Fallback offline

`WatchSessionManager.sendMessage()` tenta `sendMessage` (instantâneo) e cai pra `transferUserInfo` (fila persistente entregue quando o iPhone vier). Mensagens críticas (`set.log`, `cardio.finish`, `checkin.request`) sempre usam `transmitOffline=true`.

## Como integrar no app web

Adicione `<WatchSyncProvider>` perto da raiz do AppShell autenticado:

```tsx
import WatchSyncProvider from '@/components/WatchSyncProvider'

<AppShell>
  <WatchSyncProvider
    dashboard={{
      streakDays: stats.currentStreak,
      weekWorkouts: stats.weekWorkouts,
      weekGoal: 5,
      nextWorkout: nextWorkoutForWatch,
      userName: user.firstName,
    }}
    nearestGyms={gymsWithinRadius}
    onRefresh={() => mutate()}
  />
  {children}
</AppShell>
```

O componente é headless — não renderiza nada visual, apenas sincroniza.

## Endpoints que precisam ser criados no servidor

- `POST /api/workouts/log-set-from-watch` — recebe `WatchSetLog` e adiciona à última sessão de treino aberta
- `POST /api/gps/cardio/save` — **já existe** (estende pra aceitar `source: 'apple-watch'`)
- `POST /api/gps/qr-checkin` — **já existe** (estende pra aceitar `source: 'apple-watch'`)

## Build / Run

### Pré-requisitos
1. **Xcode 26.4+** (já instalado)
2. **watchOS 26.4 Simulator runtime** instalado via:
   - Xcode → Settings → Components → watchOS 26.4 → Get
   - OU `xcodebuild -downloadPlatform watchOS` (tem bug de duplicate em algumas máquinas — instalar via UI é mais confiável)
3. **HealthKit capability** habilitado para o bundle `com.irontracks.app.watchkitapp` no Apple Developer Portal

### Compilação validada
```bash
# Watch sozinho compila zero-erros (typecheck Swift):
cd ios/App
files=()
while IFS= read -r f; do files+=("$f"); done < <(find "IronTracksWatch Watch App" -name "*.swift")
xcrun swiftc -typecheck -sdk $(xcrun --sdk watchos --show-sdk-path) -target arm64-apple-watchos9.0 "${files[@]}"
```

### Build full (após instalar watchOS 26.4 runtime)
```bash
cd ios/App
xcodebuild -workspace App.xcodeproj/project.xcworkspace -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  archive -archivePath build/IronTracks.xcarchive
```

### Helper scripts criados
- `scripts/add-watch-target.rb` — idempotente, cria o Watch target no pbxproj (já rodado)
- `scripts/add-watch-bridge-file.rb` — adiciona `WatchBridge.swift` ao target App (já rodado)
- `scripts/toggle-watch-assets.rb` — habilita/desabilita asset catalog (debug do actool)

## Complications (watch face)

Extensão WidgetKit separada em **`ios/App/IronTracksWatchComplications/`**, embutida no
Watch App (`PlugIns/`). Duas complications:

| Complication | Famílias | Mostra |
|---|---|---|
| **Ofensiva** | circular, canto, inline | dias seguidos + anel da meta semanal |
| **Treino de hoje** | retangular, inline | nome do treino, nº de exercícios, semana |

**Como os dados chegam lá:** app e extensão são processos separados — a ponte é o App
Group `group.com.irontracks.shared`. `WatchSessionManager` grava um
`WatchComplicationSnapshot` via `WatchSharedStore` a cada sync e chama
`reloadAllTimelines()`. O store **ignora escritas sem mudança de conteúdo**: o watchOS dá
um orçamento diário de reloads por complication e queimá-lo faz a face congelar no fim do
dia.

**Toque na complication** abre o app já na aba certa (`irontracks://watch/<aba>`,
tratado no `onOpenURL` do `ContentView`).

Recriar/atualizar o target: `ruby scripts/add-watch-complications-target.rb` (idempotente).

## Timer de descanso

`Services/RestTimerEngine.swift`. A fonte da verdade é uma **data de término**, não um
contador — o tempo é sempre derivado do relógio, então não desvia quando o app sai de
foreground (pulso abaixado, Always-On, troca de app). A UI usa `TimelineView`, que
continua redesenhando em Always-On. Avisos: háptico a cada segundo nos últimos 3,
háptico forte no fim, e uma notificação local como rede de segurança caso o app tenha
sido suspenso.

## Versionamento

Os `Info.plist` do Watch App e da extensão usam `$(MARKETING_VERSION)` e
`$(CURRENT_PROJECT_VERSION)` — as versões acompanham o app iOS automaticamente.
(Antes estavam *hardcoded* em 1.9/36 enquanto o app já ia em 1.15/67, e o bump do
`ios:release` nunca as alcançava.)

## Estado atual da entrega

✅ Watch App + extensão de Complications compilando e empacotando
   (`App.app/Watch/…/PlugIns/IronTracksWatchComplications.appex`)
✅ Target no pbxproj (bundle, build settings, embed phase, dependency)
✅ WatchConnectivity bridge no iPhone (com NotificationCenter relay)
✅ `WatchSyncProvider` montado em `DashboardProviders` + endpoint `log-set-from-watch`
✅ Digital Crown pra carga/reps, encerramento explícito do treino, rótulos de acessibilidade

⚠️ **Capability HealthKit**: precisa estar habilitada no developer portal pro bundle
`com.irontracks.app.watchkitapp` (e o App Group pro `.complications`) pra assinar o archive.

### Build

```bash
# Watch App isolado (sem assinar)
cd ios/App && xcodebuild build -project App.xcodeproj \
  -scheme "IronTracksWatch Watch App" -destination 'generic/platform=watchOS' \
  CODE_SIGNING_ALLOWED=NO

# App completo com Watch + complications embutidos
cd ios/App && xcodebuild build -project App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS' -configuration Release CODE_SIGNING_ALLOWED=NO

# Release pra TestFlight (assina e envia)
npm run ios:release
```
