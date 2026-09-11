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

# ─── 0a. Carrega SENTRY_* do .env.local ────────────────────────────────────
# O `ios-submit.mjs` já lê esse arquivo; este não lia, então o token do Sentry
# ficava invisível para o passo do dSYM e o release anunciava "ausente" com a
# credencial ali do lado. Variável já exportada no shell VENCE o arquivo, mesma
# precedência do ios-submit.mjs.
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    while IFS= read -r linha || [ -n "$linha" ]; do
        case "$linha" in
            SENTRY_*=*)
                chave="${linha%%=*}"
                valor="${linha#*=}"
                valor="${valor%\"}"; valor="${valor#\"}"
                valor="${valor%\'}"; valor="${valor#\'}"
                if [ -z "$(eval "echo \${$chave:-}")" ]; then export "$chave=$valor"; fi
                ;;
        esac
    done < "$PROJECT_ROOT/.env.local"
fi

# ─── 0. O front vem de PRODUÇÃO? ──────────────────────────────────────────
# ⚠️ A build 84 (1.21.3) foi arquivada, subiu ao TestFlight e chegou a
# WAITING_FOR_REVIEW com server.url = http://localhost:3010. No iPhone o
# WKWebView não alcança a máquina de dev: o app abre e fica numa TELA PRETA —
# sem crash, sem erro, só o backgroundColor do próprio config.
#
# O guard de CI (capacitorServerUrlProducao.test.ts) não alcança este caso: o
# arquivo estava modificado e NÃO commitado, então nenhum PR o viu. Quem
# arquiva é este script, e é aqui que a verificação precisa morar.
CAP_CONFIG="$PROJECT_ROOT/ios/App/App/capacitor.config.json"
SERVER_URL=$(grep -A2 '"server"' "$CAP_CONFIG" | grep '"url"' | sed -E 's/.*"url"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')
if [[ ! "$SERVER_URL" =~ ^https:// ]] || echo "$SERVER_URL" | grep -qiE 'localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.[0-9]+\.|172\.(1[6-9]|2[0-9]|3[01])\.'; then
    echo "❌ ABORTADO: o app carregaria o front de '$SERVER_URL'."
    echo "   Isso vira TELA PRETA no aparelho (foi a build 84)."
    echo "   Corrija com:  npx cap sync   (sem CAPACITOR_SERVER_URL no ambiente)"
    exit 1
fi
echo "==> Front de produção: $SERVER_URL"

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

# ─── 3b. dSYM para o Sentry ────────────────────────────────────────────────
# ⚠️ Sem isto TODO issue nativo iOS chega ao Sentry com os frames <redacted> —
# não é falha de um evento, é permanente. Foi o que tornou o App Hang de
# 09/09/2026 (build 82) impossível de diagnosticar: 26 frames, nenhum legível.
#
# O `uploadSymbols` do ExportOptions.plist logo abaixo NÃO serve para isto:
# ele manda símbolos para a APPLE, não para o Sentry.
#
# Condicional ao token, como o next.config.ts já faz com os sourcemaps — mas
# RUIDOSO quando ele falta. Falha silenciosa aqui é justamente o que deixou o
# Sentry nativo decorativo por meses.
SENTRY_CLI="$PROJECT_ROOT/node_modules/.bin/sentry-cli"
if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
    echo "⚠️  SENTRY_AUTH_TOKEN ausente — dSYM NÃO enviado."
    echo "    Os crashes/hangs nativos desta build chegarão ilegíveis (<redacted>)."
elif [ ! -x "$SENTRY_CLI" ]; then
    echo "⚠️  sentry-cli não encontrado em node_modules — dSYM NÃO enviado."
else
    echo "==> Enviando dSYM ao Sentry..."
    # `|| true`: o release não pode morrer porque a telemetria falhou. O aviso
    # acima já denuncia o caso em que o token falta; aqui a falha é de rede.
    # ⚠️ `javascript-nextjs` está CERTO — não "corrija" para um slug com cara de
    # iOS. O app nativo e o site dividem o mesmo projeto (id 4511127085842432, o
    # mesmo do DSN em Sentry.xcconfig), e é lá que estão as releases `ios@…`.
    # Conferido pela API em 10/09/2026, depois de o nome me levar a investigar
    # um "dSYM no projeto errado" que não existia.
    SENTRY_ORG="${SENTRY_ORG:-irontracks-company}" \
    SENTRY_PROJECT="${SENTRY_PROJECT:-javascript-nextjs}" \
    "$SENTRY_CLI" debug-files upload \
        --include-sources \
        "$ARCHIVE_PATH/dSYMs" || echo "⚠️  Upload de dSYM falhou — build segue."
fi

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
