<!-- Auditoria de seguranca multi-agente — 2026-06-27 — 56 agentes, 43 achados brutos, 37 confirmados apos verificacao adversarial -->

# Relatório Executivo — Auditoria de Segurança IronTracks

## Resumo executivo

A auditoria identificou uma postura de segurança **frágil e sistemicamente comprometida na camada de autorização**. A causa-raiz recorrente é o uso de `createAdminClient()` (service-role, que desliga a RLS do PostgreSQL) em rotas e páginas que filtram por um `id`/`studentId`/`userId` vindo do request **sem nenhuma verificação de ownership ou de papel (role)**. Isso produziu múltiplos IDOR críticos que expõem dados de saúde sensíveis (exames laboratoriais, composição corporal — dado sensível por LGPD art. 11), PII (e-mails de toda a base) e permitem destruição de dados/contas em massa. Agrava o quadro o fato de o middleware **não impor autenticação em nenhuma rota** (apenas refresca a sessão), delegando 100% da proteção a checagens manuais por rota — qualquer rota que esqueça a checagem vira um IDOR. Há ainda escalada de privilégio trivial (qualquer usuário vira `teacher` com um único POST) e uma policy de RLS em `profiles` com `USING(true)` que vaza a base inteira. **Prioridade máxima:** os 4 achados críticos e os 4 altos precisam de correção imediata, pois são exploráveis em produção por qualquer usuário autenticado (ou anônimo, no caso do relatório público).

| Severidade | Quantidade |
|---|---|
| Critical | 4 |
| High | 4 |
| Medium | 6 |
| Low | 11 |
| Info | 11 |
| Uncertain (a investigar) | 1 |
| **Total** | **37** |

> Observação de deduplicação: os dois achados sobre o bucket público `bioimpedance-files` (finders `user-data` e `ssrf-upload`) tratam da **mesma raiz** e foram consolidados em um único item médio. O achado crítico do middleware e o achado alto do `/relatorio/[userId]` compartilham a mesma cadeia de exploração (ausência de gating + IDOR anônimo); ambos são mantidos separados por terem correções distintas (camada de middleware vs. authz na página), com referência cruzada.

---

## Achados críticos e altos

### [CRITICAL] Qualquer teacher pode deletar QUALQUER teacher (incl. `auth.users`) — IDOR / escalação destrutiva em massa
- **Local:** `src/app/api/admin/teachers/delete/route.ts:21-79` + RPC `supabase/migrations/20260213120000_delete_teacher_cascade.sql:5-58`
- **Problema:** A rota autoriza com `requireRoleOrBearer(req, ['admin','teacher'])` (linha 21), então qualquer `teacher` legítimo passa. O `id` do alvo vem cru do body (linha 32-33) sem checagem de ownership nem de admin, e é passado ao RPC `delete_teacher_cascade` via `createAdminClient()` (service-role, RLS off, linha 52), seguido de `admin.auth.admin.deleteUser(resolvedUserId)` (linha 75). O RPC é `SECURITY DEFINER` e **não faz authz** — `p_actor_role` só alimenta auditoria; deleta `profiles`, `auth.users` e tabelas dependentes a partir de `p_teacher_id`.
- **Cenário de exploração:** Atacante com role `teacher` faz `POST /api/admin/teachers/delete` com `{ id: '<id de outro teacher>' }`. O RPC apaga em cascata o profile, todos os dados e a conta de login do alvo. Iterando, derruba todos os teachers da plataforma.
- **Correção:** Trocar para `requireRoleOrBearer(req, ['admin'])`. Se for preciso permitir auto-deleção, validar explicitamente `resolvedTeacherId/teacherUserId === auth.user.id`. Adicionar checagem de admin **dentro do RPC** como defesa em profundidade (`IF NOT is_admin() ... RAISE EXCEPTION`).

### [CRITICAL] IDOR: `/api/ai/student-workout` vaza perfil, avaliações, treino e EXAMES LABORATORIAIS de qualquer usuário
- **Local:** `src/app/api/ai/student-workout/route.ts:43-130` (com `src/utils/ai/userContext.ts:140-158`)
- **Problema:** A rota só chama `requireUser()` (linha 45) — qualquer usuário autenticado passa — e não verifica vínculo professor-aluno nem ownership. Recebe `studentId` do body (linha 26-31) e usa `createAdminClient()` (service-role, linha 62) para ler `profiles`, `assessments` (peso, % gordura, massa magra, notes, goals) e `buildUserContextBlock(... ['labs'])`, que injeta marcadores laboratoriais alterados de `lab_exams` da vítima. Os dados retornam embutidos no plano gerado pela IA.
- **Cenário de exploração:** Usuário comum faz `POST` com `{"studentId":"<UUID-da-vítima>"}`. O servidor lê e reflete os dados de saúde da vítima na resposta. Iterando UUIDs (coletados via feed social/perfis), exfiltra dados de saúde em massa.
- **Correção:** Antes de usar `studentId`, exigir `requireRole(['teacher','admin'])` **e** confirmar vínculo (`assessments/lab_exams.trainer_id === userId`), reusando o padrão já presente em `lab-exam-protocol/route.ts:405` e `body-composition-correlation/route.ts:77`; ou, se for auto-uso, ignorar `studentId` e usar `auth.user.id`. Retornar 403 caso contrário.

### [CRITICAL] IDOR: `/api/ai/assessment-report` vaza email, avaliações físicas e labs de qualquer usuário
- **Local:** `src/app/api/ai/assessment-report/route.ts:39-114`
- **Problema:** Falha idêntica: apenas `requireUser()` (linha 41), `studentId` do body, e `createAdminClient()` (linha 58) lendo `profiles` incluindo **email** (`select 'id, name, email, gender, birth_date'`, linha 61-65), as 3 últimas `assessments` e `buildUserContextBlock` com setor `labs`. A resposta retorna `studentName: profile?.name` (linha 114) e o relatório gerado a partir do JSON completo.
- **Cenário de exploração:** Usuário comum faz `POST` com `{"studentId":"<UUID-da-vítima>"}` e recebe nome, email, histórico de composição corporal e marcadores laboratoriais alterados da vítima. Enumeração em massa de PII + saúde.
- **Correção:** Mesma do `student-workout`: exigir role teacher/admin com vínculo `trainer_id`, ou restringir ao próprio `auth.user.id`. Remover `email` do select a menos que estritamente necessário. Reusar o padrão de ownership de `lab-exam-extract/route.ts:124`.

### [CRITICAL] Middleware não aplica autenticação em nenhuma rota — IDOR anônimo de dados de saúde via `/relatorio/[userId]`
- **Local:** `src/utils/supabase/middleware.ts:5-45` + `middleware.ts:42-46`; exploração concreta em `src/app/relatorio/[userId]/page.tsx:138-485`
- **Problema:** `updateSession()` só chama `supabase.auth.getUser()` para refrescar o cookie e retorna `NextResponse.next()`; faz early-return na linha 27 se não houver cookie, e **nunca redireciona para login** nem mantém allowlist de rotas públicas. O matcher exclui apenas `_next`/assets/`auth`, então `/relatorio/[userId]` é processado sem gating. A proteção depende inteiramente de cada página/handler. A página `/relatorio/[userId]` não tem nenhuma checagem de sessão/ownership e usa `createAdminClient()` (linha 139, RLS off) filtrando pelo `userId` cru da URL.
- **Cenário de exploração:** Visitante **anônimo** acessa `/relatorio/<UUID>` e recebe email (linhas 280, 676), composição corporal, medidas, nutrição e **exames médicos** (LDL, HDL, hematócrito, homocisteína, vitamina D — linhas 204-485). O único guard (linha 184) só checa se o UUID existe. Risco sistêmico: cada nova rota que esqueça a checagem manual é um IDOR em potencial.
- **Correção:** (1) Adicionar camada de gating no middleware (ou layout server-side compartilhado) que exija sessão válida para grupos de rotas autenticadas e redirecione ao login na ausência dela, com allowlist explícita de paths públicos. (2) Na página, chamar `requireUser()` e autorizar apenas dono (`session.user.id === userId`) ou teacher/admin com vínculo; trocar `createAdminClient()` por `createClient()` (RLS aplica) quando possível. O `robots noindex` **não** é controle de segurança.

### [HIGH] Auto-promoção a role `teacher` sem convite — qualquer usuário vira professor
- **Local:** `src/app/api/teachers/accept/route.ts:14`
- **Problema:** O `POST /api/teachers/accept` exige só `requireUser` e, na linha 14, executa `admin.from('profiles').update({ role: 'teacher' }).eq('id', user.id)` **incondicionalmente** (via service-role), **antes** de validar qualquer convite. O update em `teachers` (linhas 16-21) é filtrado por `.eq('status','pending')`, mas o flip de `profiles.role` não tem nenhuma condição. Como `resolveRoleByUser` (`src/utils/auth/route.ts:67`) confia em `profiles.role`, o atacante passa a ser tratado como professor.
- **Cenário de exploração:** Usuário comum faz um único `POST /api/teachers/accept` (sem body). Vira `teacher` sem convite e ganha a superfície de professor: criar planos de marketplace (`POST /api/marketplace/plans`), configurar carteira de payout (`POST /api/teachers/wallet`), etc.
- **Correção:** Só promover o role se o update em `teachers` (pending → active) realmente afetar ≥1 linha. Rodar o update de `teachers` primeiro com `.select()`; se retornar 0 linhas, retornar 403/404 e **não** tocar em `profiles.role`.

### [HIGH] Write-IDOR: qualquer usuário autenticado injeta mensagens em QUALQUER chat de team session
- **Local:** `src/app/api/team/chat/notify/route.ts:25-133` *(o finder citou erroneamente `team/chat/messages/route.ts`; o POST vulnerável real está em `notify/route.ts`)*
- **Problema:** O `POST` usa `createAdminClient()` (RLS bypass) e nunca valida que o usuário é membro do `sessionId` do body. A única checagem é `senderId === auth.user.id` (anti-impersonação, linha 38). A RLS de INSERT (`20260310_team_chat_messages.sql:27-28`) só exige `auth.uid() = user_id`, sem membership — e a rota usa service-role de qualquer forma. O GET em `messages/route.ts` valida membership corretamente, mas o POST de notify não.
- **Cenário de exploração:** Atacante autenticado descobre/adivinha um `sessionId` e faz `POST /api/team/chat/notify` com `{sessionId: <alheio>, senderId: <próprio uid>, senderName, text}`. A mensagem é persistida no chat de terceiros, membros legítimos a recebem e o servidor dispara push (`💬 ...`) para todos. Injeção de conteúdo arbitrário + spam de push.
- **Correção:** Antes do insert, validar membership igual ao GET (host_uid OU presença em `participants[]`/`team_session_presence`), retornando 403 se não for membro. Endurecer a RLS de INSERT para exigir membership.

### [HIGH] Policy SELECT de `profiles` com `USING(true)` expõe email + dados de marketing de TODOS a qualquer usuário logado
- **Local:** `supabase/migrations/20260508183000_dedup_rls_policies.sql:22-26` (policy `profiles_read_all_authenticated`, confirmada ao vivo em `pg_policies`)
- **Problema:** A policy ativa tem `cmd=SELECT, role=authenticated, qual=true`. Como a RLS do Postgres é permissiva (OR), qualquer usuário autenticado lê TODAS as linhas de `profiles`, ignorando `profiles_select_own` (que foi dropada nessa migration por redundância). A tabela contém `email`, `acquisition_source` (jsonb de marketing/UTM), `role`, `is_approved`, `approval_status`, `referral_code`, `handle`, `last_seen`.
- **Cenário de exploração:** Usuário logado usa a anon key pública (no bundle) + sua sessão e chama `supabase.from('profiles').select('email,acquisition_source,role,handle,referral_code')`. O PostgREST aplica `qual=true` e devolve a base inteira (emails para phishing, atribuição de marketing, identificação de admins/teachers). Paginando, exfiltra tudo.
- **Correção:** Remover/substituir `profiles_read_all_authenticated`. Para exibir dados públicos de outros usuários, criar uma VIEW com apenas colunas não-sensíveis (`id, display_name, photo_url, handle`) e dar SELECT nela, mantendo `profiles` restrita a `id=auth.uid()` (+ `is_admin()`/`is_teacher_of`). Nunca expor `email`/`acquisition_source`/`approval_status` via `qual=true`.

### [HIGH] Relatório público expõe saúde/PII por enumeração de `userId` (IDOR sem autenticação)
- **Local:** `src/app/relatorio/[userId]/page.tsx:137-188`
- **Problema:** *(Mesma raiz do crítico do middleware — listado por ter correção própria na página.)* Server Component público que instancia `createAdminClient()` (service-role) e consulta dados sensíveis filtrando apenas pelo `userId` da URL: email, avaliações físicas completas (peso, % gordura, massa magra, circunferências), histórico de treino, nutrição de 14 dias e exames laboratoriais (LDL/HDL/Hematócrito/Homocisteína/Vit. D) renderizados como "Alertas médicos". O único controle (linha 184) só verifica se o userId existe.
- **Cenário de exploração:** Atacante anônimo acessa `/relatorio/<UUID>`. UUIDs vazam via feed social, URLs compartilhadas, app cliente, ou qualquer usuário logado troca o próprio id pelo de outro. Exposição por-alvo de PII + dado de saúde (LGPD art. 11) sem auth.
- **Correção:** Antes de qualquer query: (1) `requireUser()`; (2) autorizar só dono (`session.user.id === userId`) ou teacher/admin com vínculo, senão `notFound()`/403. Trocar `createAdminClient()` por `createClient()` onde possível. Considerar tokens de compartilhamento assinados com expiração se o relatório precisar ser compartilhável.

---

## Achados médios

- **[MEDIUM] Spoofing/spam de push "Convite de treino"** — `src/app/api/team/invite/notify/route.ts:35-83`. O docstring promete validar a existência do convite, mas o código não faz isso: dispara push para qualquer `targetUserId` com o nome real do atacante. Permite phishing/assédio direcionado. **Correção:** confirmar via admin client que existe convite pendente real de `sender → target` antes do push; senão 403.

- **[MEDIUM] Bucket `bioimpedance-files` é público — documentos médicos (BIA) acessíveis sem auth** *(dedup de 2 achados)* — `src/app/api/assessment/bia-attachment/signed-upload/route.ts:35,89-124`. Bucket criado com `public: true` e `getPublicUrl()` persistida em `assessments.bia_attachment_url`; leitura sem login/RLS/ownership, divergindo de `lab-exams` e `body-photos` (privados + signed URL). **Correção:** tornar o bucket privado, servir via signed URL de curta duração com checagem de dono/personal, persistir `storage_path` em vez da public URL e migrar anexos legados.

- **[MEDIUM] push/register permite sequestrar/derrubar push token de outro usuário (IDOR)** — `src/app/api/push/register/route.ts:42-55`. Grava via `createAdminClient()` com `upsert onConflict:'token'` (PK só `token`, não `(user_id, token)`); quem conhece o token de outro re-aponta `user_id` para si (DoS de push). **Correção:** `onConflict` composto `(user_id, token)` ou guard que rejeita 403 se a linha já existir com `user_id` diferente; idealmente usar `createClient()` deixando a RLS barrar.

- **[MEDIUM] Story `media_path` aceita URL Cloudinary de cloud arbitrária (bypass de ownership e MIME)** — `src/app/api/social/stories/create/route.ts:54-77`. O check é só `startsWith('https://res.cloudinary.com/')`, sem validar o cloud name; atacante hospeda conteúdo na própria conta Cloudinary e `/media` redireciona (307) seguidores ao destino controlado. **Correção:** validar o cloud name exato do projeto (`env.cloudinary.cloudName`), o folder esperado e o `userId` no `public_id`; aplicar a mesma validação no handler `/media` antes de redirecionar.

- **[MEDIUM] Upload de chat-media sem validação de content-type/extensão/tamanho em bucket público** — `src/app/api/storage/signed-upload/route.ts:29-41`. Sem allowlist de MIME, sem `fileSizeLimit`, bucket `public:true` (confirmado em produção: `file_size_limit=null`, `allowed_mime_types=null`). A rota de remediação `ensure-bucket` existe mas é **código morto** (nunca chamada). Permite hospedar HTML/SVG arbitrário e abuso de armazenamento. **Correção:** adicionar allowlist de content-type/extensão e `fileSizeLimit` inline na rota que assina; considerar bucket privado + signed read.

---

## Baixos / hardening

- **[LOW] `assign-teacher`: teacher atribui aluno não-designado a OUTRO teacher arbitrário** — `src/app/api/admin/students/assign-teacher/route.ts:22-94`. `teacher_user_id` vem do body sem exigir `=== auth.user.id`. Correção: forçar `teacher_user_id = auth.user.id` para role teacher; atribuição a terceiros só admin.
- **[LOW] `/api/ai/team-workout-insights` sem gating VIP** — `src/app/api/ai/team-workout-insights/route.ts:43-91`. Só `requireUser` + rate-limit 5/min (~7200/dia); gera Gemini para free sem cota. Correção: aplicar `checkVipFeatureAccess`/`incrementVipUsage` ou teto diário.
- **[LOW] Prompt injection persistida aluno→professor** — `src/utils/ai/userContext.ts:38-46`. Campos livres (`constraints`/`notes`/`goals`) entram crus no prompt do Gemini exibido ao professor. Correção: delimitar campos de usuário com fences e instrução "tratar como dado, não comando".
- **[LOW] Webhook RevenueCat confia 100% no `app_user_id` do payload** — `src/app/api/billing/webhooks/revenuecat/route.ts:131-273`. Sem cross-check com a API da RevenueCat; se o `WEBHOOK_AUTH_KEY` vazar, forja VIP arbitrário. Correção (defense-in-depth): em eventos de ativação, validar via `GET /v1/subscribers/{id}` antes de gravar o entitlement; rotacionar e nunca logar a key.
- **[LOW] GET de team chat referencia tabela/coluna inexistentes** — `src/app/api/team/chat/messages/route.ts:26-42`. Usa `teacher_id` e `team_session_participants` que não existem (schema real: `host_uid` + `participants` jsonb + `team_session_presence`); a rota sempre retorna 404 (fail-closed, mas quebrada). Correção: alinhar ao schema real.
- **[LOW] Sign in with Apple sem verificação de nonce (replay dentro da janela de exp)** — `src/hooks/useLoginScreen.ts:208-233`. Correção: reintroduzir nonce (SHA256 no request da Apple + nonce em claro no `signInWithIdToken`).
- **[LOW] Enumeração de contas em `/api/access-request/create`** — `route.ts:61-87`. Mensagens/status distintos revelam se o email já tem conta e em que estágio. Correção: resposta neutra única ou exigir verificação de posse (OTP).
- **[LOW] `cancel-push` sem ownership do `scheduleId`** — `src/app/api/rest/cancel-push/route.ts:22-33`. Qualquer usuário cancela push agendado de outro (messageId QStash opaco, não enumerável). Correção: persistir mapping `scheduleId→userId` e validar dono.
- **[LOW] `storage/ensure-bucket` acessível a qualquer logado e sem rate-limit** — `src/app/api/storage/ensure-bucket/route.ts:40-70`. Cada chamada executa `updateBucket` via service-role; DoS leve. Correção: `checkRateLimitAsync` por user/ip; restringir a cron/admin.
- **[LOW] `purge-chat-media` destrutivo global sem escopo/dry-run/confirmação** — `src/app/api/storage/purge-chat-media/route.ts:6-54`. Admin-only (correto), mas um POST apaga toda mídia + mensagens (DELETE por `LIKE`) irreversivelmente. Correção: exigir escopo (`channelId`/`olderThan`), `dryRun`, token de confirmação, alerta Sentry, coluna estruturada `has_media`.
- **[LOW] `delete_teacher_cascade` SECURITY DEFINER sem checagem interna de admin** — `supabase/migrations/20260213120000_delete_teacher_cascade.sql:5-58`. ACL atual restrito a `service_role` (não explorável hoje), mas sem defesa em profundidade; sem `SET search_path` (drift com produção). Correção: guard interno `is_admin()`, `SET search_path=''`, qualificar tabelas, `REVOKE` versionado.
- **[LOW] Mensagens de erro Supabase/PostgREST cruas ao cliente em ~86 rotas** — ex. `src/app/api/vip/profile/route.ts:39,81`. Vaza nomes de tabela/coluna/constraint e estado de RLS (recon). Correção: helper central `respondDbError` que loga server-side e retorna mensagem genérica.
- **[LOW] Assinatura Cloudinary não restringe formato/resource_type** — `src/app/api/storage/sign-cloudinary/route.ts:33-51`. Assina só `folder/public_id/timestamp`; cliente sobe `resource_type=raw` arbitrário no próprio namespace. Correção: incluir `allowed_formats`, `resource_type` fixo e limite de bytes **dentro** da assinatura.

---

## Itens incertos que pedem investigação manual

- **[UNCERTAIN] `teachers` SELECT policy com email de admin hardcoded** — `supabase/migrations/20260401_fix_rls_security.sql:4`. O verificador **não conseguiu fundamentar pelo código**: a linha 4 é apenas comentário, a policy `teachers_select_self_or_admin` e a string `djmkapple@gmail.com` **não existem em nenhum arquivo** do repo (grep zero). O finder afirma tê-la confirmado "ao vivo" via `pg_policies` — provável policy criada fora das migrations versionadas (ex.: dashboard Supabase). **Ação manual:** consultar `pg_policies` no banco de produção para confirmar se a policy existe com o literal de email. Se existir, é info/hardening (acesso legítimo, mas acopla authz a literal e expõe o super-admin em `pg_policies`); trocar o literal por `public.is_admin()`. **Investigar também o drift geral migrations-vs-produção**, já que `is_admin()` e essa policy não têm `CREATE` versionado — o schema real não está 100% representado nas migrations.

---

## Plano de remediação priorizado

### HOJE (exploráveis em produção por qualquer usuário/anônimo — perda de dados de saúde, PII e contas)
1. **`/api/admin/teachers/delete`** — restringir a `['admin']` + ownership; bloqueia deleção destrutiva em massa de teachers/contas. *(Atenção: toca fluxo destrutivo + RPC; confirmar antes de mergear conforme política de auth/schema.)*
2. **`/api/ai/student-workout` e `/api/ai/assessment-report`** — adicionar checagem de role+vínculo (ou self) antes de ler via service-role; remover `email` do select do report. Mesma correção, aplicar nas duas juntas.
3. **`/relatorio/[userId]/page.tsx`** — adicionar `requireUser()` + autorização por dono/vínculo; trocar para `createClient()`.
4. **Policy `profiles_read_all_authenticated`** — substituir o `USING(true)` por VIEW pública de colunas não-sensíveis + `profiles` restrita a `auth.uid()`. *(Migration — confirmar "sim" e ter rollback plan.)*

### ESSA SEMANA (alto/médio — escalada de privilégio, write-IDOR, exposição de saúde)
5. **Gating no middleware** — camada de autenticação com allowlist de rotas públicas, como defesa em profundidade contra futuros IDOR (a causa-raiz sistêmica). *(Mudança em `middleware.ts` — pedir confirmação antes de mergear.)*
6. **`/api/teachers/accept`** — só promover role se houver convite pending casado.
7. **`/api/team/chat/notify`** — validar membership antes do insert; endurecer RLS de INSERT.
8. **Bucket `bioimpedance-files`** → privado + signed URL com ownership; migrar legado.
9. **`push/register`** (`onConflict` composto), **stories `media_path`** (validar cloud name) e **`team/invite/notify`** (validar convite).
10. **`signed-upload` de chat-media** — allowlist de MIME + `fileSizeLimit`; remover/ligar o `ensure-bucket` morto.

### BACKLOG (lows + hardening + info)
11. Endurecer constant-time nos webhooks/cron (`revenuecat:97`, `cleanup-expired`, `purge-soft-delete-bin`), nonce no Sign in with Apple, gating VIP em `team-workout-insights`, ownership em `cancel-push` e `assign-teacher`.
12. Defense-in-depth no webhook RevenueCat (`GET /v1/subscribers/{id}`) e guard interno em `delete_teacher_cascade` + correção do `search_path`/drift de migrations.
13. Higiene de respostas: helper central de erro de DB (~86 rotas), resposta neutra em `access-request/create`, prompt-injection fencing em `userContext`, alinhar GET de team chat ao schema, guard-rails em `purge-chat-media`.
14. **Investigar o item uncertain** (policy de email hardcoded) e o **drift geral migrations-vs-produção** — várias policies/funções existem só no banco, não versionadas.
15. Itens info puramente cosméticos/consistência (hostname hardcoded em `layout.tsx`, `safePg`/`safePgLike`, `style-src 'unsafe-inline'`, telefone bruto em `access-request`) — limpeza oportunista.