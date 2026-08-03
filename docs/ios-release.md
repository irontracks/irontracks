# Release iOS — produção (App Store)

Nota de referência: **temos tudo o que é preciso para lançar em produção na Apple.**
Este doc registra credenciais, tooling, estado atual e o passo a passo.

## Estado atual (03/08/2026)

- **Em review na Apple**: **1.19 (build 74)**, submetida em 03/08/2026 via
  `node scripts/ios-submit.mjs`. **Auto-release ligado** — aprovou, vai pros
  usuários sozinho.
- **`MARKETING_VERSION` no repo**: `1.19` — **10 ocorrências** hoje, não 6.
  Confira com `grep -c`, não confie no número escrito aqui.
- Histórico: 1.12 (build 49) → … → 1.18 → 1.19 (build 74).

## O que temos (credenciais e acesso)

- **Chave da App Store Connect API**: `~/.appstoreconnect/keys/AuthKey_W834H36CBM.p8`
  - Key ID: `W834H36CBM`
  - **Issuer ID: JÁ ESTÁ NO DISCO**, em `.env.local` (`ASC_ISSUER_ID`), junto com
    `ASC_KEY_ID`. `scripts/ios-submit.mjs` lê os dois de lá sozinho — não precisa
    exportar nada nem abrir o painel.
    > Este parágrafo dizia "não fica no disco — preencher quando pego" e ficou
    > obsoleto sem ninguém atualizar. Custou uma sessão inteira parada em
    > 03/08/2026: o agente leu a doc, acreditou, e foi pedir ao dono um dado que
    > estava a um `grep` de distância. **Doc de credencial mente com o tempo —
    > confirme no repo antes de declarar que falta alguma coisa.**
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

- `node scripts/ios-submit.mjs "<notas>"` → **submete pro review**, sem painel web:
  acha a última build processada, cria/reaproveita a versão editável, grava as
  notas em pt-BR, anexa a build e submete (com auto-release após aprovação).
  Também garante link de Termos, Privacy URL e App Review Information.
  - `--dry-run` mostra tudo o que faria **sem submeter** — rode isto primeiro.
    É como se descobre, de graça, se a versão do momento já está publicada
    (trem fechado → precisa bumpar a `MARKETING_VERSION` antes).
  - `--build <n>` fixa a build; `--no-submit` aplica metadata sem submeter.

## Passo a passo para lançar em produção

1. **`git pull` no repo principal.** Em 03/08/2026 ele estava 32 commits atrás:
   a build teria saído sem a correção que motivou o release. Confirme no código
   que a mudança que você quer entregar está lá.
2. Se a versão pública atual **já está publicada**, bumpe `MARKETING_VERSION`
   (10 ocorrências) — senão o upload morre no `exportArchive` com 90062/90186,
   depois de ~5 min de archive perdido. `--dry-run` do submit responde isso antes.
3. `npm run ios:release` → bumpa o build number, arquiva e sobe pro App Store Connect.
4. `node scripts/ios-submit.mjs --dry-run` → confere build VALID e versão livre.
5. `node scripts/ios-submit.mjs "<release notes>"` → submete.

As notas são **conteúdo público**: escreva a partir do que entrou de verdade
(`git log --pretty=%s <bump-anterior>..HEAD --no-merges | grep -E '^(feat|fix)'`),
em linguagem de usuário, e confirme com o dono antes de submeter.
