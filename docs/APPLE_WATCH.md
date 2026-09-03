# Apple Watch — mapa, protocolo e armadilhas

O IronTracks tem um **app watchOS completo**, não só o widget de tela bloqueada.
Este arquivo existe porque em 02/09/2026 o dono perguntou "como o app coleta as
informações do Apple Watch?" e a resposta custou uma investigação inteira: o
`CLAUDE.md` não mencionava o app do relógio em lugar nenhum, e a única linha que
citava `scripts/add-watch-target.rb` falava dele como se fosse coisa do widget.

## Onde mora o quê

| Alvo Xcode | Caminho | O que é |
|---|---|---|
| `IronTracksWatch Watch App` | `ios/App/IronTracksWatch Watch App/` | App watchOS (SwiftUI), 4 abas em `TabView(.page)` |
| `IronTracksWatchComplications` | `ios/App/IronTracksWatchComplications/` | Complications do mostrador (WidgetKit) |
| `IronTracksWidgets` | `ios/App/IronTracksWidgets/` | **Outra coisa**: Live Activity / Ilha Dinâmica do iPhone |

Dentro do Watch App: `Views/` (Dashboard, Workout, Cardio, Checkin, VipGate),
`Services/HealthKitManager.swift` (dono da `HKWorkoutSession`),
`Services/LocationManager.swift` (GPS com filtro), `Models/WatchSessionManager.swift`
(WCSession + fila offline), `DesignSystem/Brand.swift` (cor/superfície/tipografia).

Lado iPhone: `ios/App/App/WatchBridge.swift` (WCSession), os métodos `watch*` em
`IronTracksNativePlugin.swift`, e no JS `src/hooks/useWatchBridge.ts` +
`src/components/WatchSyncProvider.tsx` (headless, montado em `DashboardProviders`).

## Dois sistemas de cardio, não um

- **iPhone sozinho** (o que todo usuário usa): `useCardioTracking.ts` + um
  `CLLocationManager` nativo próprio no plugin Swift. **Não usa HealthKit.**
  Distância por haversine, calorias por modelo MET.
- **Watch**: `HKWorkoutSession` própria com `HKLiveWorkoutBuilder`, FC ao vivo e
  GPS do relógio. É uma segunda implementação, independente.

O HealthKit no app iPhone existe para outra coisa: ler passos/FC/sono e gravar o
treino de FORÇA como `HKWorkout`. Não participa do cardio.

## Protocolo (WatchConnectivity)

`{ kind, payload, sentAt }`, encoder/decoder `.iso8601` em todos os pontos.

| kind | sentido | iPhone faz |
|---|---|---|
| `dashboard.update`, `gym.nearest` | iPhone → Watch | — |
| `workout.push` | iPhone → Watch | **código morto**: cadeia completa, zero chamadores |
| `session.auth` | — | **código morto**: declarado nos dois lados, emitido por ninguém |
| `refresh.request` | Watch → iPhone | revalida o dashboard |
| `set.log` | Watch → iPhone | `POST /api/workouts/log-set-from-watch` |
| `cardio.finish` | Watch → iPhone | `POST /api/gps/cardio/save` |
| `checkin.request` | Watch → iPhone | `POST /api/gps/checkin` |

⚠️ **O check-in vai para `/api/gps/checkin`, NÃO para `/api/gps/qr-checkin`.**
Até 02/09/2026 ia para o `qr-checkin`, que exige `qr_token` (uuid) — o `WatchGym`
não tem token nenhum, então **100% dos check-ins do relógio voltavam 400**, e o
toast de sucesso era incondicional: usuário e app viam confirmação de algo que
nunca aconteceu.

## Estado verificado em 02/09/2026 (trate como pista datada)

- **Capability HealthKit JÁ habilitada** para `com.irontracks.app.watchkitapp`
  (`APP_GROUPS`, `HEALTHKIT`, `IN_APP_PURCHASE`), medido pela API da App Store
  Connect. O README do Watch dizia "pendente" — estava desatualizado.
- Build/empacotamento **corretos e sem pendência**: Embed Watch Content, as
  complications aninhadas DENTRO do Watch App (não do app iOS), hierarquia de
  bundle ids, `WKCompanionAppBundleIdentifier`, App Group
  `group.com.irontracks.shared` idêntico nos quatro entitlements.
- `npm run ios:release` com `-scheme App` **já embute o Watch** — não precisa de
  nada a mais.

## Como consultar as capabilities sem pedir ao dono

A chave da App Store Connect está no repo (ver `scripts/ios-submit.mjs`:
`ASC_KEY_ID`/`ASC_ISSUER_ID` no `.env.local`, `.p8` em `~/.appstoreconnect/keys/`).
`GET /v1/bundleIds` → para cada id, `GET /v1/bundleIds/{id}/bundleIdCapabilities`.

⚠️ **Não passe `?limit=` nesse sub-endpoint** — ele recusa, e um script que trate
erro como lista vazia reporta "nenhuma capability" para TODOS os bundles,
inclusive o app principal, que comprovadamente tem HealthKit. Foi o que aconteceu
na primeira tentativa; o sinal de que a leitura estava errada foi justamente o
app principal aparecer sem nada.

## Armadilhas de verificação (simulador watchOS)

- **O MCP do simulador exige permissão por device, e o Watch é um device novo.**
  Pedir acesso ao Apple Watch simulado abre um prompt para o dono; sem ele, nem
  `tap` nem `screenshot` pelo MCP funcionam.
- **Contorno que funcionou:** `xcrun simctl` para boot/install/launch/screenshot
  (esses não pedem permissão) + `cliclick` (em `/opt/homebrew/bin`) para toque e
  arrasto, com a posição da janela obtida por AppleScript
  (`System Events` → `position/size of window 1` do processo `Simulator`).
  Deslizar entre as abas: `cliclick m:x,y dd:x,y m:… du:…`.
- **`xcrun simctl privacy … grant` FALHA no watchOS** (`NSPOSIXErrorDomain code=1`).
  O alerta de notificação precisa ser dispensado por clique.
- **`simctl openurl` com o deep link do app devolve erro 115** — a navegação
  entre abas tem de ser por gesto.
- **O simulador não tem sensores.** FC fica 0 e o GPS é simulado: a tela de cardio
  EM CORRIDA não é verificável ali. Diga isso explicitamente em vez de dar como
  testado.

## Swift não passa pelo CI deste repo

Não há runner macOS no `quality-check` — Swift só compila na máquina de quem
builda. Por isso os guards do Watch (`src/components/__tests__/watchIntegridade.test.ts`)
**leem o fonte Swift como texto** e travam a FORMA da correção. É o que existe;
antes de "melhorar" isso, saiba que a alternativa é um runner macOS pago.

Comando de build isolado:
```bash
cd ios/App && xcodebuild build -project App.xcodeproj \
  -scheme "IronTracksWatch Watch App" -destination 'generic/platform=watchOS' \
  CODE_SIGNING_ALLOWED=NO
```

## As classes de defeito que já morderam aqui (02/09/2026)

Doze críticos numa auditoria só. As CLASSES, que é o que se repete:

1. **Singleton compartilhado por duas telas sem dono.** `HealthKitManager` servia
   Cardio e Treino; a aba Cardio se desenhava como corrida por causa de uma
   sessão de musculação, e "Encerrar" no Treino matava a corrida em andamento
   descartando o resumo. Hoje há `activeKind` — cada tela só se ativa se a sessão
   for dela.
2. **Derivar estado booleano de um enum com mais de dois estados.**
   `isRunning = (toState == .running)` fazia PAUSADO virar "não tem sessão": a
   tela voltava ao início sem botão de retomar, e "INICIAR" criava uma segunda
   sessão sobre a primeira, que ficava órfã. Publique o ESTADO, não um flag.
3. **`.onAppear` fora do gate.** Bastava deslizar até a aba Treino para uma
   `HKWorkoutSession` começar — inclusive para quem estava vendo o paywall.
4. **GPS do watchOS morre em background por padrão.**
   `allowsBackgroundLocationUpdates = false` significa que o GPS para quando o
   pulso abaixa, que é 95% de uma corrida: a distância congela e o traçado vira
   uma linha reta entre os momentos em que o usuário olhou o relógio. A
   `HKWorkoutSession` sobrevive (é o que `workout-processing` garante), o
   `CLLocationManager` não.
5. **Filtro de velocidade fixo mata um esporte.** 45 km/h global descartava as
   descidas de bike — a distância do trecho sumia e o mapa cortava reto. Hoje o
   limiar é por esporte (`LocationManager.configure(for:)`), e a caminhada tem
   piso próprio: `minMovementMeters = 5` descartava quase todo ponto a ~1,1 m/s.
6. **Query anchored do HealthKit sem `store.stop`.** Sobrevivia ao fim do treino
   e se somava à seguinte: média de FC inflada e amostras duplicadas a partir do
   segundo treino.
7. **Dois transportes sem idempotência.** O relógio manda por `sendMessage` e,
   se o reply falhar, por `transferUserInfo` — o mesmo cardio gravava duas vezes.
   Hoje `cardio_tracks.client_id` + índice único parcial, com 23505 tratado como
   sucesso idempotente.
