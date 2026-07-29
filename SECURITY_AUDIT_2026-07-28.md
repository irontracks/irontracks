# Auditoria de vazamento de dados — alunos e professores

**Data:** 2026-07-28 · **Escopo:** todo caminho por onde dado de aluno ou professor pode sair para quem não deveria vê-lo.

## Resumo

Varri as 246 rotas de API, as páginas server-side, as server actions, as 95 tabelas do banco (RLS real, consultada no Postgres de produção), as 32 funções `SECURITY DEFINER` expostas como RPC, os 6 buckets de storage e as 6 tabelas replicadas via Realtime.

**Não existe hoje nenhum caminho anônimo ou de usuário comum para ler dado de saúde, PII ou mensagem privada de outra pessoa.** Os quatro IDORs críticos da auditoria de junho estão fechados, e confirmei cada um lendo o código atual, não o relatório antigo.

Encontrei **6 achados confirmados**. Corrigi 4 nesta sessão, cada um com guard de regressão provado. Os 2 restantes dependem de decisão sua porque mexem em produção de forma não trivial.

| Severidade | Achado | Situação |
|---|---|---|
| Alto | Bucket `chat-media` é público — mídia de conversa privada abre sem login | **Aguarda sua decisão** |
| Médio | View `profiles_public` entrega a base inteira de usuários a qualquer logado | **Aguarda sua decisão** |
| Médio | Exames laboratoriais autorizados por vínculo obsoleto (ex-professor mantinha acesso) | Corrigido + guard |
| Médio | Professor consultava status de assinatura de qualquer usuário da plataforma | Corrigido + guard |
| Baixo | Comentários de story apagada/expirada continuavam legíveis | Corrigido + guard |
| Baixo | Aluno comum entrava na superfície de planos de serviço do professor | Corrigido + guard |

---

## Aguardando decisão

### 1. [ALTO] Bucket `chat-media` é público — mídia de DM abre sem login

**Confirmado em produção:** `storage.buckets` mostra `chat-media` com `public = true` (é o único dos 6; os outros cinco são privados com URL assinada). O cliente monta a URL com `getPublicUrl()` em [ChatDirectScreen.tsx:608](src/components/ChatDirectScreen.tsx:608).

Toda foto, vídeo e áudio trocado em conversa privada — inclusive entre aluno e professor, onde circulam foto corporal e print de exame — fica acessível para qualquer pessoa que tenha a URL, **sem sessão, sem checagem de participação no canal e sem expiração**. O acesso sobrevive à exclusão da mensagem e ao fim do vínculo entre as duas pessoas.

O upload está bem protegido (só membro do canal assina, com allowlist de extensão). O problema é só a leitura.

O path é `{channelId}/{timestamp}_{nome-original-do-arquivo}.jpg`. O `channelId` é um UUID, o que impede varredura em massa às cegas, mas o resto é adivinhável — e a URL pública fica **persistida em texto** na coluna `direct_messages.media_url`, então qualquer cópia dessa coluna (backup, log, export, um evento no Sentry) entrega mídia que abre no navegador de qualquer um.

**Por que não corrigi sozinho:** fechar o bucket quebra todas as URLs já gravadas no histórico de conversas. Precisa de migração — passar a servir por URL assinada e reescrever as referências antigas. É uma mudança visível para todo usuário e não cabe fazer sem seu aval.

**Correção proposta:** criar uma rota `/api/chat/media` que valide participação no canal e devolva `createSignedUrl` de curta duração (o mesmo padrão que `execution-videos` e `lab-exams` já usam), migrar o bucket para privado e fazer o cliente resolver `media_url` por essa rota. Posso preparar o plano com a estratégia de compatibilidade para as URLs antigas quando você quiser.

### 2. [MÉDIO] `profiles_public` entrega a base inteira a qualquer usuário logado

**Provei rodando como usuário autenticado comum no banco de produção:**

| Consulta | Linhas retornadas |
|---|---|
| `select count(*) from profiles` (tabela, RLS ativa) | **0** |
| `select count(*) from profiles_public` (view) | **54** |

A view é `SECURITY DEFINER` (`security_invoker = false`), então roda com os privilégios do dono e **a RLS de `profiles` não se aplica**. Com `GRANT SELECT` para `authenticated`, qualquer pessoa que crie uma conta lê `id`, `display_name`, `handle`, `photo_url`, `last_seen` e `role` de todos os usuários — indo direto no PostgREST com a chave anônima, que é pública no bundle do app, sem passar por nenhuma rota nossa e sem rate-limit.

**Contexto importante, para não soar como bug esquecido:** essa view foi criada de propósito em junho ([20260627150000_profiles_public_view.sql](supabase/migrations/20260627150000_profiles_public_view.sql)), junto com o lock da RLS de `profiles`, justamente para ser o diretório público do app. O acesso anônimo já foi revogado no dia seguinte. Oito telas dependem dela (chat, comunidade, badges, lista de alunos). Então isto é **superfície maior que o necessário**, não uma falha acidental — e é por isso que a decisão é sua.

O que me incomoda em concreto: `role` revela quem é `admin` e quem é `teacher`, o que serve de mapa para ataque dirigido; e a listagem completa entrega os UUIDs de todo mundo, que são a munição de qualquer IDOR futuro.

**Correção proposta (sem quebrar as 8 telas):** remover `role` da view e trocar a listagem aberta por uma RPC de busca que exija termo e devolva no máximo N resultados. Isso mantém chat e comunidade funcionando e tira o "baixe a base inteira". Exige migration — por isso não apliquei.

---

## Corrigido nesta sessão

Cada correção veio com guard de regressão em [healthDataAccessGuards.test.ts](src/app/api/__tests__/healthDataAccessGuards.test.ts), e **provei que cada guard falha com o bug de volta** (desfiz a correção, vi vermelho, restaurei, vi verde). Os guards varrem a família inteira de rotas, não só o arquivo que originou o achado.

### [MÉDIO] Exame laboratorial liberado por vínculo obsoleto

Três rotas autorizavam comparando quem chama com o `lab_exams.trainer_id` gravado na linha. Esse campo é escrito uma vez, na criação, e nunca revalidado — então **um professor que perdeu o vínculo com o aluno continuava lendo, baixando e apagando os exames dele**, indefinidamente. Cenário real: aluno troca de personal.

Os dados em jogo são os mais sensíveis do app: testosterona, cortisol, hemograma, perfil lipídico, tireoide, vitamina D — dado de saúde, sensível por LGPD art. 11.

A rota irmã `lab-exam-protocol` já fazia certo, exigindo vínculo vivo via `canCoachStudent`. As três divergentes agora seguem o mesmo padrão:

- [ai/lab-exam-extract/route.ts](src/app/api/ai/lab-exam-extract/route.ts) — leitura dos marcadores
- [lab-exams/[id]/route.ts](src/app/api/lab-exams/[id]/route.ts) — exclusão
- [lab-exams/signed-upload/route.ts](src/app/api/lab-exams/signed-upload/route.ts) — anexar arquivo

### [MÉDIO] Professor lia assinatura de qualquer usuário

[admin/vip/batch-status](src/app/api/admin/vip/batch-status/route.ts) aceita o papel `teacher` e recebia até 200 UUIDs no corpo, usando-os direto no filtro sem checar vínculo nenhum. Um professor legítimo podia mandar UUIDs colhidos no feed social e receber plano, status, origem e data de expiração da assinatura de **qualquer usuário — inclusive de outros professores**.

Agora o professor só recebe dados dos próprios alunos (mais ele mesmo); admin segue vendo todos. A tela do professor já passava só os alunos dele, então nada muda na interface.

### [BAIXO] Comentários de story morta continuavam legíveis

O `GET` de [social/stories/comments](src/app/api/social/stories/comments/route.ts) lia com service-role e não repetia o filtro `is_deleted`/`expires_at` que a RLS aplica — e, quando a story não existia, caía num fail-open (`if (authorId && ...)`) que pulava a checagem de seguidor. Agora responde 404 para story ausente, apagada ou expirada, espelhando a rota de mídia.

### [BAIXO] Aluno comum na superfície do professor

[teacher/service-plans](src/app/api/teacher/service-plans/route.ts) (GET e POST) verificava só "está logado", enquanto as outras 24 rotas de `/api/teacher` — incluindo `service-plans/[id]`, que mexe na mesma tabela — exigem papel de professor. Não vazava dado de terceiro (tudo era escopado ao próprio id), mas deixava um aluno criar plano de serviço. Agora exige `requireRole(['teacher','admin'])`.

---

## Aberto, de baixo impacto

**Enumeração de contas em [access-request/create](src/app/api/access-request/create/route.ts:68).** As mensagens distinguem "já pendente", "já aprovada" e "já cadastrado", então dá para descobrir se um e-mail tem conta. Não corrigi porque unificar as mensagens muda a experiência de cadastro — decisão de produto, não técnica.

**O middleware não impõe autenticação.** [updateSession](src/utils/supabase/middleware.ts) só refresca o cookie e nunca redireciona para login. Toda proteção depende de cada rota lembrar de checar — foi a causa-raiz dos IDORs de junho. Hoje as rotas checam (varri todas), mas o modelo continua sendo "erre uma vez e vaza". Um gating central com allowlist de rotas públicas seria defesa em profundidade; é refatoração de risco alto em produção e fica como recomendação.

---

## O que verifiquei e está sólido

Registro aqui para não ser reinvestigado.

**Banco.** As 95 tabelas têm RLS ativa. Nenhuma tabela com dado pessoal tem policy permissiva para `anon` ou `authenticated` — as únicas `USING(true)` são catálogos globais (`exercise_library`, `foods_taco`, `foods_off_cache`, `exercise_substitutions`) ou restritas a `service_role`. Conferi caso a caso `access_requests`, `admin_emails`, `teachers` e `device_push_tokens`, que num rastreio superficial pareciam abertas e não estão: o `GRANT` existe, mas não há policy de SELECT para o usuário, então a RLS nega. `phone_verifications` tem RLS sem policy, ou seja, nega tudo — o alerta do Supabase é informativo.

**RPCs.** Das 32 funções `SECURITY DEFINER` chamáveis por `anon`/`authenticated`, li o corpo de todas as que aceitam id de terceiro. Todas guardam corretamente: `get_dashboard_bootstrap` e `get_user_conversations` rejeitam id diferente do chamador, `verify_recovery_code_admin` e `dedupe_direct_channels` exigem service-role/admin, `get_or_create_direct_channel` exige que o chamador seja um dos dois lados, `admin_get_vip_stats` exige admin ou professor.

**Storage.** Os 5 buckets privados (`lab-exams`, `body-photos`, `bioimpedance-files`, `execution-videos`, `social-stories`) têm policy de owner por prefixo em `storage.objects`, e `execution-videos` ainda valida o vínculo professor-aluno. Leitura sempre por URL assinada de curta duração.

**Realtime.** As 6 tabelas replicadas (`direct_messages`, `profiles`, `notifications`, `social_follows`, `social_stories`, `active_workout_sessions`) têm RLS ativa, que o Realtime aplica por assinante.

**Rotas.** As 246 foram lidas: 46 de admin, 27 de IA, 25 de professor, 20 sociais, 16 crons, 12 VIP e as demais. Webhooks (RevenueCat, Mercado Pago, Asaas) validam assinatura ou segredo em tempo constante antes de tocar o banco, e o do Mercado Pago rebusca o pagamento na API em vez de confiar no corpo. Os 16 crons exigem `CRON_SECRET` e falham fechado quando a variável não está setada.

**Páginas e server actions.** `/relatorio/[userId]`, que em junho abria dado de saúde para anônimo, hoje exige login e ownership antes de qualquer consulta. As server actions de admin passam por `checkAdmin()`; as demais rodam sob RLS.

---

## Como validar

```bash
npx vitest run src/app/api/__tests__/healthDataAccessGuards.test.ts
```

Estado da verificação: TypeScript sem erros, ESLint limpo nas 6 rotas alteradas, suíte completa em 302 arquivos e 3.293 testes passando.
