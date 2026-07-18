#!/bin/bash
# IronTracks Android release: validate, build, sign and optionally publish to Alpha.
#
# Usage:
#   bash scripts/android-release.sh
#   bash scripts/android-release.sh 25
#   bash scripts/android-release.sh 25 --submit

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GRADLE_FILE="$PROJECT_ROOT/android/app/build.gradle"
ARTIFACT_DIR="$PROJECT_ROOT/android/app/build/outputs/bundle/release"
AAB_PATH="$ARTIFACT_DIR/app-release.aab"

SUBMIT=false
FORCED_VERSION=""
for arg in "$@"; do
    case "$arg" in
        --submit) SUBMIT=true ;;
        ''|*[!0-9]*)
            echo "❌ Argumento inválido: $arg"
            exit 1
            ;;
        *) FORCED_VERSION="$arg" ;;
    esac
done

# Next 16 and this repository are validated on Node 20/22, never Node 23+.
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(`.`)[0])' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ] || [ "$NODE_MAJOR" -ge 23 ]; then
    if [ -x /opt/homebrew/opt/node@22/bin/node ]; then
        export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
    else
        echo "❌ Node 20 ou 22 é obrigatório. Versão atual: $(node --version 2>/dev/null || echo ausente)"
        exit 1
    fi
fi

if ! java -version 2>&1 | grep -q '"17'; then
    if JDK17="$(/usr/libexec/java_home -v 17 2>/dev/null)"; then
        export JAVA_HOME="$JDK17"
    else
        echo "❌ JDK 17 não encontrado."
        exit 1
    fi
fi

# Android mappings share the existing Sentry project until a dedicated Android
# project is provisioned. Environment values can override these defaults in CI.
export SENTRY_ORG="${SENTRY_ORG:-irontracks-company}"
export SENTRY_PROJECT="${SENTRY_PROJECT:-javascript-nextjs}"

for required in \
    "$PROJECT_ROOT/android/app/google-services.json" \
    "$PROJECT_ROOT/android/key.properties" \
    "$PROJECT_ROOT/android/app/irontracks.jks"; do
    if [ ! -f "$required" ]; then
        echo "❌ Arquivo obrigatório ausente: $required"
        exit 1
    fi
done

TRACK="${ANDROID_TRACK:-alpha}"
case "$TRACK" in
    internal|alpha|beta|production) ;;
    *) echo "❌ Track inválido: $TRACK"; exit 1 ;;
esac
if [ "$SUBMIT" = true ] && [ "$TRACK" = production ] && [ "${ANDROID_CONFIRM_PRODUCTION:-}" != "YES" ]; then
    echo "❌ Produção exige ANDROID_CONFIRM_PRODUCTION=YES."
    exit 1
fi

cd "$PROJECT_ROOT"
echo "==> Preflight: TypeScript, ESLint, unit e smoke tests"
npx tsc --noEmit
npm run lint -- --max-warnings 0
npm run test:unit
npm run test:smoke

CURRENT_CODE="$(grep -E 'versionCode\s+[0-9]+' "$GRADLE_FILE" | grep -oE '[0-9]+' | head -1)"
if [ -n "$FORCED_VERSION" ]; then
    NEW_CODE="$FORCED_VERSION"
else
    NEW_CODE=$((CURRENT_CODE + 1))
fi
if [ "$NEW_CODE" -lt "$CURRENT_CODE" ]; then
    echo "❌ versionCode não pode diminuir: $CURRENT_CODE → $NEW_CODE"
    exit 1
fi

BACKUP_FILE="$(mktemp /tmp/irontracks-build-gradle.XXXXXX)"
cp "$GRADLE_FILE" "$BACKUP_FILE"
BUILD_SUCCEEDED=false
restore_version_on_error() {
    if [ "$BUILD_SUCCEEDED" != true ]; then
        cp "$BACKUP_FILE" "$GRADLE_FILE"
        echo "⚠️  Build falhou; versionCode restaurado para $CURRENT_CODE."
    fi
    rm -f "$BACKUP_FILE"
}
trap restore_version_on_error EXIT

if [ "$NEW_CODE" != "$CURRENT_CODE" ]; then
    echo "==> versionCode: $CURRENT_CODE → $NEW_CODE"
    sed -i '' "s/versionCode $CURRENT_CODE/versionCode $NEW_CODE/g" "$GRADLE_FILE"
else
    echo "==> versionCode mantido em $CURRENT_CODE"
fi

echo "==> Build web e sincronização do Capacitor Android"
npm run build
npm run cap:sync:android

echo "==> Testes Android, lint release e AAB assinado"
cd "$PROJECT_ROOT/android"
./gradlew :app:testReleaseUnitTest :app:lintRelease :app:bundleRelease --no-daemon

if [ ! -f "$AAB_PATH" ]; then
    echo "❌ AAB não encontrado em $AAB_PATH"
    exit 1
fi
# Upload keys are self-signed by design, so `-strict` would reject a valid AAB.
jarsigner -verify "$AAB_PATH" >/dev/null

BUILD_SUCCEEDED=true
rm -f "$BACKUP_FILE"
trap - EXIT

SIZE="$(du -h "$AAB_PATH" | cut -f1)"
SHA256="$(shasum -a 256 "$AAB_PATH" | awk '{print $1}')"
echo "✅ AAB assinado: $AAB_PATH ($SIZE)"
echo "   SHA-256: $SHA256"

if [ "$SUBMIT" = true ]; then
    echo "==> Enviando versionCode $NEW_CODE para $TRACK"
    cd "$PROJECT_ROOT"
    node scripts/android-submit.mjs \
        --aab "$AAB_PATH" \
        --track "$TRACK" \
        --name "IronTracks 1.14.1 ($NEW_CODE)" \
        --notes "Correções do acesso ao teste Android, estabilidade na primeira abertura, GPS, timers e compatibilidade."
fi
