# Mapa de cobertura — auditorias e testes

**Levantado em:** 28/07/2026 · **Base:** 246 rotas de API, 40 páginas, 291 arquivos de teste unit, 44 specs e2e.

Este documento existe para **não re-levantar isto a cada sessão**. Ao fechar uma
lacuna, atualize a linha correspondente em vez de refazer a varredura.

## Método (e os limites dele)

"Sem cobertura" = o path da rota / o símbolo do módulo **não aparece em nenhum
teste unit nem e2e**. É um proxy para ranquear risco:

- **falso positivo:** a rota pode ser exercitada indiretamente por outro teste;
- **falso negativo:** aparecer num teste não prova cobertura de comportamento.

Comandos de re-varredura ficam no fim do arquivo.

---

## 1. Auditorias

| Documento | Data | Situação |
|---|---|---|
| `A11Y_AUDIT.md` | 13/05/2026 | Desatualizado — anterior a autoload e Live Activity |
| `MOBILE_AUDIT.md` | 13/05/2026 | Desatualizado |
| `PERF_AUDIT.md` | 13/05/2026 | Desatualizado |
| `REACT_AUDIT.md` | 13/05/2026 | Desatualizado |
| `UXUI_AUDIT.md` | 13/05/2026 | Desatualizado |
| `LATENT_BUGS.md` | 14/05/2026 | Desatualizado |
| `SECURITY_AUDIT_2026-06-27.md` | 27/06/2026 | Vigente |
| `PRODUCT_GAPS_2026-07-22.md` | 22/07/2026 | Vigente |

### Domínios que nunca tiveram auditoria dedicada

| Domínio | Risco |
|---|---|
| **Billing ponta a ponta** | 3 gateways vivos (RevenueCat/Apple, Mercado Pago, Asaas). Reconciliação, refund, downgrade e recorrência do professor nunca auditados |
| **Crons / jobs** | 16 crons disparam push, cobrança e suspensão de plano sozinhos. Falha silenciosa é o modo padrão |
| **LGPD / dado sensível** | `account/delete`, `account/export`, fotos corporais, exames laboratoriais, mídia de chat — dado de saúde sem varredura de retenção/expurgo |
| **Professor + marketplace** | 30 rotas movimentando dinheiro entre professor e aluno |
| **Painel admin** | 46 rotas, incluindo `workouts/delete-any` e `vip/revoke` (destrutivas sobre dado de terceiro) |
| **Offline / sync** | `offlineSync` + IDB decidem o que sobrevive a um app morto |
| **Integridade do histórico** | Sessões em `workouts.notes` (JSON) + backfills manuais já rodados, sem auditoria de consistência |

---

## 2. Testes — lacunas medidas

### APIs: 67 de 246 rotas (27%) sem menção

| Área | Sem cobertura | Rotas mais sensíveis |
|---|---|---|
| admin | 15 / 46 | `workouts/delete-any`, `workouts/delete`, `vip/revoke` |
| cron | 6 / 16 | ~~`teacher-plan-suspend`~~ ✅, `teacher-plan-expiring`, `purge-soft-delete-bin`, `admin-vip-expiring`, `whatsapp-reactivation`, `clean-live-activity-tokens` |
| professor / marketplace / aluno | 9 / 30 | `teachers/checkout`, `checkout-recurring`, `cancel-recurring`, `student/charge` |
| pagamento | 2 | ~~`marketplace/webhooks/asaas`~~ ✅, `billing/webhooks/mercadopago` |
| privacidade | 2 | `account/delete`, `account/export` |
| descanso / push | 5 | `rest/fire`, `rest/schedule-push`, `rest/cancel-push`, `push/register` |

Lista completa: reproduzível pelo script no fim do arquivo.

### Páginas sem spec e2e

`/onboarding`, `/relatorio/[userId]`, `/terms` (zero menções) · `/dashboard/edit` (citada de passagem em 1 spec).

As demais views do dashboard são SPA por estado (`view`), cobertas por specs
temáticos — a busca por URL não as detecta.

### Lógica grande com cobertura zero

| Arquivo | Linhas | Por que importa |
|---|---|---|
| `src/actions/admin-actions.ts` | 767 | Ações administrativas sobre dado de terceiro |
| `src/hooks/useWorkoutFetch.ts` | 671 | Hidrata a lista de treinos no boot — caminho de todo usuário |
| `src/utils/report/generatePdf.ts` | 541 | Gerador do PDF compartilhável |
| `src/utils/workoutWizardGenerator.ts` | 515 | Geração de treino pelo wizard |

---

## 3. Fechado nesta rodada (28/07/2026)

| Superfície | Guard | Casos |
|---|---|---|
| **Todos os 16 crons** | `src/app/api/cron/__tests__/cronAuthGuard.test.ts` — source-guard de classe: todo cron chama `isCronAuthorized` **antes** de `createAdminClient`, responde 403 e não aceita segredo por query string | 51 |
| **`cron/teacher-plan-suspend`** | `.../teacher-plan-suspend/__tests__/teacherPlanSuspend.test.ts` — carência de 3 dias, filtro de plano pago/ativo, idempotência, sem notificação quando o UPDATE falha | 10 |
| **`marketplace/webhooks/asaas`** | `.../asaas/__tests__/asaasWebhook.test.ts` — fail-closed sem segredo, 401/429, dedup por `23505`, evento sem id, mapeamento status→assinatura, estorno/chargeback nunca ativam | 19 |

Os três foram provados vermelhos com o defeito presente antes de entrar
(cron sem auth; `GRACE_DAYS = 0`; `REFUNDED → active`).

---

## 4. Nota de documentação

O `CLAUDE.md` descreve **Treino em Dupla V2** (`contexts/team/*`,
`normalizeParticipant`, tabelas `team_sessions`…) como feature ativa. Ela foi
**aposentada** no commit `5bc010c7` (~4,6k linhas removidas, banco intacto) e
`src/contexts/team/` não existe mais.

---

## Re-varredura

```bash
# rotas de API sem menção em teste
find src/app/api -name route.ts | wc -l
```

Para o cruzamento completo (rotas × corpus de testes, páginas × e2e, módulos
grandes sem teste), o script usado está descrito aqui em prosa de propósito: ele
é uma consulta pontual, e mantê-lo no repo criaria mais um artefato para
envelhecer. Reproduza comparando `find src/app/api -name route.ts` contra o
conteúdo de `e2e/*.spec.ts` + `src/**/__tests__/*.test.ts*`.
