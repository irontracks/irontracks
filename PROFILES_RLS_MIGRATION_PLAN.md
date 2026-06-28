<!-- Plano de correção do achado HIGH #7 (profiles RLS USING(true)) — auditoria 2026-06-27. Mapa: 51 leituras, 27 cross-user a migrar. Gerado por varredura multi-agente. -->

# Plano de Migração — Fechar o vazamento da policy `profiles_read_all_authenticated`

## 1. Resumo

**Total de leituras mapeadas:** 41 sites `from('profiles')`.

| Categoria | Qtd | Afetado pela mudança? | Ação |
|---|---|---|---|
| **cross-user sob RLS** (browser_anon ou server_user_scoped, lê linha de terceiro) — **A MIGRAR** | **27** | Sim — quebram ao restringir | Migrar para view pública OU endpoint admin server-side |
| **own-row** (filtro pelo próprio `auth.uid()`/`user.id`) | 11 | Não — continuam funcionando com a nova policy own-row | Nenhuma |
| **server_admin** (service role, RLS não aplica) | 3 | Não | Nenhuma |

As 27 cross-user se dividem em dois grupos por destino:

- **Grupo A — dados públicos legítimos (→ view `profiles_public`):** chat, comunidade, team, leaderboard, candidatos a convite, nomes de coach/professor. Só leem `id, display_name, handle, photo_url, last_seen` (+`role` em comunidade). **17 sites.**
- **Grupo B — leem coluna SENSÍVEL de terceiro (email/role) OU buscam por email (vetor de enumeração) (→ endpoint admin server-side com service role):** todo o admin-panel, AdminVipReports, e os lookups por email em `useAssessment`/`useAssessmentHistoryData`. **10 sites.**

O `email` de terceiro **nunca** deve ir para a view pública — esses sites têm que migrar para server-side com `createAdminClient()` (já guardados por role/admin no UI, mas hoje a anon key é a única defesa real).

---

## 2. View pública proposta — `public.profiles_public`

```sql
-- Migration: NNNNNNNNNNNNNN_profiles_public_view.sql
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = false) AS
SELECT
  id,
  display_name,
  handle,
  photo_url,
  last_seen,
  role
FROM public.profiles;

-- A view roda como SECURITY DEFINER (security_invoker=false): expõe SÓ estas
-- 6 colunas de TODAS as linhas a qualquer usuário autenticado, sem depender da
-- RLS de profiles. É o substituto controlado do antigo USING(true).
ALTER VIEW public.profiles_public OWNER TO postgres;

REVOKE ALL ON public.profiles_public FROM PUBLIC;
GRANT SELECT ON public.profiles_public TO authenticated;
-- anon: conceder apenas se houver leitura pré-login (não há no mapa). Deixar de fora.
-- GRANT SELECT ON public.profiles_public TO anon;
```

**Decisão de `security_invoker`:** usamos `false` (SECURITY DEFINER) **de propósito**. Com `security_invoker = true` a view re-aplicaria a RLS de `profiles` e, após restringirmos a tabela a own-row, a view também só devolveria a própria linha — quebrando exatamente os casos que ela existe para servir. Com `false`, a view é o ponto único e auditável que decide o que é público; a tabela base fica trancada.

**Colunas — justificativa:**
- `id` — chave de join, presente em quase todo site cross-user. **Entra.**
- `display_name` — exibido em chat, comunidade, team, badges, nomes de coach/professor. **Entra.**
- `handle` — @ público (usado em ProfilePage/perfil de terceiro). **Entra.**
- `photo_url` — avatar exibido a terceiros em chat/team/comunidade. **Entra.**
- `last_seen` — presença "visto por último"; exibido em ChatListScreen, invite-candidates. É de baixa sensibilidade e já é mostrado na UI a terceiros. **Entra.**
- `role` — necessário para badge de professor em `useCommunityData` (linhas 93 e 116). É *semi-sensível* mas não é PII; expor o role (teacher/student/admin) de terceiros é aceitável e já é visível socialmente (badge). **Entra** — assim a comunidade não precisa de endpoint server-side.
- `email`, `acquisition_source`, `approval_status`, `approved_at`, `approved_by`, `is_approved`, `referral_code` — **FICAM DE FORA**. São PII / marketing / gating; nenhum consumo legítimo de terceiro precisa delas.

---

## 3. Novas policies de `profiles`

```sql
-- Migration: NNNNNNNNNNNNNN_profiles_lock_select.sql
-- IMPORTANTE: aplicar SÓ DEPOIS que TODO o código (seções 4) já estiver
-- lendo de profiles_public / endpoints admin. Ver seção 5.

-- 1) Remove o vazamento.
DROP POLICY IF EXISTS profiles_read_all_authenticated ON public.profiles;

-- 2) Re-cria own-row (foi dropada em 20260508183000 por ser "redundante" com
--    USING(true) — agora volta a ser necessária).
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

-- 3) Admin lê tudo (relatórios/admin-panel rodando server-side user-scoped).
--    is_admin() existe no DB (search_path travado em 20260401). Se por algum
--    motivo não existir no ambiente, usar o fallback por role comentado abaixo.
CREATE POLICY profiles_select_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
-- Fallback (se is_admin() ausente):
-- USING (EXISTS (SELECT 1 FROM public.profiles me
--                WHERE me.id = (SELECT auth.uid()) AND me.role = 'admin'));

-- 4) Professor lê alunos vinculados (cobre os endpoints user-scoped de
--    teacher: api/admin/workouts/*, e leituras por id de aluno). students tem
--    teacher_id (professor) e user_id (aluno).
CREATE POLICY profiles_select_teacher_students
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.user_id = public.profiles.id
        AND s.teacher_id = (SELECT auth.uid())
    )
  );
```

Notas:
- Policies SELECT são PERMISSIVE → OR-combinadas: own OU admin OU (professor do aluno). Nenhuma `WITH CHECK` (não se aplica a SELECT). UPDATE/INSERT own permanecem intactas (`profiles_update_own`, `profiles_insert_own`).
- A policy `profiles_select_teacher_students` permite que os endpoints user-scoped de teacher (`api/admin/workouts/history` e `by-student`) continuem resolvendo `id` de alunos **vinculados** sem precisar de admin client — mas **não** habilita busca por email de terceiro (vetor de enumeração), que segue para o Grupo B.

---

## 4. Sites a migrar (client / user-scoped sob RLS)

### Grupo A — trocar `from('profiles')` por `from('profiles_public')` (dados públicos)

| file:line | feature | colunas hoje | ação |
|---|---|---|---|
| src/components/ChatDirectScreen.tsx:137-141 | chat (carrega outro user, `.eq('id', resolvedOtherUserId)`) | id, display_name, photo_url, last_seen | → `profiles_public` |
| src/components/ChatDirectScreen.tsx:226-229 | chat (remetentes, `.in('id', senderIds)`) | id, display_name, photo_url | → `profiles_public` |
| src/components/ChatDirectScreen.tsx:283-287 | chat (realtime, remetente) | display_name, photo_url | → `profiles_public` |
| src/components/ChatListScreen.tsx:61-66 | chat (lista de contatos, `.neq('id', self)`) | id, display_name, photo_url, last_seen | → `profiles_public` (ver risco realtime, seção 5) |
| src/hooks/useUnreadBadges.ts:158-162 | chat (badge DM, display_name do remetente) | display_name | → `profiles_public` |
| src/hooks/useWorkoutFetch.ts:394-398 | treinos (nomes de coaches, `.in('id', coachIds)`) | id, display_name | → `profiles_public` |
| src/hooks/useStudentControlNotice.ts:52-56 | aluno (nome do professor controlador) | display_name | → `profiles_public` |
| src/contexts/team/useTeamInvites.ts:113-117 | team (quem convidou) | display_name, photo_url | → `profiles_public` |
| src/contexts/team/useTeamInvites.ts:344-348 | team (quem aceitou) | display_name, photo_url | → `profiles_public` |
| src/app/(app)/community/useCommunityData.ts:93 | comunidade (perfis de seguidores) | id, display_name, photo_url, role | → `profiles_public` |
| src/app/(app)/community/useCommunityData.ts:116 | comunidade (lista geral, sem filtro) | id, display_name, photo_url, role | → `profiles_public` |
| src/app/api/team/invite-candidates/route.ts:54 | team (perfis de alunos, `.in('id', ids)`) | id, last_seen, photo_url | → `profiles_public` |
| src/app/api/team/invite-candidates/route.ts:85 | team (lista geral, sem filtro de id) | id, display_name, photo_url, last_seen | → `profiles_public` |
| src/app/api/social/gym-leaderboard/route.ts:58 | leaderboard (`.in('id', userIds)`) | id, display_name, avatar_url | → `profiles_public` (ver nota `avatar_url`) |

Nota `avatar_url` (gym-leaderboard:58): coluna não existe no schema de `profiles` (provável alias/legado). **Verificar no código real** antes do PR — se for `photo_url` aliasado, ajustar para `photo_url` na view; se a query hoje retorna `null` silenciosamente, comportamento se mantém.

### Grupo A (alternativa) — leituras user-scoped de teacher que SÓ checam `id`

Estas continuam em `profiles` (coberto pela nova policy `profiles_select_teacher_students`), pois só precisam validar existência de aluno **vinculado** — não migram para a view nem para admin:

| file:line | feature | colunas | ação |
|---|---|---|---|
| src/app/api/admin/workouts/history/route.ts:36 | teacher (`.eq('id', id)` de aluno) | id | nenhuma (policy teacher cobre) |
| src/app/api/admin/workouts/by-student/route.ts:38 | teacher (`.eq('id', idOrStudent)`) | id | nenhuma (policy teacher cobre) |
| src/app/api/admin/workouts/by-student/route.ts:56 | teacher (`.eq('id', targetUserId)`) | id | nenhuma (policy teacher cobre) |

### Grupo B — migrar para endpoint admin server-side (`createAdminClient`, service role) — lê email/role de terceiro ou busca por email

| file:line | feature | colunas hoje | ação |
|---|---|---|---|
| src/components/admin/AdminVipReports.tsx:136-139 | admin VIP (resolve nome/email por id) | id, display_name, **email** | endpoint admin server-side |
| src/components/admin-panel/StudentWorkoutsTab.tsx:231 | admin (`.ilike('email')` de aluno) | id (filtro por email) | endpoint admin server-side |
| src/components/admin-panel/hooks/useAdminDataFetchers.ts:127-131 | admin (lista alunos, `.neq('role','teacher')`) | id, display_name, **email, role** | endpoint admin server-side |
| src/components/admin-panel/hooks/useAdminDataFetchers.ts:176-179 | admin (`.in('email', emails)`) | id, **email** | endpoint admin server-side |
| src/components/admin-panel/hooks/useAdminDataFetchers.ts:183-187 | admin (perfil do professor) | id, display_name, **email** | endpoint admin server-side |
| src/components/admin-panel/hooks/useAdminDataFetchers.ts:251-254 | admin (`.in('email', emails)`) | id, **email** | endpoint admin server-side |
| src/components/admin-panel/hooks/useAdminDataFetchers.ts:531-535 | admin (`.ilike('email')`) | id (por email) | endpoint admin server-side |
| src/components/admin-panel/hooks/useAdminStudentOps.ts:153-156 | admin (`.in('email', emails)`) | id, **email** | endpoint admin server-side |
| src/components/admin-panel/hooks/useAdminStudentOps.ts:164-168 | admin (perfil do professor) | id, display_name, **email** | endpoint admin server-side |
| src/hooks/useAssessment.ts:177-181 | professor (`.ilike('email')` de aluno) | id (por email) | endpoint admin / RPC server-side |
| src/hooks/useAssessmentHistoryData.ts:274-278 | professor (nome do aluno) | display_name, **email** | endpoint server-side; remover `email` do select |
| src/hooks/useAssessmentHistoryData.ts:333-337 | professor (`.ilike('email')` de aluno) | id (por email) | endpoint admin / RPC server-side |

### Grupo B (variante) — leituras de teacher por `id` de aluno que hoje quebram, mas dão pra cobrir com a view pública `id`

Estas só selecionam `id` de um aluno por `.eq('id', candidateId)`/`.in('id', ...)`. Após a policy `profiles_select_teacher_students`, se o aluno é vinculado ao professor logado elas funcionam direto em `profiles`. Se o vínculo não estiver garantido na linha, migrar para `profiles_public` (que expõe `id`):

| file:line | feature | colunas | ação |
|---|---|---|---|
| src/hooks/useAssessment.ts:133-137 | professor (`.eq('id', candidateId)` direto) | id | `profiles_public` (id) **ou** policy teacher |
| src/hooks/useAssessment.ts:160-164 | professor (valida `studentById.user_id`) | id | `profiles_public` (id) **ou** policy teacher |
| src/hooks/useAssessmentHistoryData.ts:316-320 | professor (resolve candidateId) | id | `profiles_public` (id) **ou** policy teacher |
| src/app/api/admin/workouts/history/route.ts:42 | teacher (`.ilike('email')`) | id (por email) | **endpoint admin** (busca por email não é coberta pela policy) |
| src/app/api/admin/workouts/by-student/route.ts:43 | teacher (`.ilike('email')`) | id (por email) | **endpoint admin** (idem) |

> Recomendação: para uniformidade, mande todos os `.ilike('email', ...)` para um único endpoint/RPC server-side de resolução por email (ex.: `POST /api/admin/resolve-user-by-email`, gate por role admin/teacher + verificação de vínculo), e os lookups por `id` para `profiles_public`.

### Sites que NÃO mudam (resumo)

**own-row (11) — continuam em `profiles`, cobertos por `profiles_select_own`:**
- ProfilePage.tsx:132 · SettingsModal.tsx:164 · settings/SettingsSections.tsx:29 · settings/SettingsSections.tsx:538 (role próprio) · useProfileCompletion.ts:120-129 (UPDATE…select) · useAppHandlers.ts:67-76 (UPDATE…select) · useLoginScreen.ts:238 · useProfileSave.ts:29-38 (UPDATE…select) · contexts/TeamWorkoutContext.tsx:60-64 · app/(app)/layout.tsx:23-27 · app/(app)/dashboard/layout.tsx:80-85 · app/api/dashboard/bootstrap/route.ts:156 · app/api/push/test/route.ts:72 · app/api/profiles/acquisition/route.ts:51 · app/wait-approval/page.tsx:24-28.

**server_admin (3) — service role, RLS não aplica, intocados:**
- app/(app)/admin/acquisition/page.tsx:48 · app/relatorio/[userId]/page.tsx:163 · app/(app)/layout.tsx:55 (UPDATE via admin client).

---

## 5. Riscos e ordem segura de rollout

**Por que migrar o CÓDIGO primeiro e só depois trancar a RLS:** a policy `USING(true)` é a única coisa que faz hoje 27 leituras funcionarem. Se dropar a policy antes de o código ler da view/endpoint, **quebra produção na hora** (chat sem nomes, comunidade vazia, team sem convites, avaliações de professor falhando). A view e os endpoints podem coexistir com `USING(true)` sem efeito colateral — então a sequência é: (1) criar view + endpoints, (2) apontar o código, (3) deploy e validar, (4) só então dropar `USING(true)` e criar as policies restritas. Entre (2) e (4) o sistema lê da view E a tabela ainda está aberta — zero downtime.

**`select('*')` de terceiro:** nenhum dos sites cross-user usa `select('*')` — todos listam colunas explícitas (confirmado em ChatDirectScreen, useCommunityData, invite-candidates, AdminVipReports). Mesmo assim, **grep `from('profiles').select('*')` antes do PR** para garantir que nenhum site oculto vaze tudo após mudanças.

**O que testar (com 2 contas distintas A e B, A não-admin):**
- Chat A↔B: nomes/fotos de B aparecem para A. ChatListScreen lista contatos.
- Comunidade: lista geral e badges de role de terceiros.
- Team: convite de B aparece para A com nome/foto; host vê quem aceitou.
- Professor: avaliação de aluno vinculado resolve por id e por email (via endpoint).
- Admin-panel/VIP reports: emails de alunos/professores aparecem (via endpoint server-side).
- own-row: settings, perfil, login Apple, dashboard bootstrap.
- **Negativo (a prova do fix):** com a anon key de A, rodar `select('email,referral_code,acquisition_source').neq('id', A)` → deve voltar **vazio**. Hoje volta tudo.

**Realtime (ChatListScreen.tsx:83):** a subscription em `UPDATE` de `profiles` entrega `payload.new` de terceiros pelo Realtime, que respeita a RLS da **tabela base** (não a view). Após trancar, A deixa de receber updates de presença de B via esse canal. **Risco médio.** Mitigação: trocar a fonte de presença para `profiles_public` por polling/refetch, ou aceitar a perda de live-update de `last_seen` de terceiros (degradação aceitável). Validar explicitamente neste rollout.

**Rollback:** se algo quebrar após o passo (4), reverter é uma única migration:
```sql
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_select_teacher_students ON public.profiles;
CREATE POLICY profiles_read_all_authenticated ON public.profiles
  FOR SELECT TO authenticated USING (true);
```
A view e os endpoints podem ficar (são inertes sob `USING(true)`). Rollback = restaurar a policy aberta; sem perda de dados.

---

## 6. Checklist de execução

1. **Branch + checkpoint:** `git checkout -b fix/profiles-rls-leak` e commit do estado atual.
2. **Migration 1 (view):** criar `public.profiles_public` (`security_invoker=false`, 6 colunas), `REVOKE ALL`, `GRANT SELECT TO authenticated`. Aplicar via `mcp__supabase__apply_migration`. **Não** dropar nada ainda.
3. **Endpoints admin (Grupo B):** criar rota(s) server-side com `createAdminClient()`, gate por role admin/teacher: (a) resolver perfis por id com email para AdminVipReports/admin-panel; (b) resolver user_id por email (substitui todos os `.ilike('email')`), validando vínculo professor↔aluno onde aplicável.
4. **Apontar código Grupo A** → `from('profiles_public')` nos 14+ sites da tabela (chat, comunidade, team, leaderboard, invite-candidates, coach/professor names). Confirmar `avatar_url` em gym-leaderboard:58.
5. **Apontar código Grupo B** → chamar os novos endpoints; **remover `email`** do select em useAssessmentHistoryData:274-278.
6. **Tratar Grupo B-variante (lookups por email de teacher)** → endpoint server-side; lookups por `id` de aluno → `profiles_public` ou confiar na policy teacher.
7. **Verificações locais:** `npx tsc --noEmit` → `eslint <arquivos> --max-warnings 0` → `npm run test:unit` → `npm run test:smoke`. Grep final `from('profiles').select('*')`.
8. **Deploy do código** (passo 4-6) para produção. Validar todos os fluxos da seção 5 com `USING(true)` **ainda ativo** (a tabela continua aberta — nada deve quebrar; estamos só trocando a fonte).
9. **Migration 2 (lock):** `DROP POLICY profiles_read_all_authenticated` + criar `profiles_select_own`, `profiles_select_admin` (confirmar `is_admin()` existe via `mcp__supabase__execute_sql`; senão usar fallback por role), `profiles_select_teacher_students`. Aplicar.
10. **Teste negativo em produção:** anon key de conta não-admin → `select('email')` de terceiro retorna vazio.
11. **Advisors:** `mcp__supabase__get_advisors` (security) — confirmar 0 findings novos e que a view não disparou `security_definer_view` indevido.
12. **Monitorar Sentry** 24-48h por erros de RLS (`permission denied` / queries retornando null) em chat/comunidade/team/avaliações. Rollback pronto (seção 5) se necessário.

**Fronteiras negativas:** não tocar em `middleware.ts`, fluxos de auth, policies de UPDATE/INSERT de `profiles`, nem nos 3 sites server_admin. As duas migrations são separadas e a de lock (passo 9) só entra após o código validado em prod.

---

**Verificações de código feitas:** `useAssessment.ts:131-190` (confirma `.eq('id', candidateId)` select só `id`, e `.ilike('email')` de aluno), `useCommunityData.ts:93,116` (confirma `role` de terceiros, lista sem filtro `.limit(500)`), `invite-candidates/route.ts:54,85` (confirma lista geral user-scoped sem filtro de id), `AdminVipReports.tsx:136-139` (confirma `email` de terceiro). Descoberta crítica nas migrations: `profiles_select_own` **já existiu e foi dropada** em `supabase/migrations/20260508183000_dedup_rls_policies.sql` por ser redundante com `USING(true)` — por isso o passo 9 precisa recriá-la, senão own-row também quebra. `is_admin()` referenciada em `20260401_fix_rls_security.sql` mas sem corpo nas migrations committed (criada direto no DB) — validar existência antes de usar na policy.