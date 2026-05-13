# Setup Android — Pós-Auditoria Mobile

Documento de bootstrap pra ativar **FCM (push)**, **Sentry nativo** e **Foreground Service** do rest timer no app Android do IronTracks. O Gradle e o código já estão prontos — esses passos manuais ativam os serviços externos.

---

## 1. Firebase / FCM (resolve F-001)

Sem isso, push notifications no Android **não funcionam**. iOS já está OK (APNs via Apple).

### 1.1 Criar projeto Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. **Adicionar projeto** → nome: `IronTracks` (ou reusar projeto existente)
3. Desabilite Google Analytics (não precisamos — usamos Vercel + Sentry)
4. Em **Visão geral do projeto** → clique no ícone Android pra adicionar app

### 1.2 Registrar o app Android

- **Nome do pacote Android**: `com.irontracks.app` (exato — bate com `applicationId` em `android/app/build.gradle`)
- **Apelido do app** (opcional): `IronTracks Android`
- **Certificado de assinatura SHA-1**: opcional pra FCM básico. Se for usar Dynamic Links ou Google Sign-In depois, gere com:
  ```bash
  cd "/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/android/app"
  keytool -list -v -alias <alias-do-keystore> -keystore irontracks.jks
  ```

### 1.3 Baixar `google-services.json`

1. No Console, **Configurações do projeto** → aba **Geral** → role até **Seus apps** → escolha o app Android
2. Clique em **google-services.json** pra baixar
3. Mova pra: `android/app/google-services.json` (já está no `.gitignore`)

### 1.4 Ativar Cloud Messaging

- **Build** → **Cloud Messaging** → na aba **Cloud Messaging API (V1)** clique em **Gerenciar** → ative
- **Configurações do projeto** → aba **Contas de serviço** → **Gerar nova chave privada** (JSON). Esse JSON vai no **backend** (Supabase Edge Functions) — já configurado no projeto via env `FIREBASE_ADMIN_SDK_JSON`

### 1.5 Validar

```bash
cd "/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks"
npm run cap:sync
npm run cap:open:android
```

No Android Studio, build no device → checar logcat por `FirebaseMessaging` (sem erro `Default FirebaseApp is not initialized`).

---

## 2. Sentry Android Nativo (resolve F-010)

Hoje só o `@sentry/nextjs` captura erros do WebView (JS). Crashes em Kotlin/Java passam batido. Setup ativa o SDK nativo.

### 2.1 Criar projeto no Sentry

1. [sentry.io](https://sentry.io) → **Projects** → **Create Project**
2. Platform: **Android**
3. Nome sugerido: `irontracks-android`
4. Alert frequency: default. Team: o seu

### 2.2 Pegar o DSN

- **Settings** do projeto → **Client Keys (DSN)** → copie a URL completa (ex: `https://abc123@o12345.ingest.sentry.io/67890`)

### 2.3 Configurar `SENTRY_DSN` no build

Duas opções — **escolha uma**:

**Opção A (recomendada pra desenvolvimento)** — `~/.gradle/gradle.properties` (fora do repo):

```properties
SENTRY_DSN=https://abc123@o12345.ingest.sentry.io/67890
```

**Opção B (CI/build pipeline)** — passar via CLI no comando do Gradle:

```bash
./gradlew assembleRelease -PSENTRY_DSN="https://abc123@..."
```

Quando `SENTRY_DSN` está vazio (build local sem propriedade), o SDK roda em **no-op** — sem eventos, sem erros, sem custo. Seguro pra dev.

### 2.4 Configurar `sentry.properties` (upload de mappings)

Necessário só pra subir **ProGuard mappings** e **símbolos NDK** na build de release — sem isso, stack traces vêm ofuscadas no Sentry.

1. Em [sentry.io/settings/account/api/auth-tokens](https://sentry.io/settings/account/api/auth-tokens) gere um **Auth Token** com scopes:
   - `project:read`
   - `project:releases`
   - `org:read`
2. Crie `android/app/sentry.properties` (gitignored) copiando do `.example`:
   ```properties
   defaults.org=seu-org-slug
   defaults.project=irontracks-android
   auth.token=COLE_O_TOKEN_AQUI
   ```
3. O plugin Gradle só ativa se esse arquivo existir (condicional no `build.gradle`).

### 2.5 Validar

Em release build com `SENTRY_DSN` preenchido:

```kotlin
// Adicione temporariamente em MainActivity.onCreate
io.sentry.Sentry.captureMessage("Sentry Android OK — teste $(date +%s)")
```

Em ~30s deve aparecer em `sentry.io` → projeto `irontracks-android` → **Issues**.

---

## 3. Foreground Service Rest Timer (resolve F-002)

**Nenhum setup manual.** O serviço já está declarado no `AndroidManifest.xml` e disparado pelo `IronTracksNativePlugin.scheduleRestTimer` em Android 8+. Em API < 26 cai no AlarmManager (fallback).

### Validação no device

1. Inicie um treino → clique em "Iniciar descanso" com 60s
2. Trave a tela do device (idealmente Samsung/Xiaomi)
3. Espere 1min → a notificação **HIGH importance** "Tempo esgotado" deve disparar com som + vibração **no segundo certo**
4. Logcat: filtrar por `RestTimerService` mostra início e fim do timer

---

## 4. Checklist pré-release

- [ ] `android/app/google-services.json` no lugar (não commitado)
- [ ] `android/app/sentry.properties` no lugar (não commitado), com auth token válido
- [ ] `SENTRY_DSN` no `~/.gradle/gradle.properties` OU no comando de build
- [ ] `npm run cap:sync` rodou sem erros
- [ ] Build de release no Android Studio sem warnings novos
- [ ] Teste de push notification em device físico (não emulador)
- [ ] Teste de rest timer com tela travada por 60s

---

## Notas de segurança

- `google-services.json` contém a API key do Firebase Android — **restrita por package name + SHA-1**, então não é secret crítico, mas mantemos fora do git
- `sentry.properties` contém o **auth token do Sentry** — esse é secret de verdade. Nunca commitar
- O DSN do Sentry no `AndroidManifest` (via placeholder) é **público por design** — vai pro APK final. Tudo bem, é assim que o SDK do Sentry funciona em todas as plataformas
