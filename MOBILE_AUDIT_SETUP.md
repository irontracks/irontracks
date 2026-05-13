# Mobile Audit — Setup manual no Xcode

Este doc cobre os passos manuais que o usuário precisa executar no Xcode UI / Apple Developer Portal pra finalizar a entrega dos findings **F-005** (App Group) e **F-010** (Sentry nativo).

## F-010 — Sentry nativo iOS

### 1. Resolver Swift Package no Xcode

1. `npm run cap:open` (ou abrir `ios/App/App.xcworkspace`).
2. Xcode vai detectar a nova `XCRemoteSwiftPackageReference` para `sentry-cocoa` e baixar automaticamente. Se não detectar: `File → Packages → Resolve Package Versions`.
3. Confirmar em `App target → General → Frameworks, Libraries, and Embedded Content` que **Sentry** aparece (não precisa marcar Embed — é estático).
4. Build limpo: `Product → Clean Build Folder` (Shift+Cmd+K) e Run.

### 2. Associar Sentry.xcconfig aos build configs

O xcconfig com `SENTRY_DSN` e `SENTRY_ENVIRONMENT` foi criado em `ios/App/App/Sentry.xcconfig` mas **NÃO** está referenciado no `project.pbxproj` (intencional, pra preservar build settings atuais).

Para associar:

1. No Xcode, navegue: `Project (raiz) → Project (não target) → Info → Configurations`.
2. Para cada build config do projeto (`Debug`, `Release`, `Debug-Local`, `Release-Local` etc.), expanda e clique no dropdown da linha do target **App**.
3. Selecione `App/Sentry.xcconfig` como base config.
4. **Importante**: se já existe outro xcconfig (Pods, etc.) o Xcode pode pedir merge. O recomendado é criar um xcconfig que faça `#include` do Pods xcconfig e adicione as duas chaves SENTRY_*.

Alternativa simples sem mexer em configs (recomendado pra começar):

1. Não associar o xcconfig.
2. No `App target → Build Settings`, adicionar duas User-Defined Settings:
   - `SENTRY_DSN` = `<seu DSN do Sentry>`
   - `SENTRY_ENVIRONMENT` = `production` (ou `staging` para builds beta)
3. O Info.plist já lê via `$(SENTRY_DSN)` e `$(SENTRY_ENVIRONMENT)`.

### 3. Preencher Sentry.xcconfig localmente

`Sentry.xcconfig` está no `.gitignore` para evitar leak do DSN. Copiar do template:

```bash
cp ios/App/App/Sentry.xcconfig.example ios/App/App/Sentry.xcconfig
# Edite e cole o DSN real de https://sentry.io → Settings → Projects → irontracks-ios → Client Keys
```

### 4. CI/CD (futuro)

Para builds via `npm run ios:release` em CI, injetar `SENTRY_DSN` como variável e gerar o xcconfig dinamicamente antes do `xcodebuild archive`. Não está implementado ainda.

### 5. Validação

Após primeiro deploy com DSN configurado:
- Forçar um crash de teste no app (chamar `SentrySDK.crash()` num botão escondido).
- Verificar evento aparecendo em https://sentry.io em ~1 min.
- Aproveitar e configurar **upload de dSYMs** automático: `Build Phases → New Run Script Phase` com `sentry-cli upload-dsym`. Pra hoje, dSYMs podem ser feitos upload manual pelo Xcode Organizer após cada archive.

---

## F-005 — App Group `group.com.irontracks.shared`

### 1. Criar o App Group no Apple Developer Portal

1. https://developer.apple.com/account → **Identifiers** → **App Groups** (no dropdown topo direito).
2. **+** → **App Groups** → Continue.
3. Description: `IronTracks Shared`
4. Identifier: `group.com.irontracks.shared` (exatamente assim — o Swift e os .entitlements dependem disso).
5. Register.

### 2. Habilitar App Group nos 4 App IDs

Identifiers → App IDs. Para cada um dos 4 abaixo, editar → marcar **App Groups** capability → Edit → marcar `group.com.irontracks.shared` → Save:

- `com.irontracks.app` (App principal)
- `com.irontracks.app.IronTracksWidgets` (Widgets extension)
- `com.irontracks.app.NotificationService` (NSE)
- `com.irontracks.app.watchkitapp` (Watch App — confirme o ID exato no Xcode em Signing & Capabilities)

### 3. Regenerar provisioning profiles

- Em Apple Developer Portal → Profiles → revogar os profiles atuais dos 4 targets e gerar novos (ou usar Automatic Signing pra Xcode regerar sozinho).
- No Xcode: cada target → `Signing & Capabilities` → desmarcar e remarcar "Automatically manage signing" pra forçar refresh.

### 4. Adicionar capability no Xcode

Para cada target (App, IronTracksWidgets, NotificationService, IronTracksWatch Watch App):

1. Target → `Signing & Capabilities` → `+ Capability` → `App Groups`.
2. Marcar `group.com.irontracks.shared`.

Xcode vai gravar a chave em cada `.entitlements` — confira que match com o que já está no repositório (as 4 entitlements já têm a chave pré-adicionada).

### 5. Validação

- Build pra device real (App Group não funciona em todos os simuladores para extensões).
- No primeiro launch após update, conferir log: `[IronTracksKVStore] Migrated legacy cache.db → App Group container` (se o usuário tinha dados antigos).
- Conferir no app que streak, offline queue e dados de cache continuam após o update.

---

## Riscos / Observações

- **App Group sem provisioning regenerado**: o `containerURL(...)` retorna `nil` e o plugin cai pro fallback sandbox — não quebra, mas Widgets/NSE/Watch não vão enxergar o cache. Migração é one-shot por instalação (flag `didMigrate` na classe).
- **DSN vazio**: `SentrySDK.start` é guard-paqued — não tenta iniciar sem DSN, então builds locais sem `Sentry.xcconfig` continuam funcionando.
- **Targets sem Sentry**: Widgets, NSE e Watch ainda **não** têm `sentry-cocoa` linkado — crashes nessas extensões continuam invisíveis. Adicionar nos próximos sprints (binário extra ~3-5 MB cada).
- **Sample rate 10%**: `tracesSampleRate = 0.1` e `profilesSampleRate = 0.1` — ajustar conforme volume e plano Sentry.
