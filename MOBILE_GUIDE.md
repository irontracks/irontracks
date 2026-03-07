# IronTracks — Guia Mobile (iOS + Android)

O app usa **Capacitor 8** em modo *Server URL*: o WebView nativo carrega
`https://irontracks.com.br` em produção. Para desenvolvimento/staging, apontar
`CAPACITOR_SERVER_URL` para o servidor local elimina a necessidade de recompilar
o app nativo a cada mudança de código.

---

## Pré-requisitos

| Requisito | Versão mínima |
|-----------|--------------|
| Node.js | ≥ 20 |
| npx / npm | bundled com Node |
| Xcode | 16+ (iOS) |
| Android Studio | Hedgehog+ |
| Java | 17 |

---

## 1. Instalação e sincronização

```bash
npm install            # instala deps JS + aplica patch iOS automático (postinstall)
npm run cap:sync       # npx cap sync — copia assets, aplica plugins iOS e Android
```

---

## 2. Desenvolvimento local (apontar para localhost)

Defina a variável de ambiente **antes** de rodar `cap sync`:

```bash
# iOS ou Android apontando para o Mac durante dev
CAPACITOR_SERVER_URL=http://192.168.1.XXX:3000 npx cap sync
npm run dev            # Next.js dev server em :3000
```

> Use o IP LAN do Mac (não `localhost`) — o dispositivo físico não resolve `localhost` do computador.

Para voltar para produção:
```bash
npx cap sync           # sem CAPACITOR_SERVER_URL → usa https://irontracks.com.br
```

---

## 3. iOS

### Abrir no Xcode

```bash
npm run cap:open       # abre ios/App/App.xcworkspace no Xcode
```

### Signing & Capabilities

1. Xcode → `App` (ícone azul) → aba **Signing & Capabilities**
2. **Team**: selecione sua conta de dev Apple
3. **Bundle Identifier**: `com.irontracks.app`

### Rodar no dispositivo / simulador

1. Conecte iPhone via cabo ou selecione um simulador
2. ▶️ Play no Xcode

### Build de distribuição (App Store / TestFlight)

```
Xcode → Product → Archive → Distribute App → App Store Connect
```

---

## 4. Android

### Abrir no Android Studio

```bash
npx cap open android   # abre a pasta android/ no Android Studio
```

### Credenciais de assinatura

O `build.gradle` lê as credenciais via variáveis de ambiente. Para builds locais,
exporte as variáveis no shell ou em `~/.gradle/gradle.properties`:

```bash
export ANDROID_STORE_PASSWORD="sua-senha"
export ANDROID_KEY_ALIAS="irontracks"
export ANDROID_KEY_PASSWORD="sua-senha"
```

> **Segredo**: nunca commite senhas em texto pleno. O fallback `'irontracks123'`
> no `build.gradle` existe apenas para builds locais isolados. Em CI/CD, use secrets.

### CI/CD (GitHub Actions)

Adicione estes secrets no repositório:

| Secret | Descrição |
|--------|-----------|
| `ANDROID_STORE_PASSWORD` | Senha do keystore |
| `ANDROID_KEY_ALIAS` | Alias da chave (default: `irontracks`) |
| `ANDROID_KEY_PASSWORD` | Senha da chave privada |

### Build de release

```bash
# Via Android Studio: Build → Generate Signed Bundle / APK → Android App Bundle
# Via CLI (Gradle):
cd android && ./gradlew bundleRelease
# Saída: android/app/build/outputs/bundle/release/app-release.aab
```

O ProGuard/R8 é ativado no release (`minifyEnabled true`). Se alguma classe nativa
for removida indevidamente, adicione a regra em `android/app/proguard-rules.pro`:

```
-keep class com.irontracks.** { *; }
```

---

## 5. Plugins Nativos Presentes

| Plugin | Plataforma | Funcionalidade |
|--------|-----------|----------------|
| `@capacitor/push-notifications` | iOS + Android | Push FCM/APNs |
| `@capacitor/device` | iOS + Android | Info do dispositivo |
| `@capacitor/filesystem` | iOS + Android | Leitura/escrita de arquivos |
| `@capacitor-community/apple-sign-in` | iOS | Sign in with Apple |
| `@revenuecat/purchases-capacitor` | iOS + Android | IAP via RevenueCat |
| `IronTracksNative` (plugin custom Swift) | iOS | Haptics, Live Activity, HealthKit, Biometrics, Spotlight |

> Funções nativas iOS-only verificam `isIosNative()`. Funções cross-platform
> verificam `isNativePlatform()` (iOS + Android).

---

## 6. Comandos de referência rápida

```bash
npm run cap:sync      # sync assets + plugins
npm run cap:open      # abre iOS no Xcode
npx cap open android  # abre Android no Android Studio
npx cap run ios       # build + deploy direto no simulador/device
npx cap run android   # build + deploy direto no emulador/device
```
