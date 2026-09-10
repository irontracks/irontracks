<!-- Movido do CLAUDE.md em 10/09/2026 pelo /enxugar.
     Motivo: era changelog. As regras VIVAS ficaram no CLAUDE.md; aqui está o registro completo. -->

## Auditoria 2026-08-13 — fechada em 14/08/2026 (PRs #805–#819)

O relatório vive em `Relatorio/auditoria-ponta-a-ponta-2026-08-13.md`; a
conferência achado-a-achado e as correções são a sessão de 14/08. **Fase 1
completa + Fase 2 parcial.** Mapa do que subiu, para ninguém reinvestigar:

| Achado | PR | Estado |
|---|---|---|
| SEC-06 bucket chat-media | #805 | rota `ensure-bucket` REMOVIDA (não tinha chamador) |
| SEC-01 XSS relatório | #806 | escape na atribuição + guard 5 payloads × 5 campos |
| SEC-02 delete sem conferir Auth | #807 | `deleteUser` verificado + `account_deleted`/`_delete_auth_failed` em audit_events |
| SEC-03 catálogo LGPD | #808 | `lib/account/userDataCatalog.ts` dirige export E delete (ver abaixo) |
| SEC-05 erro cru em resposta | #809 | `respondInternalError` (requestId) em 111 rotas + guard classe inteira — ⚠️ **reaberto e fechado em 01/09/2026**, ver abaixo |
| SEC-04 SECURITY DEFINER | #811 | migrations APLICADAS `20260814095015/31`; advisors 41→16 WARN |
| SEC-07/10/11 | #812 | connect-src + rate limit auto-reportável + npm audit 0 |
| Mapa muscular VIP quebrado | #813 | `maxItems` aninhado estourava o Gemini (400 desde 10/08) |
| SEC-08 guarda de origem | #814 | middleware, MODO RELATÓRIO (ver abaixo) |
| Xcode Cloud sempre vermelho | #815–#819 | verde no run #1732 (ver abaixo) |

⚠️ **O guard SEC-05 era de FORMA e deixou passar a CLASSE (01/09/2026).** Ele
procurava só `getErrorMessage(` na resposta; a auditoria achou **52 rotas**
devolvendo a mesma coisa por outras sintaxes — `e.message`, `String(e)`,
`const message = e instanceof Error ? e.message : String(e)` seguido de
`error: message`, `jsonError(400, dbErr.message)`, `signErr?.message || '…'`.
Rotas de usuário comum entre elas (`vip/chat`, `social/feed`, `rest/fire`,
`nutrition/log-entry`), e uma pública (`auth/apple/preflight`, mensagem do
Supabase num 400). Hoje o guard casa `.message` lido de QUALQUER variável de
erro e `String(<erro>)`, e a janela é a chamada com parêntese balanceado — a
janela fixa de 300 caracteres atravessava para o código seguinte e acusou um
`String(error.message).includes('duplicate')` de condição. A primeira versão
ampliada casava `.message` solto e acusou 69 rotas que devolvem `{ message }`
no payload (jeito nº 8). Padrão para erro de BANCO/STORAGE em 400:
`respondDbError(key, err)`; para o catch-all: `respondInternalError(key, e)`.

**Duas janelas de observação ABERTAS — flags prontas, faltando só ligar:**
1. ~~**CSP**~~ — **LIGADO em 27/08/2026**, com a polaridade invertida. Detalhes
   na seção do middleware, que é onde este assunto mora.
2. ~~**Guarda de origem (SEC-08)**~~ — **BLOQUEIA desde 01/09/2026**, com a
   polaridade invertida como no CSP: o default é enforce e
   `ORIGIN_GUARD_ENFORCE=false` na Vercel é o freio (env var, sem deploy). A
   janela de relatório ficou 30+ dias com ZERO mismatches em `audit_events` e
   ninguém virou a chave — com o default no lado seguro, o esquecimento
   protege. Regra em `originGuardEnforcedFrom`; bearer/webhook/cron passam
   SEMPRE. Função pura em `utils/security/originGuard.ts`.

   ⚠️ **A janela NÃO EXISTIA até 29/08/2026, e esta nota prometia lê-la.** O
   relato era só `console.error('[origin-guard]', …)`, ou seja runtime log da
   Vercel — cuja retenção não passa de ~1 dia: buscar 7 dias responde que o
   intervalo excede a retenção e 24 h volta vazio. `audit_events` não tinha
   NENHUMA linha de origin. Ficaram 15 dias em modo relatório sem nada
   observável, exatamente a lição que o CSP já tinha aprendido duas seções
   acima (log expira e fica ilegível de onde se investiga; o banco não).

   Hoje o mismatch também vai para `audit_events` via
   `utils/security/originReport.ts` — dedupe por (tipo, origem, ROTA), teto de
   10 linhas por instância, `waitUntil` para a instância não ser congelada
   antes do envio, e **silêncio deliberado em toda falha**: isto roda no
   middleware, e um throw ali vira 500 no site inteiro (com o app nativo
   carregando o front deste servidor, levaria todos os aparelhos junto). A
   escrita sai do middleware e não de uma rota — no CSP a rota existe porque
   quem reporta é o NAVEGADOR; aqui quem detecta é o próprio servidor.

   ```sql
   select metadata->>'kind' as tipo, metadata->>'originHost' as origem,
          metadata->>'path' as rota, count(*) as n, max(created_at) as ultimo
   from audit_events where action = 'origin_guard_mismatch'
   group by 1,2,3 order by 4 desc;
   ```

   **Espere alguns dias de tráfego real antes de decidir** — a tabela começou
   vazia em 29/08.

**Catálogo LGPD (`lib/account/userDataCatalog.ts`) — ler ANTES de mexer em
export/delete de conta.** Fatos medidos que ele carrega: a maioria das
tabelas CASCATEIA no `deleteUser`; `error_reports` é ON DELETE RESTRICT (sem
o delete manual dela, a exclusão de quem já reportou erro FALHA — foi bug
vivo); storage nunca cascateia; tabela nova sem decisão no catálogo reprova
no guard — o vermelho é o pedido de decisão.

⚠️ **Esse "reprova" depende de uma FOTO, e a foto envelhece (22/08/2026).** O
guard compara o catálogo com `PROD_TABLES_SNAPSHOT`, uma lista fixa no arquivo
de teste — ele não pergunta nada ao banco. Entre 14/08 e 22/08 passaram SEIS
tabelas sem decisão nenhuma: as quatro do treino em equipe (#859) e as duas do
import de ficha por foto (#881, que guarda IMAGEM do usuário), mais o bucket
`workout-imports`. Todas cascateiam, então o delete nunca esteve quebrado — mas
o EXPORT LGPD ignorava esses dados, porque a rota itera o catálogo. **Migration
nova = re-rodar o SQL do cabeçalho do catálogo e comparar com o snapshot**, na
mesma tarefa.

**Xcode Cloud — o workflow 'App | Default' (push na main, só Archive) ficou
verde depois de 4 bloqueios em cadeia**, todos diagnosticados pela ASC API
(a chave do repo lê builds/issues — não precisa do painel web):
`ios/App/ci_scripts/ci_post_clone.sh` instala Node + `npm ci`, desliga as
defaults `IDEPackage*` (o originHash do Package.resolved VARIA entre
toolchains — lockfile commitado nunca satisfaz o runner) e roda o
`patch-ios.mjs` com `env -u CI` — o patch SE PULA quando `CI` está setado
(guarda para a Vercel) e o Xcode Cloud seta `CI=TRUE`. Guard:
`src/__tests__/xcodeCloudCiScript.test.ts`.

**Pendências com dono definido:** FCM sem env vars na Vercel → push Android
mudo desde 24/07. ⚠️ **Medido em 29/08/2026: não é urgente** — não há usuário
Android real (a conta da medição está na seção do funil). As 3 chaves seguem
fora do repo: service account do Firebase, só o dono gera. Restante da auditoria não
atacado: ~~ATS iOS (SEC-09)~~ — fechado em 01/09/2026 (1.21.2 build 81) —, E2E/SAST no CI,
sprint de performance (PERF-01…08), `pg_trgm` fora do schema public.
