## Estado atual vs documento (o que já está corrigido)
### Dívida estrutural (duplicados, backups)
- **Duplicados em `src/`**: não encontrei arquivos com sufixo ` 2`/` 3` em `src/` (busca por glob retornou vazio). Ainda existem cópias em **_archive/duplicates** e **claude/** (ex.: rotas `route 2.ts`), que continuam no repositório como “lixo histórico”.
- **Service Worker duplicado**: hoje só existe [sw.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/public/sw.js) em `public/`.
- **Pastas `_legacy_backup` / `_macro_mixer_orig`**: não existem mais na raiz (glob não encontrou).

### IA (rate limit + rotas)
- **Rate limiting + quotas VIP**: agora existe rate limit por `userId+ip` e enforcement de quota VIP nas rotas de IA novas e já havia em `post-workout-insights`.
- Rotas de IA ausentes foram criadas:
  - [coach-chat](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/ai/coach-chat/route.ts)
  - [vip-coach](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/ai/vip-coach/route.ts)
  - [workout-wizard](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/ai/workout-wizard/route.ts)

### Feature flags
- **Lifecycle**: `FEATURE_META` tem `owner` e `review_at` em [featureFlags.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/featureFlags.js).
- **Limpeza**: a flag `weeklyReportCTA` (citada no doc) foi removida do código.

### Aprovação de aluno (audit trail)
- A migração para status/audit existe em [20260213193000_profiles_approval_status.sql](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations/20260213193000_profiles_approval_status.sql) e o app já considera `approval_status` no layout.

### Schema/migrations
- O repositório **já tem muitas migrations reais** em `supabase/migrations/` (inclui `vip_usage_daily`, billing, check-ins, stories etc.), então o problema do `schema_full_restore.sql` “incompleto” virou mais um artefato de documentação do que fonte de verdade.

## O que ainda NÃO está 100% conforme o documento
1) **OAuth origin**: a rota [auth/login](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/login/route.ts) ainda infere `safeOrigin` por headers (como o documento critica). Falta simplificar para `NEXT_PUBLIC_APP_URL`/`IRONTRACKS_PUBLIC_ORIGIN` como primário e reduzir heurísticas.

2) **Backups/duplicados ainda versionados**: apesar de não estarem mais “poluindo” `src/`, continuam no Git em `_archive/duplicates/` e `claude/`.

3) **Unificação de assinatura em `user_entitlements`**: hoje a unificação ficou em **função central (`getVipPlanLimits`) + rotas**; ainda não existe a tabela única `user_entitlements` alimentada por webhooks (recomendação do doc).

4) **Migração JS→TS nos componentes mais críticos**: `AdminPanelV2.js` e `ActiveWorkout.js` seguem em JS (houve refactors pontuais, mas não a migração de tipo de alto impacto citada no doc).

## Plano para “garantir 100%” (correções restantes)
### 1) Simplificar OAuth origin (alto impacto / baixo esforço)
- Refatorar [auth/login/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/login/route.ts) para:
  - Priorizar `IRONTRACKS_PUBLIC_ORIGIN` ou `NEXT_PUBLIC_APP_URL`.
  - Só usar `x-forwarded-*` como fallback em dev/local.
  - Padronizar `redirectTo` como `${PUBLIC_ORIGIN}/auth/callback?...`.
- Adicionar smoke test simples para garantir que, com env presente, a rota não depende de headers.

### 2) Remover artefatos (backups/duplicados) do Git
- Migrar o conteúdo útil de `claude/` para uma pasta de documentação (ou apagar) e remover `_archive/duplicates/`.
- Adicionar `.gitignore` para impedir que arquivos com sufixo ` 2`, ` 3`, ` 4` voltem.

### 3) Entitlements “de verdade” (tabela única)
- Criar migration `user_entitlements` (user_id, tier, source, valid_until, updated_at, metadata).
- Criar jobs/handlers para atualizar `user_entitlements` via webhooks (RevenueCat + Marketplace).
- Ajustar `getVipPlanLimits` para ler primeiro `user_entitlements`, com fallback temporário para as tabelas antigas.

### 4) Migração progressiva JS→TS nos críticos
- Converter `ActiveWorkout.js` e `AdminPanelV2.js` para TSX em etapas:
  - Primeiro: extrair tipos + hooks e manter o componente em JS usando helpers tipados.
  - Depois: converter arquivo inteiro.
- Priorizar paths mais perigosos: finish/save/sync, e fetch admin.

### 5) Verificação final
- Rodar `npm run build` e `npm run test:smoke`.
- Executar checklist manual mínimo: login OAuth, aprovação pendente/approved, coach chat e wizard com free/vip.

Se você aprovar este plano, eu continuo e deixo o arquivo `analise_critica_irontracks.md` totalmente “quitado” (sem pendências).