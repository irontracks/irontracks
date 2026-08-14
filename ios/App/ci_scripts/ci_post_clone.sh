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

# O archive roda com -disableAutomaticPackageResolution e confere o
# Package.resolved por originHash — que VARIA entre toolchains. O resolved
# commitado (gerado na máquina local) reprovou no runner mesmo em dia
# (run #1729, lido via ASC API). Regenerar AQUI, com o toolchain do
# runner, faz o hash bater por construção. Package.swift pina versões
# exatas, então o resultado é determinístico.
xcodebuild -project ios/App/App.xcodeproj -scheme App -resolvePackageDependencies
