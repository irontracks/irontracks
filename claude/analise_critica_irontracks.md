# Análise Crítica — IronTracks
**Data:** Fevereiro 2026  
**Base:** Estrutura de arquivos, schema, middleware, layout, feature flags, sistema VIP, tipos e checklist funcional

---

## Revalidação (Repo atual)

Esta análise foi revalidada contra o codebase atual e alguns pontos do texto original estavam desatualizados.

### O que continua verdadeiro (confirmado)
- Há mistura de JS e TS em módulos importantes (ex.: actions e componentes legados), o que aumenta custo de refatoração.
- O `schema_full_restore.sql` está incompleto (tem poucas tabelas) e não representa o banco real do produto.
- A rota de login OAuth tem lógica de origem/redirect mais complexa do que o ideal.
- Cobertura de testes automatizados é baixa em áreas críticas (VIP/billing/auth/offline).

### O que estava desatualizado (corrigido aqui)
- Não há “dezenas de arquivos ` 2`, ` 3`” espalhados no `src/` no estado atual; existe pelo menos um caso de wrapper canônico (`StudentDashboard` → `StudentDashboard3`), mas não a proliferação descrita.
- Não existem múltiplos `sw 2.js…sw 6.js` em `/public/`; há somente `sw.js`.
- APIs de IA têm rate limiting visível (por IP), via utilitário dedicado.
- Existem migrations no repositório (`/supabase/migrations/`).
- Billing/VIP hoje prioriza `user_entitlements` (tabela unificada), com fallback; não é mais “duas tabelas em cascata” como descrito.
- `AdminPanelV2` e `ActiveWorkout` têm versões TSX no repo; arquivos `.js` podem existir como compatibilidade/import shim.

## Diagnóstico Geral

O IronTracks é um produto com uma proposta de valor sólida e um escopo ambicioso — treino, social, IA, nutrição, avaliação física, monetização. Mas o código acumulou sinais claros de crescimento rápido sem fases de consolidação: duplicação de arquivos, inconsistência de linguagem (JS e TS misturados sem critério), schema desatualizado, feature flags que nunca foram limpas, e módulos que foram reescritos mas as versões antigas nunca foram removidas. O produto funciona, mas está carregando dívida técnica crescente que vai encarecer cada nova feature.

---

## 1. Dívida Técnica Estrutural

### Proliferação de arquivos duplicados
No codebase atual, não há evidência de “dezenas” de arquivos com sufixo ` 2`/` 3` dentro de `src/`. Existe pelo menos um padrão de wrapper canônico, onde um arquivo “estável” reexporta a versão final (ex.: `StudentDashboard.tsx` reexporta `StudentDashboard3.tsx`). Isso é aceitável como transição, mas precisa de governança para não virar padrão permanente.

**Risco real:** wrappers/shims sem política clara (e.g. reexports para manter imports antigos) podem gerar confusão e até loops de import se não apontarem explicitamente para o arquivo canônico.

**Impacto:** Alto (confusão, risco de bug, custo de manutenção)  
**Esforço para resolver:** Baixo/Médio — auditoria rápida + remoção/renomeação segura dos casos reais

### Mistura de JS e TypeScript sem critério
O projeto usa `.tsx`/`.ts` nas partes novas e `.js` nas antigas, mas a fronteira não é limpa:

- `featureFlags.js` — arquivo central sem tipos
- `workout-actions.js` — actions sem tipagem
- `chat-actions.js` — idem
- `HistoryList.js` — componente grande e central ainda em JS
- `AdminPanelV2` e `ActiveWorkout` existem em TSX; arquivos `.js` podem existir como shim de compatibilidade/import.

O problema não é só estética: a mistura dificulta refatoração e amplia “zonas sem tipos” em lugares onde bugs são caros (treino ativo, histórico, billing e flows de admin).

**Impacto:** Alto (bugs silenciosos, sem autocompletar, refatoração difícil)  
**Esforço para resolver:** Alto — migração progressiva com plano de prioridade

### Schema desatualizado e incompleto
O `schema_full_restore.sql` tem apenas 6 tabelas básicas (profiles, assessments, photos, messages, invites, team_sessions), mas o código referencia claramente muitas outras:

- `vip_usage_daily` (usada em `limits.ts`)
- `app_subscriptions`, `marketplace_subscriptions` (sistema de billing)
- `app_plans` (planos e limites VIP)
- `workout_checkins` (feature nova documentada no checklist)
- `stories`, `follows`, tabelas de notificação, etc.

O schema no repositório não reflete o banco real. Isso é perigoso: qualquer desenvolvedor novo que clonar o projeto e tentar rodar localmente pode ter um banco diferente do produção. Migrations devem ser a fonte de verdade — e elas existem no repo — mas o “restore” precisa ser alinhado para não enganar.

**Impacto:** Crítico para onboarding e para debugging  
**Esforço para resolver:** Médio — exportar schema completo (ou gerar a partir das migrations) e garantir que `schema_full_restore.sql` reflita a realidade

---

## 2. Autenticação e Controle de Acesso

### Lógica de origem do OAuth excessivamente complexa
O fluxo de redirect OAuth considera headers (`x-forwarded-*`) e variáveis de ambiente (ex.: `IRONTRACKS_PUBLIC_ORIGIN`) para determinar o origin/redirect de forma defensiva. Isso costuma ser sinal de problemas históricos de ambiente (Vercel/CDN/Capacitor) e merece simplificação para reduzir “login loop” e inconsistência.

O problema raiz é que o callback de OAuth depende de headers que podem variar entre Vercel, CDN e Capacitor. A solução robusta é fixar o `redirectTo` via variável de ambiente em vez de tentar inferir o origin dinamicamente.

**Impacto:** Alto (login loop já aconteceu, pode reaparecer)  
**Ação recomendada:** Simplificar para `process.env.NEXT_PUBLIC_APP_URL + '/auth/callback'` com fallback claro

### Aprovação de aluno como campo booleano simples
O gate de aprovação hoje não depende apenas de boolean: além de `is_approved`, também considera `approval_status`. Mesmo assim, ainda falta trilha de auditoria consistente (quem aprovou, quando, motivo de rejeição/suspensão).

**Ação recomendada:** Migrar para `status: 'pending' | 'approved' | 'rejected' | 'suspended'` com `approved_at` e `approved_by`

### Ausência de rate limiting visível nas APIs de IA
Os endpoints de IA têm rate limiting visível por IP (via utilitário dedicado). Isso reduz abuso, mas ainda vale revisar se a política cobre bem: usuários não autenticados, ataques distribuídos, e interação com as cotas VIP (ex.: `vip_usage_daily`).

---

## 3. Monetização e Sistema VIP

### Dois caminhos de cobrança sem unificação
O sistema VIP hoje prioriza uma tabela de entitlements (`user_entitlements`) e usa fallback para assinaturas de app (`app_subscriptions`). A recomendação de unificação continua válida como princípio, mas a base de “entitlements” já existe — o foco agora é garantir que todas as fontes de cobrança atualizem essa tabela de forma auditável.

Além disso, o fallback para `FREE_LIMITS` acontece silenciosamente se nenhuma assinatura for encontrada — sem log, sem alerta. Se houver bug no lookup do Supabase, o aluno paga e fica no free sem saber.

**Ação recomendada:** Unificar status de assinatura em uma tabela de `user_entitlements` atualizada por webhook dos dois gateways, com log de mudanças

### Feature flags nunca evoluem para remoção
O sistema de feature flags no repo atual tem menos flags do que o texto original descrevia e já inclui metadados de owner/revisão. Mesmo assim, a recomendação continua: flags precisam de ciclo de vida (data de revisão, owner, e remoção quando estabiliza).

O problema é que flags que não têm data de expiração e dono definido ficam para sempre. Com o tempo, o código fica cheio de `if (isFeatureEnabled(...))` sem que ninguém saiba se a feature já é estável ou ainda experimental. O `featuresKillSwitch` global existe mas é um sinal de alarmismo, não de controle.

**Ação recomendada:** Cada flag deve ter um owner e uma data de revisão. Flags de features já estáveis (`storiesV2` parece maduro) devem ser removidas e o comportamento tornado padrão.

### Limites VIP inconsistentes no free tier
`chat_daily: 0` e `wizard_weekly: 0` no FREE_LIMITS significa que usuários free não têm acesso algum ao chat com IA e ao wizard. Mas `insights_weekly: 1` dá 1 insight semanal. Essa inconsistência pode confundir usuários sobre o que está incluído no free. Se a intenção é "freemium", dar uma amostra real de cada feature (ex: 3 mensagens/dia, 1 wizard/mês) converte melhor do que bloquear completamente.

---

## 4. Arquitetura de Componentes

### Componentes grandes sem divisão clara de responsabilidade
`AdminPanelV2.js` é descrito no checklist como tendo abas, subabas, inbox, check-ins por aluno, alertas, relatórios. Provavelmente tem centenas de linhas e mistura fetching, lógica de negócio e renderização. Isso dificulta testes, dificulta reutilização e cria gargalo quando múltiplas features precisam mudar o mesmo arquivo.

O mesmo vale para `ActiveWorkout.js` — o componente mais crítico do app (é onde o usuário passa mais tempo) ainda é `.js` sem tipos e provavelmente concentra toda a lógica de treino ativo.

**Ação recomendada:** Extrair lógica de fetching para hooks (`useAdminStudents`, `useCheckinAlerts`), lógica de negócio para utils, e quebrar a UI em subcomponentes testáveis.

### Contextos subutilizados
O projeto tem apenas 3 contextos: `DialogContext`, `InAppNotificationsContext`, `TeamWorkoutContext`. Para um app desse tamanho, é provável que estado que deveria ser global esteja sendo passado via prop drilling ou repetido em múltiplos componentes (ex: dados do perfil do usuário atual, VIP tier, configurações do usuário).

### `_legacy_backup` e `_macro_mixer_orig` no repositório
Pastas de backup não devem existir no Git — para isso existe o histórico de commits. A presença dessas pastas indica que a equipe não está confiante no Git como rede de segurança, o que pode significar que o workflow de branches/commits precisa de atenção.

---

## 5. Offline e PWA

### Múltiplas versões do Service Worker
No repo atual, há somente `sw.js` em `/public/`. Ainda assim, Service Worker é uma área sensível (cache stale), então vale manter um checklist explícito de deploy/atualização e evitar múltiplas variantes de SW no mesmo repositório.

### `offlineSyncV2` ainda é feature flag
A feature de sync offline existe há tempo suficiente para ter gerado uma V2, mas ainda está atrás de flag. Isso sugere que ou a feature tem bugs conhecidos que impedem ativação por padrão, ou ninguém assumiu responsabilidade de estabilizá-la. O risco de sync offline com bugs silenciosos é alto — dados de treino podem ser perdidos sem o usuário perceber.

---

## 6. Qualidade e Testes

### Cobertura de testes muito baixa
Os únicos testes visíveis são:
- `AssessmentForm.test.tsx`
- `mediaUtils.test.ts`
- `VideoCompositor.test.ts`
- `workoutReorder.test.js`
- `rls_workouts_silos_check.sql` (único teste de RLS)

Para um app com billing, dados de saúde, lógica de permissão por role e sync offline, isso é insuficiente. As partes mais críticas — VIP limits, workout actions, auth flow, offline sync — não têm testes automatizados visíveis. O `CHECKLIST_FUNCIONAL.md` é um checklist manual, o que significa que regressões só são descobertas se alguém executar o checklist após cada deploy.

**Ação recomendada:** Priorizar testes nas camadas de maior risco: VIP access checks, billing webhooks, auth callbacks, workout save/sync.

### `login_loop_debug_report.json` na raiz
No estado atual do repo, não há evidência desse arquivo na raiz. A recomendação permanece: artefatos de debug não devem ser commitados no repositório principal.

---

## 7. Oportunidades de Produto

Além dos problemas técnicos, há algumas oportunidades claras de produto que emergem da análise:

**Onboarding do aluno é um ponto cego.** Há um `GuidedTour` com 3 versões mas nenhuma indicação clara de que existe um fluxo de onboarding estruturado. Alunos que chegam via convite do professor provavelmente ficam perdidos na primeira sessão.

**A IA não está integrada no fluxo ativo de treino.** Os endpoints de IA (coach chat, insights, wizard) são features separadas — mas o momento de maior engajamento é durante o treino ativo. Sugestões de carga, alerta de RPE alto, ou ajuste de descanso em tempo real seriam diferenciais fortes.

**Nutrição está subdesenvolvida.** Existe um `NutritionMixer`, `chef_ai` como feature VIP, e `kcalClient`, mas parece fragmentado. Se a proposta é ser a plataforma completa de acompanhamento, nutrição precisa ter a mesma profundidade que treino.

**Relatórios de evolução para o professor.** O professor tem acesso ao `AdminPanelV2` e pode ver check-ins, mas não há evidência de um dashboard consolidado de evolução da turma — métricas agregadas, alunos em risco, ranking de consistência. Isso seria um diferencial forte para a retenção do professor na plataforma.

---

## Resumo de Prioridades

| Prioridade | Item | Impacto | Esforço |
|---|---|---|---|
| 🔴 Crítico | Alinhar `schema_full_restore.sql` com migrations/banco real | Alto | Médio |
| 🔴 Crítico | Simplificar e estabilizar OAuth redirect/origin | Alto | Baixo/Médio |
| 🟠 Alto | Migrar áreas críticas JS → TS (actions + HistoryList) | Alto | Alto |
| 🟠 Alto | Entitlements: garantir atualização via webhooks + auditoria | Alto | Médio |
| 🟠 Alto | Testes automatizados para VIP, billing e auth | Alto | Médio |
| 🟡 Médio | Refatorar AdminPanelV2 e ActiveWorkout | Médio | Alto |
| 🟡 Médio | Política de lifecycle para feature flags | Médio | Baixo |
| 🟡 Médio | Aprovação de aluno com audit trail | Médio | Baixo |
| 🟢 Produto | Onboarding estruturado do aluno | Alto | Médio |
| 🟢 Produto | IA integrada no treino ativo | Alto | Alto |
| 🟢 Produto | Dashboard de evolução da turma (professor) | Alto | Médio |

---

## Checklist Atualizada (para “ficar 100%”)

### Já corrigido recentemente (build/estabilidade)
- [x] Build sem erro de import para `ActiveWorkout` (`.js` shim aponta para TSX)
- [x] Build sem erro de import para `AdminPanelV2` (`.js` shim aponta para TSX)
- [x] Remoção de loop de import (shim apontando explicitamente para `.tsx`)
- [x] `AdminPanelV2.tsx` tipado e compilando sem erros de TypeScript

### Próximas ações técnicas (prioridade)
- [ ] Gerar/exportar um schema “fonte da verdade” (migrations → schema) e atualizar `schema_full_restore.sql`
- [ ] Revisar e simplificar o cálculo de origin/redirect do OAuth com variável de ambiente canônica
- [ ] Definir política de lifecycle para feature flags (owner + data + remoção ao estabilizar)
- [ ] Migrar `HistoryList.js` e actions críticas (`workout-actions.js`, `chat-actions.js`) para TS de forma incremental
- [ ] Criar testes mínimos para: VIP entitlement, auth callback e fluxo de assinatura
