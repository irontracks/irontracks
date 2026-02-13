# Análise Crítica — IronTracks
**Data:** Fevereiro 2026  
**Base:** Estrutura de arquivos, schema, middleware, layout, feature flags, sistema VIP, tipos e checklist funcional

---

## Diagnóstico Geral

O IronTracks é um produto com uma proposta de valor sólida e um escopo ambicioso — treino, social, IA, nutrição, avaliação física, monetização. Mas o código acumulou sinais claros de crescimento rápido sem fases de consolidação: duplicação de arquivos, inconsistência de linguagem (JS e TS misturados sem critério), schema desatualizado, feature flags que nunca foram limpas, e módulos que foram reescritos mas as versões antigas nunca foram removidas. O produto funciona, mas está carregando dívida técnica crescente que vai encarecer cada nova feature.

---

## 1. Dívida Técnica Estrutural

### Proliferação de arquivos duplicados
Este é o problema mais visível e o mais fácil de resolver. O projeto tem dezenas de arquivos com sufixo ` 2`, ` 3` espalhados por toda a codebase:

- `StudentDashboard.tsx`, `StudentDashboard 2.tsx`, `StudentDashboard 3.tsx`, `StudentDashboard3.tsx`
- `route.ts`, `route 2.ts` dentro dos mesmos diretórios de auth
- `GuidedTour.js`, `GuidedTour 2.js`, `GuidedTour 3.js`
- `offlineSync.js`, `offlineSync 3.js`
- `middleware.ts` (na raiz), `middleware 2.ts`, `middleware 3.ts` dentro de `/supabase/`

O `StudentDashboard.tsx` atual é literalmente só `export { default } from './StudentDashboard3'` — a versão 3 virou canônica mas as versões 1 e 2 continuam existindo no repositório. Isso cria confusão para qualquer novo colaborador, polui buscas por arquivo, e aumenta risco de alguém editar a versão errada.

**Impacto:** Alto (confusão, risco de bug, custo de manutenção)  
**Esforço para resolver:** Médio — uma sessão de limpeza + PR de remoção

### Mistura de JS e TypeScript sem critério
O projeto usa `.tsx`/`.ts` nas partes novas e `.js` nas antigas, mas a fronteira não é limpa:

- `featureFlags.js` — arquivo central sem tipos
- `workout-actions.js` — actions sem tipagem
- `chat-actions.js` — idem
- `AdminPanelV2.js` — componente complexo sem tipos
- `ActiveWorkout.js` — componente crítico do fluxo principal, sem tipos

Componentes antigos e centrais como `ActiveWorkout`, `AdminPanelV2` e `HistoryList` ainda são `.js`, enquanto arquivos periféricos já são `.ts`. A inconsistência não é só estética — ela impede que o TypeScript proteja as partes mais críticas do app.

**Impacto:** Alto (bugs silenciosos, sem autocompletar, refatoração difícil)  
**Esforço para resolver:** Alto — migração progressiva com plano de prioridade

### Schema desatualizado e incompleto
O `schema_full_restore.sql` tem apenas 6 tabelas básicas (profiles, assessments, photos, messages, invites, team_sessions), mas o código referencia claramente muitas outras:

- `vip_usage_daily` (usada em `limits.ts`)
- `app_subscriptions`, `marketplace_subscriptions` (sistema de billing)
- `app_plans` (planos e limites VIP)
- `workout_checkins` (feature nova documentada no checklist)
- `stories`, `follows`, tabelas de notificação, etc.

O schema no repositório não reflete o banco real. Isso é perigoso: qualquer desenvolvedor novo que clonar o projeto e tentar rodar localmente vai ter um banco diferente do produção. Migrations devem ser a fonte de verdade — e o `/supabase/migrations/` existe mas não foi compartilhado.

**Impacto:** Crítico para onboarding e para debugging  
**Esforço para resolver:** Médio — exportar schema completo e commitar migrations

---

## 2. Autenticação e Controle de Acesso

### Lógica de origem do OAuth excessivamente complexa
O arquivo `auth/login/route.ts` tem ~70 linhas só para calcular o `safeOrigin` do redirect OAuth. Considera `x-forwarded-host`, `x-forwarded-proto`, variável de ambiente `IRONTRACKS_PUBLIC_ORIGIN`, `NODE_ENV`, e faz múltiplas tentativas com try/catch silencioso. Isso indica que o problema de redirect já causou bugs em produção (o `login_loop_debug_report.json` na raiz confirma isso).

O problema raiz é que o callback de OAuth depende de headers que podem variar entre Vercel, CDN e Capacitor. A solução robusta é fixar o `redirectTo` via variável de ambiente em vez de tentar inferir o origin dinamicamente.

**Impacto:** Alto (login loop já aconteceu, pode reaparecer)  
**Ação recomendada:** Simplificar para `process.env.NEXT_PUBLIC_APP_URL + '/auth/callback'` com fallback claro

### Aprovação de aluno como campo booleano simples
O `layout.tsx` faz `profile.is_approved !== true` para bloquear alunos não aprovados. Isso funciona, mas é frágil: não há timestamp de quando foi aprovado, não há quem aprovou, não há histórico de rejeição, não há motivo. Se um aluno for desbloqueado por engano e precisar ser suspenso novamente, não há como auditoria.

**Ação recomendada:** Migrar para `status: 'pending' | 'approved' | 'rejected' | 'suspended'` com `approved_at` e `approved_by`

### Ausência de rate limiting visível nas APIs de IA
Os endpoints `/api/ai/coach-chat`, `/api/ai/workout-wizard`, `/api/ai/vip-coach` chamam modelos de linguagem. O sistema de `vip_usage_daily` controla quotas por usuário, mas não há evidência de rate limiting por IP ou por sessão não autenticada. Um usuário malicioso poderia esgotar créditos da API de IA sem autenticação completa.

---

## 3. Monetização e Sistema VIP

### Dois caminhos de cobrança sem unificação
O sistema VIP verifica três fontes em cascata: role admin/teacher → `app_subscriptions` (RevenueCat/in-app) → `marketplace_subscriptions` (MercadoPago/Asaas). Isso significa que um aluno pode ter assinatura ativa em dois sistemas ao mesmo tempo, e a prioridade é definida pela ordem no código, não por lógica de negócio explícita.

Além disso, o fallback para `FREE_LIMITS` acontece silenciosamente se nenhuma assinatura for encontrada — sem log, sem alerta. Se houver bug no lookup do Supabase, o aluno paga e fica no free sem saber.

**Ação recomendada:** Unificar status de assinatura em uma tabela de `user_entitlements` atualizada por webhook dos dois gateways, com log de mudanças

### Feature flags nunca evoluem para remoção
O sistema de feature flags (`featureFlags.js`) tem 4 flags: `teamworkV2`, `storiesV2`, `weeklyReportCTA`, `offlineSyncV2`. O sufixo `V2` sugere que a V1 já existe — mas não há V1 nas flags. Provavelmente a V1 era o comportamento padrão sem flag.

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
Há 6 versões do SW em `/public/`: `sw.js`, `sw 2.js`, `sw 3.js`, `sw 4.js`, `sw 5.js`, `sw 6.js`. Qual está ativo? Provavelmente `sw.js`, mas a presença das outras cria dúvida. Service Workers com cache stale são notoriamente difíceis de debugar em produção.

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
A presença desse arquivo no repositório indica que um bug crítico de produção (loop de login) foi debugado e o artefato ficou commitado. Arquivos de debug não devem ir para o repositório principal — além de poluir, podem conter informações sensíveis sobre o ambiente.

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
| 🔴 Crítico | Limpar arquivos duplicados (` 2`, ` 3`) | Alto | Baixo |
| 🔴 Crítico | Exportar schema real + commitar migrations | Alto | Baixo |
| 🔴 Crítico | Simplificar lógica de OAuth origin | Alto | Baixo |
| 🟠 Alto | Migrar componentes críticos JS → TS | Alto | Alto |
| 🟠 Alto | Unificar status de assinatura (entitlements) | Alto | Médio |
| 🟠 Alto | Testes automatizados para VIP, billing e auth | Alto | Médio |
| 🟡 Médio | Refatorar AdminPanelV2 e ActiveWorkout | Médio | Alto |
| 🟡 Médio | Política de lifecycle para feature flags | Médio | Baixo |
| 🟡 Médio | Aprovação de aluno com audit trail | Médio | Baixo |
| 🟢 Produto | Onboarding estruturado do aluno | Alto | Médio |
| 🟢 Produto | IA integrada no treino ativo | Alto | Alto |
| 🟢 Produto | Dashboard de evolução da turma (professor) | Alto | Médio |
