# Prompts de Correção — IronTracks
> Um prompt por correção, pronto para usar no TRAE. Organizados por prioridade.

---

## 🔴 CRÍTICO

---

### 1. Limpar arquivos duplicados

```
Faça uma varredura em todo o projeto e liste todos os arquivos que possuem versões duplicadas com sufixo numérico no nome (ex: "arquivo 2.ts", "arquivo 3.js", "Componente 2.tsx").

Para cada grupo de duplicatas encontrado:
1. Identifique qual é a versão canônica/ativa (a que está sendo importada ou que tem o conteúdo mais recente)
2. Verifique se as outras versões têm algum conteúdo único que não existe na versão canônica
3. Se não houver conteúdo único, delete as versões antigas
4. Se houver conteúdo único, consolide na versão canônica antes de deletar

Inclua especialmente: arquivos em /src/components, /src/app/api, /src/utils/supabase, /public/sw*.js e /src/app/auth/login.

Ao final, gere um relatório com o que foi removido e o que foi consolidado.
```

---

### 2. Exportar e commitar o schema real do banco

```
O arquivo schema_full_restore.sql está desatualizado — ele contém apenas 6 tabelas mas o código referencia pelo menos 15+ tabelas adicionais (vip_usage_daily, app_subscriptions, marketplace_subscriptions, app_plans, workout_checkins, stories, follows, entre outras).

Faça o seguinte:
1. Varra todo o código em /src buscando todas as chamadas .from('nome_tabela') do Supabase
2. Gere uma lista completa de todas as tabelas referenciadas no código
3. Para cada tabela ainda não documentada no schema_full_restore.sql, crie o CREATE TABLE correspondente inferindo os campos a partir de como são usados no código (selects, inserts, upserts)
4. Inclua as políticas de RLS adequadas para cada tabela com base no padrão de acesso observado no código
5. Atualize o schema_full_restore.sql com o schema completo e adicione um comentário no topo indicando a data da atualização

O objetivo é que qualquer dev possa clonar o projeto e ter um banco funcional rodando localmente.
```

---

### 3. Simplificar a lógica de OAuth origin

```
O arquivo src/app/auth/login/route.ts tem ~70 linhas apenas para calcular o `safeOrigin` do redirect OAuth, usando x-forwarded-host, x-forwarded-proto, IRONTRACKS_PUBLIC_ORIGIN, e múltiplos try/catch silenciosos. Isso já causou um loop de login em produção.

Refatore este arquivo para:
1. Usar `process.env.NEXT_PUBLIC_APP_URL` como fonte primária do origin (ex: https://irontracks.com.br)
2. Ter fallback para `process.env.VERCEL_URL` em preview deploys
3. Usar `http://localhost:3000` apenas em desenvolvimento
4. Eliminar toda a lógica de inferência dinâmica por headers
5. Lançar um erro claro em build/start se NEXT_PUBLIC_APP_URL não estiver configurado em produção
6. Manter suporte aos providers google e apple

A lógica nova deve ter no máximo 15 linhas para construir o redirectTo. Adicione comentário explicando cada variável de ambiente necessária.
```

---

## 🟠 ALTO

---

### 4. Migrar featureFlags.js para TypeScript

```
Migre o arquivo src/utils/featureFlags.js para TypeScript seguindo estas regras:

1. Renomeie para featureFlags.ts
2. Crie um tipo `FeatureKey` como union das chaves válidas
3. Crie um tipo `UserSettings` com todos os campos conhecidos usados nos componentes do projeto (varra o código para descobrir todos os campos usados via settings.campo)
4. Adicione JSDoc em cada flag indicando: o que faz, quando foi criada, e se já pode ser removida (tornar comportamento padrão)
5. Adicione uma função `getEnabledFeatures(settings: UserSettings): FeatureKey[]` que retorna a lista de features ativas
6. Mantenha compatibilidade com todos os lugares que já importam do arquivo atual

Ao final, liste quais flags parecem ser candidatas a remoção (comportamento já estável que não precisa mais de flag).
```

---

### 5. Migrar workout-actions.js e chat-actions.js para TypeScript

```
Migre os arquivos src/actions/workout-actions.js e src/actions/chat-actions.js para TypeScript.

Para cada arquivo:
1. Renomeie para .ts
2. Identifique os tipos de entrada e saída de cada função com base no uso no código
3. Use os tipos já existentes em src/types/supabase.ts onde aplicável
4. Tipar explicitamente os retornos das server actions (use o padrão `{ data, error }` já usado no projeto)
5. Substitua qualquer `any` por tipos concretos ou por `unknown` com comentário explicando por que não é possível tipar melhor
6. Não altere a lógica — apenas adicione tipos

Atualize todos os imports nos componentes que usam esses arquivos.
```

---

### 6. Criar tabela user_entitlements para unificar assinaturas

```
O sistema VIP atual verifica assinaturas em três fontes separadas em cascata (role → app_subscriptions → marketplace_subscriptions), o que pode resultar em usuários pagantes sendo tratados como free se houver qualquer erro no lookup.

Crie uma solução unificada:

1. Crie a migration SQL para uma tabela `user_entitlements` com campos:
   - id, user_id, tier (free/pro/elite/admin), source (revenuecat/mercadopago/asaas/manual), status (active/cancelled/expired), started_at, expires_at, updated_at, metadata JSONB

2. Crie uma função SQL no Supabase `get_user_tier(p_user_id UUID)` que retorna o tier ativo mais alto do usuário

3. Refatore a função `getVipPlanLimits` em src/utils/vip/limits.ts para usar a nova tabela como fonte primária, com fallback para as tabelas antigas durante a transição

4. Adicione log explícito quando o fallback para FREE_LIMITS for ativado (console.warn com user_id e motivo)

5. Crie o esqueleto de um webhook handler em src/app/api/billing/entitlements/route.ts que atualize a user_entitlements quando chamado pelos gateways
```

---

### 7. Adicionar testes para o sistema VIP e billing

```
Crie testes automatizados para os módulos mais críticos do IronTracks que atualmente não têm cobertura:

1. src/utils/vip/limits.ts — testar:
   - getVipPlanLimits retorna UNLIMITED para admin e teacher
   - getVipPlanLimits retorna FREE_LIMITS quando não há assinatura
   - checkVipFeatureAccess bloqueia quando limite diário é atingido
   - checkVipFeatureAccess libera quando limite não foi atingido
   - incrementVipUsage incrementa corretamente

2. src/app/auth/login/route.ts (após refatoração) — testar:
   - Redirect para Google OAuth com URL correta
   - Redirect para Apple OAuth com URL correta
   - Erro quando variáveis de ambiente faltam

Use vitest (já comum em projetos Next.js). Mock o cliente Supabase. Não use dados reais de produção. Crie os arquivos em __tests__ ao lado de cada módulo.
```

---

## 🟡 MÉDIO

---

### 8. Refatorar AdminPanelV2 extraindo hooks e subcomponentes

```
O componente AdminPanelV2.js concentra muitas responsabilidades: listagem de alunos, inbox, check-ins, alertas, relatórios. Refatore-o seguindo o princípio de separação de responsabilidades:

1. Crie os seguintes hooks em src/hooks/:
   - useAdminStudents() — fetching e estado da lista de alunos
   - useCheckinAlerts() — fetching de alertas de check-in para o inbox
   - useStudentCheckins(studentId) — check-ins de um aluno específico

2. Para cada aba/seção principal do AdminPanel, crie um subcomponente em src/components/admin/:
   - StudentsTab.tsx
   - InboxTab.tsx  
   - CheckinsTab.tsx

3. O AdminPanelV2 deve ficar responsável apenas por: layout, navegação entre abas e composição dos subcomponentes

4. Migre o arquivo de .js para .tsx durante o processo

5. Mantenha o comportamento exato — não altere lógica, apenas reorganize
```

---

### 9. Adicionar lifecycle às feature flags

```
Refatore o sistema de feature flags em src/utils/featureFlags.ts (após migração para TS) para incluir metadados de lifecycle em cada flag.

1. Altere a estrutura para que cada flag seja um objeto com:
   - key: string
   - description: string  
   - owner: string (nome ou área responsável)
   - createdAt: string (data ISO)
   - reviewBy: string (data ISO até quando deve ser revisada)
   - defaultWhenExpired: boolean (comportamento padrão se a flag for removida)

2. Crie uma função `getExpiredFlags()` que retorna flags cuja reviewBy já passou

3. Adicione um console.warn em desenvolvimento quando uma flag expirada for consultada

4. Preencha os metadados para as 4 flags existentes: teamworkV2, storiesV2, weeklyReportCTA, offlineSyncV2

5. Documente no README da pasta utils como adicionar novas flags seguindo esse padrão
```

---

### 10. Migrar aprovação de aluno para sistema de status com auditoria

```
Atualmente a aprovação de alunos usa um campo booleano `is_approved` na tabela profiles, sem histórico de quem aprovou, quando e por quê.

Implemente um sistema de status com auditoria:

1. Crie a migration SQL:
   - Adicione coluna `status` em profiles: 'pending' | 'approved' | 'rejected' | 'suspended'
   - Adicione colunas: approved_at (timestamp), approved_by (uuid, FK para profiles), rejection_reason (text)
   - Mantenha is_approved por retrocompatibilidade, criando um trigger que sincroniza is_approved = (status = 'approved')

2. Atualize src/app/(app)/layout.tsx para checar status = 'approved' em vez de is_approved

3. Atualize a página /wait-approval para exibir mensagem diferente para status 'rejected' (com o motivo) vs 'pending'

4. Atualize o componente de aprovação no AdminPanel para:
   - Usar os novos campos ao aprovar/rejeitar
   - Registrar o admin que fez a ação (auth.uid())
   - Opcionalmente preencher rejection_reason ao rejeitar
```

---

### 11. Limpar pastas de backup do repositório

```
O repositório contém pastas que não deveriam existir no Git: _legacy_backup, _macro_mixer_orig, e _snapshots na raiz.

Faça o seguinte:
1. Verifique se há algum arquivo nessas pastas que ainda é referenciado (importado) por qualquer arquivo do projeto
2. Se houver, mova o conteúdo relevante para o local correto no projeto antes de deletar
3. Delete as pastas _legacy_backup, _macro_mixer_orig e _snapshots
4. Delete também o arquivo login_loop_debug_report.json da raiz
5. Adicione ao .gitignore regras para evitar que pastas de backup entrem futuramente:
   _legacy_*/
   _backup*/
   _orig*/
   *_debug_report*.json
6. Crie um commit limpo com mensagem "chore: remove legacy backup folders and debug artifacts"
```

---

### 12. Consolidar Service Workers

```
O diretório /public contém 6 versões do Service Worker: sw.js, sw 2.js, sw 3.js, sw 4.js, sw 5.js, sw 6.js.

Faça o seguinte:
1. Identifique qual versão está registrada ativamente (verificando qual arquivo é referenciado no ServiceWorkerRegister.js ou similar)
2. Compare o conteúdo das versões para identificar se alguma versão não-ativa tem funcionalidade que não existe na versão ativa
3. Se houver diferença relevante, consolide na versão ativa
4. Delete todas as versões que não são a ativa
5. Renomeie o SW ativo para sw.js se já não for
6. Garanta que o registro do SW no código aponte explicitamente para '/sw.js'
7. Adicione um comentário no topo do sw.js com a versão (ex: // IronTracks SW v6 — última atualização: [data])
```

---

## 🟢 PRODUTO

---

### 13. Criar onboarding estruturado para novos alunos

```
O app tem um GuidedTour com múltiplas versões mas não há um fluxo de onboarding estruturado para alunos novos que chegam via convite do professor.

Crie um fluxo de onboarding completo:

1. Crie um componente OnboardingFlow.tsx em src/components/onboarding/ com 4 etapas:
   - Boas-vindas (nome do professor, foto do app)
   - "Seu primeiro treino" (como criar ou receber um treino)
   - "Durante o treino" (como usar o ActiveWorkout: timer, RPE, check-in)
   - "Acompanhe sua evolução" (histórico, avaliações, muscle map)

2. Cada etapa deve ter: título, descrição curta, ilustração/ícone, e botão de avançar

3. Crie um hook useOnboarding() que:
   - Verifica se o usuário já completou o onboarding (salva em user_settings ou localStorage)
   - Expõe: hasCompleted, currentStep, advance(), skip()

4. Integre o OnboardingFlow no dashboard: exibir automaticamente na primeira visita após aprovação

5. Adicione uma forma de o aluno revisitar o onboarding via Configurações → "Ver tour do app"
```

---

### 14. Integrar IA no fluxo de treino ativo

```
Atualmente os endpoints de IA (coach-chat, insights, muscle-map) são features separadas acessíveis fora do treino. O momento de maior engajamento — durante a execução — não tem nenhuma inteligência integrada.

Adicione assistência de IA contextual no ActiveWorkout:

1. Crie um componente AiAssistantBubble.tsx que aparece como botão flutuante durante o treino ativo

2. Ao tocar, abre um modal leve (não tela cheia) com 3 ações rápidas:
   - "Como está minha carga?" — chama /api/ai/post-workout-insights com os sets completados até agora
   - "Ajustar descanso" — sugere tempo de descanso com base no RPE do último set
   - "Preciso de ajuda" — abre o CoachChat com contexto do treino atual

3. O contexto enviado para a IA deve incluir: nome do treino, exercícios completados, pesos/reps, RPE informado, e check-in pré-treino se houver

4. Mostre o resultado inline no modal, sem redirecionar para outra tela

5. O botão só aparece para usuários com plano VIP (verificar via useVipCredits ou equivalente)

6. Registre o uso em vip_usage_daily com feature_key = 'insights'
```

---

### 15. Criar dashboard de evolução da turma para professores

```
O AdminPanelV2 permite ver dados individuais de alunos, mas não há visão consolidada da turma inteira — o professor não consegue ver rapidamente quem está em risco, quem está evoluindo, ou qual é a consistência geral.

Crie um componente ClassDashboard.tsx em src/components/admin/:

1. Seção "Visão Geral da Turma" com cards:
   - Total de alunos ativos (treino nos últimos 7 dias)
   - Média de treinos por aluno na semana
   - Alunos sem treino há mais de 7 dias (com lista)
   - Média de RPE da turma na semana

2. Seção "Atenção Necessária" listando alunos com:
   - Dor ≥ 7 em check-ins recentes
   - Energia consistentemente baixa (< 4 em 3+ check-ins)
   - Sem atividade há mais de 10 dias

3. Seção "Destaques da Semana":
   - Aluno com mais treinos
   - Aluno com maior evolução de carga (percentual)

4. Todos os dados devem ser buscados via queries Supabase agrupadas (não N queries individuais)

5. Adicione o ClassDashboard como primeira aba do AdminPanelV2, antes da lista de alunos
```

---

### 16. Unificar e aprofundar o módulo de nutrição

```
O app tem três partes de nutrição fragmentadas: NutritionMixer no dashboard, chef_ai como feature VIP, e kcalClient em /utils/calories. Elas não se conversam e a experiência é incompleta.

Crie uma visão unificada de nutrição:

1. Crie um NutritionContext em src/contexts/NutritionContext.tsx que centraliza:
   - Meta calórica diária (derivada do TDEE da avaliação física, se houver)
   - Registro do dia atual
   - Histórico semanal

2. Unifique NutritionMixer e kcalClient para usarem o mesmo contexto

3. Crie uma tela/modal NutritionDayView.tsx com:
   - Barra de progresso calórico do dia (consumido vs meta)
   - Macros em gráfico de rosca (proteína, carbo, gordura)
   - Lista de refeições registradas
   - Botão "Sugerir refeição" que chama o chef_ai com o contexto do que falta no dia

4. Integre o TDEE calculado nas avaliações físicas como fonte da meta calórica (conectar src/utils/calculations/bodyComposition.ts com NutritionContext)

5. Adicione acesso à NutritionDayView no dashboard do aluno junto com as outras ferramentas
```

---

## 📋 Ordem de execução sugerida

Para quem vai executar tudo em sequência, esta é a ordem que minimiza retrabalho:

1. Limpar duplicatas (Prompt 1) — ambiente mais limpo para tudo que vem depois
2. Commitar schema real (Prompt 2) — base para qualquer trabalho no banco
3. Migrar featureFlags para TS (Prompt 4) — base para os outros arquivos JS
4. Migrar actions para TS (Prompt 5) — desbloqueia tipagem em componentes
5. Simplificar OAuth (Prompt 3) — fix cirúrgico, não depende de mais nada
6. Limpar pastas de backup (Prompt 11) — limpeza simples
7. Consolidar Service Workers (Prompt 12) — limpeza simples
8. Aprovação com auditoria (Prompt 10) — migration simples com impacto visível
9. Lifecycle de feature flags (Prompt 9) — após TS estar ok
10. user_entitlements (Prompt 6) — migration mais complexa, após base estar estável
11. Testes VIP e billing (Prompt 7) — após entitlements no lugar
12. Refatorar AdminPanelV2 (Prompt 8) — refatoração maior, após base limpa
13. Onboarding (Prompt 13) — produto, pode ir em paralelo
14. IA no treino ativo (Prompt 14) — produto, após testes no lugar
15. Dashboard da turma (Prompt 15) — produto, após AdminPanel refatorado
16. Unificar nutrição (Prompt 16) — produto, escopo maior, para o final
```
