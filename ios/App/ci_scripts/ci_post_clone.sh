#!/bin/sh
# Xcode Cloud — pós-clone (Apple procura ci_scripts/ ao lado do .xcodeproj).
#
# POR QUE EXISTE: o grafo SPM do app resolve os 7 plugins Capacitor por
# caminho DENTRO de node_modules (ios/App/CapApp-SPM/Package.swift usa
# `path: "../../../node_modules/..."`). O runner do Xcode Cloud clona o repo
# sem node_modules e sem Node — sem este script, TODO build morre em
# "the package at '.../node_modules/@capacitor-community/apple-sign-in'
# cannot be accessed" (reproduzido em worktree limpo em 14/08/2026; o
# workflow 'App | Default' falhava em todos os commits desde que foi criado).
#
# `npm ci` basta: capacitor.config.json e App/public/ estão COMMITADOS,
# então não há `cap sync` a fazer aqui. engines do package.json: node 20–22.
set -e
set -x

if ! command -v node >/dev/null 2>&1; then
  export HOMEBREW_NO_AUTO_UPDATE=1
  export HOMEBREW_NO_INSTALL_CLEANUP=1
  brew install node@22 || brew install node
  # brew de Apple Silicon e de Intel instalam em prefixos diferentes
  export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
fi
node --version
npm --version

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci --no-audit --no-fund

# O postinstall (patch-ios.mjs) SE PULA quando CI está setado — guarda feita
# para a Vercel, mas o Xcode Cloud seta CI=TRUE e é o único CI que PRECISA
# do patch: sem ele, o apple-sign-in de node_modules pede capacitor-swift-pm
# 7.x e a resolução conflita com o purchases-capacitor (8.x) — run #1731.
# Invocação explícita com o ambiente de CI desarmado só para este comando.
env -u CI -u VERCEL -u VERCEL_ENV -u NEXT_PUBLIC_VERCEL_ENV node scripts/patch-ios.mjs

# O runner liga GLOBALMENTE o "only use versions from resolved file" — até o
# próprio `xcodebuild -resolvePackageDependencies` recusa lockfile cujo
# originHash não bate (run #1730: exit 74 DENTRO deste script; runs
# #1728/#1729 idem no archive). E o originHash varia entre toolchains
# (local: Xcode 26.5), então lockfile commitado nunca satisfaz o runner.
# Destravamento documentado: desligar as defaults e deixar o archive
# resolver — determinístico, o Package.swift pina versões exatas.
defaults write com.apple.dt.Xcode IDEPackageOnlyUseVersionsFromResolvedFile -bool NO
defaults write com.apple.dt.Xcode IDEDisableAutomaticPackageResolution -bool NO
xcodebuild -project ios/App/App.xcodeproj -scheme App -resolvePackageDependencies
