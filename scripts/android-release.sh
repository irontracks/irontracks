#!/bin/bash
# IronTracks — Android release: bump versionCode + bundleRelease → AAB pronto pra upload.
# Espelha o fluxo do scripts/ios-release.sh.
#
# Uso:
#   bash scripts/android-release.sh           # bump auto (versionCode atual + 1)
#   bash scripts/android-release.sh 25        # força versionCode = 25
#   bash scripts/android-release.sh --submit  # bump + build + sobe pro Play Console Internal
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

# ─── 2. Sync web build ──────────────────────────────────────────────────────
echo "==> Syncing Capacitor (web → android)..."
cd "$PROJECT_ROOT"
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
    echo "==> Subindo pro Play Console (Internal Testing)..."
    cd "$PROJECT_ROOT"
    node scripts/android-submit.mjs --aab "$AAB_PATH" --track internal
else
    echo ""
    echo "📦 Próximos passos:"
    echo "   • Pra subir pro Play Console manual: abra Play Console → Internal Testing → upload AAB"
    echo "   • Pra automatizar: rode 'bash scripts/android-release.sh --submit'"
    echo "     (precisa de service account JSON em ~/.googlecloud/service-accounts/)"
fi
