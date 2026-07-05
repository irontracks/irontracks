# Release iOS — produção (App Store)

Nota de referência: **temos tudo o que é preciso para lançar em produção na Apple.**
Este doc registra credenciais, tooling, estado atual e o passo a passo.

## Estado atual (jul/2026)

- **Versão pública live**: 1.12 (build 49).
- **Próximo release**: **1.13** — `MARKETING_VERSION` já bumpado para `1.13` no
  `ios/App/App.xcodeproj/project.pbxproj` (6 build configs).
- **Builds no App Store Connect**: build 56 subiu como 1.12 (TestFlight) com os
  botões do push "vai treinar hoje?". Para o release público 1.13, refazer a
  build (vira build 57 como 1.13).

## O que temos (credenciais e acesso)

- **Chave da App Store Connect API**: `~/.appstoreconnect/keys/AuthKey_W834H36CBM.p8`
  - Key ID: `W834H36CBM`
  - Issuer ID: **não fica no disco** — está em App Store Connect → Users and
    Access → Integrations → App Store Connect API (linha da chave `W834H36CBM`).
    Necessário apenas para automatizar a *submissão* via API. Preencher aqui
    quando pego: `ASC_ISSUER_ID = <preencher>`.
- **Sessão do Xcode** (Apple ID logado em Xcode → Settings → Accounts): é o que o
  `npm run ios:release` usa hoje para **upload** (arquivar + enviar pro TestFlight).
  Já validada — subiu builds 55/56.
- **Assinatura**: cert "Apple Development: Maicon Benitz", team `5XLC55D3YR`
  (signing automático com `-allowProvisioningUpdates`).
- **Sign in with Apple** (não confundir): `~/apple-client-secret/AuthKey_SR6ATQK85P.p8`.

## Tooling

- `npm run ios:release [build]` → bumpa `CURRENT_PROJECT_VERSION`, arquiva e faz
  upload pro App Store Connect (`scripts/ios-release.sh`). Sem UI do Xcode.
- **Versão pública** (`MARKETING_VERSION`) é bumpada à mão no `project.pbxproj`
  (todos os configs) antes de um release público novo.
- **Pré-requisito em git worktree**: o worktree precisa de `node_modules` próprio
  (`npm ci`). NÃO usar symlink pro `node_modules` do repo principal — gera
  conflito de versões no grafo SPM do iOS (capacitor-swift-pm 8.4.1 vs 8.0.2).

## Passo a passo para lançar 1.13 em produção

1. `MARKETING_VERSION = 1.13` (feito).
2. `npm run ios:release` → gera build 57 (1.13) e sobe pro App Store Connect.
3. Criar a versão 1.13 na App Store e submeter pro review:
   - **Painel web**: App Store Connect → app → (+) Version 1.13 → anexar build 57
     → colar as release notes → *Submit for Review*.
   - **Ou via ASC API** (Key `W834H36CBM` + Issuer ID): criar version, anexar
     build, setar `whatsNew`, submeter. (Automatizável com fastlane `deliver`.)

## Release notes — 1.13 (rascunho)

> **Novidades da versão 1.13**
> • Modo dia de descanso: de manhã o app pergunta se você vai treinar. Se for
>   descansar, sua meta de calorias do dia é ajustada automaticamente — mantendo
>   a proteína.
> • Responda pela notificação: os botões "Vou treinar" e "Vou descansar" agora
>   aparecem direto no aviso da manhã.
> • Melhorias de estabilidade e correções.
