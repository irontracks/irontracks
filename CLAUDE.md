# IronTracks — Instruções para Claude Code

## O que é este projeto
Plataforma fitness social em produção com usuários reais. App web (Next.js/Vercel) + apps nativos iOS e Android (Capacitor). Sistema VIP com pagamentos reais (RevenueCat/Apple IAP). **Mudanças aqui afetam usuários em produção — cuidado redobrado com breaking changes.**

## Stack
- **Web**: Next.js 16 + React 19 + TypeScript 5.9 strict + Tailwind CSS v4
- **Mobile**: Capacitor 8 (iOS + Android) — hybrid app
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **IA**: Google Gemini (`@google/generative-ai`) + Vercel AI SDK
- **Pagamentos/IAP**: RevenueCat (`@revenuecat/purchases-capacitor`) + Apple IAP
- **Monitoramento**: Sentry (client + server + edge) + Vercel Analytics
- **Testes**: Vitest (unit) + Playwright (E2E)
- **Deploy**: Vercel via git push — `npm run deploy` faz typecheck + commit + push automático

## Estrutura de pastas essencial
```
src/
  app/          # Next.js App Router (rotas e páginas)
  actions/      # Server Actions do Next.js
  components/   # Componentes React (19 subpastas por domínio)
  contexts/     # React Contexts (auth, dados globais)
  hooks/        # Custom hooks (59 hooks)
  lib/          # Lógica de negócio (offline, push, social, video)
  schemas/      # Schemas Zod (validação)
  types/        # Tipos TypeScript globais
  utils/        # Utilitários por domínio (ai, auth, calculations, vip, etc.)
supabase/
  migrations/   # 23 migrations PostgreSQL (usar MCP para novas)
e2e/            # Testes Playwright (16 specs)
ios/            # Projeto Xcode (Capacitor)
android/        # Projeto Android Studio (Capacitor)
scripts/        # Scripts de build e utilitários
```

## Regra crítica: `npm run deploy` deve sempre funcionar
O deploy usa `husky` + `lint-staged` com **zero tolerância a warnings ESLint**. Qualquer warning bloqueia o commit e o deploy falha.

## Checklist obrigatório antes de declarar qualquer tarefa concluída

### 1. TypeScript
```bash
npx tsc --noEmit
```
Zero erros. Nenhuma exceção.

### 2. ESLint (comando exato deste projeto)
```bash
node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs <arquivos_editados> --max-warnings 0
```
Output vazio = limpo. Qualquer output = corrigir antes de continuar.

### 3. Testes unitários (se tocar em lógica de negócio)
```bash
npm run test:unit
```

### 4. Smoke tests (se tocar em rotas ou APIs)
```bash
npm run test:smoke
```

## Scripts de scan — usar proativamente para encontrar problemas
```bash
npm run scan:all        # Roda todos os scans abaixo
npm run scan:buttons    # Botões sem acessibilidade
npm run scan:secrets    # Secrets/API keys hardcodadas no código
npm run scan:a11y       # Problemas de acessibilidade
npm run scan:console    # console.log esquecidos no código
npm run scan:async      # Padrões async problemáticos
```
**Rodar `npm run scan:secrets` antes de qualquer commit que toque em .env ou configurações.**

## Comandos de desenvolvimento
```bash
npm run dev             # Dev server (localhost:3000)
npm run build           # Build de produção
npm run test:unit       # Testes unitários (Vitest)
npm run test:coverage   # Cobertura de testes
npm run test:smoke      # 13 smoke tests críticos
npm run e2e             # Testes E2E (Playwright)
npm run e2e:ui          # E2E com interface de debug
npm run analyze         # Análise de bundle (verificar tamanho)
npm run deploy          # typecheck + git commit + push → Vercel CI/CD
```

## Capacitor (mobile)
```bash
npm run cap:sync        # Sincronizar web → iOS + Android (obrigatório após mudanças)
npm run cap:open        # Abrir Xcode
npm run cap:open:android # Abrir Android Studio
```
- **Após qualquer mudança em plugin nativo**: `npm run cap:sync` obrigatório
- **Push notifications**: nunca modificar sem testar em device físico real
- **App ID**: `com.irontracks.app`
- **Web dir para Capacitor**: `out/` (build estático — `next build` gera este diretório)

## iOS — release pra App Store / TestFlight
**REGRA FIXA do usuário: SEMPRE subir build pro App Store Connect via terminal, NUNCA abrir Xcode UI pra Archive/Distribute. Faz o claude perder tempão.**

```bash
npm run ios:release           # bump build atual+1, archive, upload pra TestFlight
npm run ios:release 25        # força build = 25
```

O script `scripts/ios-release.sh`:
1. Bumpa `CURRENT_PROJECT_VERSION` no `project.pbxproj` (todos os 6 build configs)
2. Roda `xcodebuild archive` (signing automático com cert "Apple Development: Maicon Benitz", team `5XLC55D3YR`)
3. Roda `xcodebuild -exportArchive` com `method=app-store-connect` + `destination=upload` — envia direto pra Apple

Em ~10 min depois aparece no TestFlight do iPhone do usuário. Auth reusa a session do Xcode em `Xcode → Settings → Accounts` (uma vez configurado, não pede de novo).

## Supabase — padrões obrigatórios
```bash
# Novas migrations via MCP quando disponível:
mcp__supabase__apply_migration
mcp__supabase__list_migrations
```
- **Row Level Security obrigatório** em toda tabela nova — sem exceção
- Usar `supabase-js` v2 (nunca v1)
- Verificar advisors após migrations: `mcp__supabase__get_advisors`
- Migrations ficam em `supabase/migrations/` com timestamp no nome
- Supabase URL: verificar em `.env.local` (nunca hardcodar)

## RevenueCat / Apple IAP — zona de máximo cuidado
- **Nunca modificar** fluxos de purchase/restore sem entender o impacto completo
- Entitlement ID: `vip`
- Testar sempre em sandbox (TestFlight) antes de produção
- `NEXT_PUBLIC_ENABLE_IAP=true` controla se IAP está ativo
- Erros de IAP devem ser capturados e enviados ao Sentry

## Sentry — monitoramento de erros
- Configurado em `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Nunca silenciar erros com try/catch vazio — sempre capturar com `Sentry.captureException`
- Filtros de ruído configurados em `src/utils/security/`

## Tailwind CSS v4 — atenção
Este projeto usa **Tailwind v4** (não v3). A sintaxe e configuração são diferentes:
- Configuração via `postcss.config.mjs` (não `tailwind.config.js`)
- Importar via `@import 'tailwindcss'` no CSS (não `@tailwind base/components/utilities`)
- Não adicionar classes de v3 que foram removidas ou renomeadas na v4

## Erros TypeScript comuns a evitar
- Variáveis desestruturadas não usadas → remover do destructuring (não prefixar com `_`)
- Imports não utilizados → remover imediatamente
- `any` implícito → tipar explicitamente sempre
- `// @ts-ignore` → nunca usar, resolver o problema real

## Segurança — crítico
- **`.env.local` contém credenciais reais de produção** — nunca commitar, nunca logar, nunca expor
- Rodar `npm run scan:secrets` antes de qualquer commit em arquivos de config
- API keys apenas via variáveis de ambiente (`process.env.*`)
- `NEXT_PUBLIC_*` = exposto no cliente — nunca colocar secrets com este prefixo

## Regras de arquitetura
1. **Server Actions** em `src/actions/` — não criar lógica de servidor em client components
2. **Lógica de negócio** em `src/lib/` ou `src/utils/` — separada da UI
3. **Schemas Zod** em `src/schemas/` — validar inputs de API e formulários
4. **Tipos** em `src/types/` — interfaces de entidades do banco em arquivo dedicado
5. **Hooks** em `src/hooks/` — nunca lógica de negócio inline em componentes grandes
6. `useMemo` e `useCallback` onde evitam re-renders custosos (lista de exercícios, gráficos)

## O que nunca fazer
- `console.log` em código de produção (rodar `npm run scan:console` para encontrar)
- Modificar `middleware.ts` sem entender o impacto em autenticação de todas as rotas
- Fazer breaking changes em schemas do banco sem migration e rollback plan
- Commitar sem rodar TypeScript + ESLint
- Instalar pacotes pesados sem verificar impacto no bundle (`npm run analyze`)
- Modificar fluxos de autenticação sem testar login completo
- Deixar listeners do Supabase Realtime sem unsubscribe no cleanup
- **Refatorar código fora do escopo da tarefa atual** — se identificar algo para melhorar, reportar via `mcp__ccd_session__spawn_task` mas não tocar agora
- Usar comandos destrutivos (`rm -rf`, etc.) sem confirmação explícita
- Executar migrations de banco sem confirmar "sim" com o usuário
- Modificar `.env.local` ou variáveis de ambiente diretamente
- Adicionar dependências sem confirmar por que são necessárias primeiro

## Fluxo de trabalho correto

### Antes de começar qualquer tarefa complexa
1. **Use Plan Mode** (`/plan`) — leia o plano completo antes de pressionar Enter para executar
2. **Declare as fronteiras negativas** no prompt: "faça X, **não toque** em middleware.ts, auth, schema do banco"
3. **Commit de checkpoint** antes de iniciar: `git add -p && git commit -m "checkpoint antes de <tarefa>"` — isola a mudança e facilita o diff depois
4. **Leia o diff** antes de aceitar: `git diff` mostra arquivos inesperados sendo tocados

### Execução
```
editar código
  → npx tsc --noEmit           (zero erros)
  → eslint <arquivos> --max-warnings 0   (zero warnings)
  → npm run test:unit           (se tocou lógica)
  → npm run scan:secrets        (se tocou configs)
  → npm run deploy              (commit + push + Vercel CI/CD)
```

## Auto-merge ao terminar tarefa (quando trabalhando via PR)
Quando o agente está desenvolvendo numa branch e abriu PR, o fluxo padrão ao terminar a tarefa é:

1. Aguardar o `quality-check` do GitHub Actions ficar verde
2. Marcar o PR como ready (sair de draft)
3. Mergear com **squash** (mantém main com 1 commit por feature, casa com o histórico atual)
4. Vercel deploya prod automático no push pra main

Não é preciso pedir confirmação a cada PR — esta regra é a confirmação durável. Exceções em que o agente DEVE pedir antes de mergear:
- Mudança em `middleware.ts`, fluxos de auth, schemas do banco com migration, ou pagamentos (RevenueCat/IAP)
- CI vermelho ou flaky — investigar primeiro, não tentar contornar com `--no-verify` ou retry cego
- PR com revisões humanas pendentes não resolvidas
