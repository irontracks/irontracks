## Objetivo
- Remover 100% do sistema atual de autenticação/login (fluxos duplicados, hacks de PKCE, roles espalhadas) e recriar um **fluxo único, moderno e rápido**, alinhado com **Supabase + Next.js (App Router) + @supabase/ssr**.
- Resultado esperado: login Google sem loop, sessão estável (refresh/redirect previsível), roles consistentes (admin/teacher/student), e configuração do Supabase documentada e “à prova de erro”.

## Princípios (para não deixar nada passar)
- **1 único caminho de OAuth**: iniciar login → callback → sessão → redirect.
- **1 única fonte de verdade de role**: `public.profiles.role` (com bootstrap via trigger).
- **Nada de lógica de role no client** (sem “admin email hardcoded” em React, sem consultas duplicadas a `teachers/me` para decidir permissão).
- **Nada de PKCE hacks/backup**: PKCE fica 100% no cookie storage do `@supabase/ssr` (padrão recomendado).
- **Domínio canônico**: todo fluxo usa o mesmo origin (evita PKCE/storage quebrar).

## Inventário do que será removido/substituído (checklist)
### Rotas e páginas de auth atuais (substituir)
- `/auth/login` (implementação atual) → substituir por versão oficial, minimalista e determinística.
- `/auth/callback` → reescrever seguindo padrão oficial `@supabase/ssr`.
- `/auth/oauth` → remover completamente (se existir) para eliminar duplicidade.
- `/auth/auth-code-error` → manter, mas padronizar mensagens.

### Middleware atual (substituir)
- `middleware.ts` e `src/utils/supabase/middleware.ts` → reescrever para:
  - **apenas** “refresh session”
  - **não** fazer redirects de produto (ex.: `/`→`/dashboard`) dentro de updateSession
  - manter redirect canônico (www → apex) **antes** de qualquer auth.

### Lógica de auth no client (remover)
- Remover do `src/app/page.js` toda a parte:
  - `onAuthStateChange` gigante
  - “resolveRole” via `profiles`/`teachers/me`
  - quaisquer watchdog/retry loops
  - quaisquer limpezas de cookies/localStorage para “consertar auth”
- `LoginScreen` vira UI simples que aponta para `/auth/login?next=...`.

### RBAC disperso (consolidar)
- Consolidar `src/utils/auth/route.ts` como única API de autorização server-side.
- Remover hardcodes e duplicatas:
  - `src/actions/admin-actions.js` / “admin email fixo” → usar `requireRole(['admin'])`.
  - arquivos inválidos tipo `route 2.js`, `route 3.js` (nomes com espaço) → deletar.

## Nova Arquitetura (App)
### 1) Estrutura de rotas (moderna e clara)
- `src/app/(public)/`:
  - `page.tsx` (landing/login)
  - `auth/login/route.ts` (inicia OAuth)
  - `auth/callback/route.ts` (troca code → sessão)
  - `auth/error/page.tsx` (erro de auth)
- `src/app/(app)/`:
  - `layout.tsx` (guard server-side: exige sessão)
  - `dashboard/page.tsx` e demais páginas protegidas.

### 2) Guard server-side (sem depender do client)
- Em `(app)/layout.tsx`:
  - criar supabase server client
  - `getUser()`
  - se `!user` → `redirect('/?next=/dashboard')`
  - opcional: carregar `profiles.role` e injetar em contexto.

### 3) Cliente Supabase (padrão)
- `src/utils/supabase/client.ts`:
  - `createBrowserClient(supabaseUrl, supabaseAnonKey)` sem hacks
  - validação defensiva (mensagem clara se env faltar)

### 4) Servidor Supabase SSR
- `src/utils/supabase/server.ts`:
  - `createServerClient(..., { cookies: { getAll, setAll }})` usando `next/headers` corretamente.
- `src/utils/supabase/middleware.ts`:
  - implementação idêntica ao guia oficial do Supabase para Next Middleware
  - sem “copiar cookie manual sem options”.

## Nova Arquitetura (Banco / Supabase)
### 1) Tabelas de identidade e roles
- `public.profiles` (se já existe): garantir colunas mínimas:
  - `id uuid pk references auth.users(id)`
  - `email text`
  - `display_name text`
  - `photo_url text`
  - `role text not null default 'student'` (valores: admin|teacher|student)
  - `last_seen timestamptz`
- `public.teachers`:
  - garantir `email` e `user_id uuid references auth.users(id)`
- `public.students`:
  - garantir `email` e `user_id uuid references auth.users(id)`

### 2) Triggers (criação automática de profile)
- Trigger `AFTER INSERT ON auth.users`:
  - cria/atualiza `profiles`
  - define role assim:
    - se email == ADMIN_EMAIL → admin
    - else se existe em `teachers.email` → teacher
    - else se existe em `students.email` → student
    - else → student (ou user, conforme você preferir)
  - linka `teachers.user_id` / `students.user_id`.

### 3) Invite-only (opcional, mas consistente)
- Se você quer invite-only:
  - Trigger `BEFORE INSERT ON auth.users` que permite somente se email existir em `teachers` ou `students` (e sempre permite admin).
- Se você quer aberto:
  - remover trigger de whitelist e deixar signup normal.

### 4) RLS (mínimo necessário)
- `profiles`:
  - SELECT: usuário lê o próprio profile
  - UPDATE: usuário edita o próprio profile
  - Admin: pode ler/editar todos
- `teachers`/`students`:
  - Admin: manage all
  - Teacher: pode ler/editar apenas registros relacionados (definimos exatamente, conforme regra de negócio)

### 5) Migrations
- Criar uma migration “única” de auth v2 (não editar antigas):
  - garante colunas
  - cria/atualiza funções e triggers
  - recria policies com `DROP POLICY IF EXISTS`.

## Configuração do Supabase (checklist obrigatório)
- Authentication → URL Configuration:
  - **Site URL**: `https://irontracks.com.br` (com protocolo)
  - Redirect URLs (com protocolo):
    - `https://irontracks.com.br/auth/callback`
    - `https://www.irontracks.com.br/auth/callback` (se você realmente usa www)
    - `http://localhost:3000/auth/callback`
- Providers → Google:
  - Authorized redirect URIs no Google Console devem apontar para o callback do Supabase (padrão) e o Supabase deve estar correto.
- Domínio canônico:
  - escolher apex ou www (recomendo apex) e redirecionar o outro.

## Implementação (ordem de execução)
1) **Criar branch de rebuild** e congelar mudanças paralelas.
2) **Remover todo auth espalhado no client**:
   - limpar `src/app/page.js` (auth state machine, role resolver, hacks de cookie/storage)
   - deixar apenas UI e chamadas do app após autenticar.
3) **Recriar middleware + utils SSR** seguindo padrão oficial.
4) **Recriar rotas de auth**:
   - `/auth/login` (inicia OAuth)
   - `/auth/callback` (exchange)
   - `/auth/error` (mensagens)
5) **Reorganizar rotas protegidas** com `(app)/layout.tsx` guard server-side.
6) **Recriar RBAC server-side** (`requireUser/requireRole`) e migrar rotas API para usar isso consistentemente.
7) **Criar migration SQL auth-v2** (roles, triggers, RLS) + script de repair:
   - backfill `profiles` para usuários existentes
   - backfill `teachers.user_id` / `students.user_id` por email.

## Validação (sem deixar buracos)
- Cenários obrigatórios:
  - Professor novo (email já cadastrado em `teachers`) consegue login na primeira vez
  - Aluno novo (email já cadastrado em `students`) idem
  - Admin sempre entra
  - Refresh em `/dashboard` mantém sessão
  - Logout limpa sessão e volta para `/`
  - Realtime/rotas API com `requireRole` retornam 401/403 correto
- Diagnóstico:
  - endpoint `/api/supabase/status` (interno) para verificar cookies e `getUser()`
  - logs mínimos sem expor tokens.

## Entregáveis
- Código: novo conjunto de arquivos de auth + remoção completa do legado.
- SQL: migration “auth-v2” + script de repair.
- Documento curto (README): configuração Supabase/Google (Site URL, Redirect URLs, domínios).

Se você confirmar este plano, eu começo imediatamente removendo o auth atual e reconstruindo por módulos na ordem acima.