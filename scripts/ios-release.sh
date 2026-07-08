#!/bin/bash
# IronTracks — iOS release direto pro App Store Connect via xcodebuild.
# Nada de abrir Xcode UI. Faz: bump build → archive → upload TestFlight.
#
# Uso:
#   bash scripts/ios-release.sh           # bump auto (build atual + 1)
#   bash scripts/ios-release.sh 25        # força build = 25
#
# Pré-requisitos:
#   • Xcode logado em Apple ID (Xcode → Settings → Accounts) — uma vez só
#   • Cert "Apple Development: Maicon Benitz" no Keychain
#   • Provisioning profile com push entitlement (auto via -allowProvisioningUpdates)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PBXPROJ="$PROJECT_ROOT/ios/App/App.xcodeproj/project.pbxproj"
ARCHIVE_DIR="/tmp/irontracks-archives"
EXPORT_OPTIONS="$ARCHIVE_DIR/ExportOptions.plist"

# ─── 1. Bump build number ──────────────────────────────────────────────────
CURRENT_BUILD=$(grep -m1 "CURRENT_PROJECT_VERSION" "$PBXPROJ" | grep -oE '[0-9]+' | head -1)
if [ -n "${1:-}" ]; then
    if ! [[ "$1" =~ ^[0-9]+$ ]]; then
        echo "❌ Build number deve ser um inteiro. Recebido: '$1'"
        exit 1
    fi
    NEW_BUILD="$1"
else
    NEW_BUILD=$((CURRENT_BUILD + 1))
fi
echo "==> Bumping CURRENT_PROJECT_VERSION: $CURRENT_BUILD → $NEW_BUILD"
sed -i '' "s/CURRENT_PROJECT_VERSION = $CURRENT_BUILD;/CURRENT_PROJECT_VERSION = $NEW_BUILD;/g" "$PBXPROJ"

# ─── 2. ExportOptions.plist (regen sempre) ─────────────────────────────────
mkdir -p "$ARCHIVE_DIR"
cat > "$EXPORT_OPTIONS" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>destination</key>
	<string>upload</string>
	<key>teamID</key>
	<string>5XLC55D3YR</string>
	<key>uploadSymbols</key>
	<true/>
	<key>uploadBitcode</key>
	<false/>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>stripSwiftSymbols</key>
	<true/>
</dict>
</plist>
EOF

ARCHIVE_PATH="$ARCHIVE_DIR/IronTracks-build-$NEW_BUILD.xcarchive"

# ─── 2b. Alinhar pins do SPM (capacitor-swift-pm) ao Capacitor instalado ────
# Sem isto, plugins como @revenuecat/purchases-capacitor fixam (exact:) uma
# versão ANTIGA de capacitor-swift-pm (ex.: 8.0.2) enquanto o Capacitor é 8.4.1,
# e o archive falha em "Could not resolve package dependencies". O patch-ios.mjs
# alinha todos os Package.swift à versão instalada e é idempotente. Roda a
# partir da raiz (lê node_modules por caminho relativo ao cwd).
echo "==> Alinhando pins do SPM (patch-ios)..."
( cd "$PROJECT_ROOT" && node scripts/patch-ios.mjs )

# ─── 3. Archive ────────────────────────────────────────────────────────────
echo "==> Archiving build $NEW_BUILD..."
cd "$PROJECT_ROOT/ios/App"
xcodebuild archive \
    -project App.xcodeproj \
    -scheme App \
    -configuration Release \
    -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE_PATH" \
    -allowProvisioningUpdates \
    | tail -5

# ─── 4. Export + upload to App Store Connect ───────────────────────────────
echo "==> Uploading to App Store Connect..."
xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$ARCHIVE_DIR/export-$NEW_BUILD" \
    -exportOptionsPlist "$EXPORT_OPTIONS" \
    -allowProvisioningUpdates \
    | tail -5

echo ""
echo "✅ Build $NEW_BUILD enviado pro App Store Connect."
echo "   Vai aparecer no TestFlight em 5–15 min (você recebe email da Apple)."
