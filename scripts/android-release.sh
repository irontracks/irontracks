#!/bin/bash
# IronTracks — Android release: bump versionCode + bundleRelease → AAB pronto pra upload.
# Espelha o fluxo do scripts/ios-release.sh.
#
# Uso:
#   bash scripts/android-release.sh           # bump auto (versionCode atual + 1)
#   bash scripts/android-release.sh 25        # força versionCode = 25
#   bash scripts/android-release.sh --submit  # bump + build + sobe pro teste fechado Alpha
#
# Pré-requisitos:
#   • Java 17+ (Temurin recomendado)
#   • Android SDK em ~/Library/Android/sdk (ou setado via local.properties)
#   • Keystore irontracks.jks + android/key.properties preenchido (já existe)
#   • Pra --submit: ~/.googlecloud/service-accounts/irontracks-play.json
#     + variável GOOGLE_PLAY_SERVICE_ACCOUNT no .env.local

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GRADLE_FILE="$PROJECT_ROOT/android/app/build.gradle"
ARTIFACT_DIR="$PROJECT_ROOT/android/app/build/outputs/bundle/release"

# ─── 0. JAVA_HOME (JDK 17) ───────────────────────────────────────────────────
# O Android Gradle Plugin não roda no JDK padrão do sistema quando é muito novo
# (ex.: Java 25). Fixa o JDK 17 se o atual não for 17.x.
if ! java -version 2>&1 | grep -q '"17'; then
    if JDK17="$(/usr/libexec/java_home -v 17 2>/dev/null)"; then
        export JAVA_HOME="$JDK17"
        echo "==> JAVA_HOME → $JAVA_HOME (JDK 17)"
    else
        echo "❌ JDK 17 não encontrado (o AGP não roda no Java atual). Instale o Temurin 17."
        exit 1
    fi
fi

# ─── 0b. Guard: google-services.json (senão o AAB sai sem FCM/push) ──────────
if [ ! -f "$PROJECT_ROOT/android/app/google-services.json" ]; then
    echo "❌ android/app/google-services.json ausente — o AAB sairia SEM push (FCM)."
    echo "   Copie o arquivo do Firebase antes de gerar o release."
    exit 1
fi

# ─── Parse args ─────────────────────────────────────────────────────────────
SUBMIT=false
FORCED_VERSION=""
for arg in "$@"; do
    case "$arg" in
        --submit) SUBMIT=true ;;
        ''|*[!0-9]*) ;;
        *) FORCED_VERSION="$arg" ;;
    esac
done

# ─── 1. Bump versionCode ────────────────────────────────────────────────────
CURRENT_CODE=$(grep -E "versionCode\s+[0-9]+" "$GRADLE_FILE" | grep -oE '[0-9]+' | head -1)
if [ -n "$FORCED_VERSION" ]; then
    NEW_CODE="$FORCED_VERSION"
else
    NEW_CODE=$((CURRENT_CODE + 1))
fi
echo "==> Bumping versionCode: $CURRENT_CODE → $NEW_CODE"
sed -i '' "s/versionCode $CURRENT_CODE/versionCode $NEW_CODE/g" "$GRADLE_FILE"

# ─── 2. Build web + sync ────────────────────────────────────────────────────
# npm run build gera out/ (webDir do Capacitor). Sem isto, o cap sync aborta em
# checkout limpo com "Could not find the web assets directory: ./out".
echo "==> Building web (next build → out/)..."
cd "$PROJECT_ROOT"
npm run build
echo "==> Syncing Capacitor (web → android)..."
npm run cap:sync:android

# ─── 3. Gradle bundleRelease ────────────────────────────────────────────────
echo "==> Generating signed AAB (release)..."
cd "$PROJECT_ROOT/android"
./gradlew :app:bundleRelease --no-daemon

AAB_PATH="$ARTIFACT_DIR/app-release.aab"
if [ ! -f "$AAB_PATH" ]; then
    echo "❌ AAB não encontrado em $AAB_PATH"
    exit 1
fi
SIZE=$(du -h "$AAB_PATH" | cut -f1)
echo "✅ AAB gerado: $AAB_PATH ($SIZE)"

# ─── 4. Submit (opcional) ───────────────────────────────────────────────────
if [ "$SUBMIT" = true ]; then
    # Faixa FECHADA (Alpha) — é onde os testadores entram via Grupo do Google pelo
    # opt-in da /comercial. A faixa 'internal' usa lista de e-mails à parte e NÃO
    # entrega a esses testadores. Sobrescreva com ANDROID_TRACK se precisar.
    TRACK="${ANDROID_TRACK:-alpha}"
    echo "==> Subindo pro Play Console (track: $TRACK)..."
    cd "$PROJECT_ROOT"
    node scripts/android-submit.mjs --aab "$AAB_PATH" --track "$TRACK"
else
    echo ""
    echo "📦 Próximos passos:"
    echo "   • Pra subir manualmente: Play Console → Teste fechado → Alpha → criar versão"
    echo "   • Pra automatizar: rode 'bash scripts/android-release.sh --submit'"
    echo "     (precisa de service account JSON em ~/.googlecloud/service-accounts/)"
fi
