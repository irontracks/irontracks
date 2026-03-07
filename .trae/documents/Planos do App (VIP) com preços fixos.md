## O que mudar (conceito)
- Hoje o Marketplace está centrado em `teacher_plans` (planos de professores) e `marketplace_subscriptions` (assinatura aluno↔professor).
- Para o seu caso, os planos precisam ser **do próprio app** (IronTracks), porque o app paga o custo do Gemini.

## Preços recomendados (pra cobrir custo do Gemini + margem)
- Como regra prática para chat/coach: o custo de tokens costuma ser baixo por usuário se você:
  - limitar tamanho do contexto (ex.: 10–20 treinos + resumo)
  - limitar respostas longas (ex.: 400–900 tokens)
  - colocar rate limit por dia/semana
- Sugestão de tiers (BRL) com limites claros (evita “uso infinito”):
  - **VIP Start — R$ 29,90/mês**: 10 respostas/dia, 1 bloco/semana, sem multimodal.
  - **VIP Pro — R$ 59,90/mês**: 30 respostas/dia, 3 blocos/semana, resumo semanal + ações 1‑clique.
  - **VIP Elite — R$ 99,90/mês**: 80 respostas/dia, blocos ilimitados com fair use, prioridade/latência menor, memória VIP avançada.
- Se quiser anual: 2 meses de desconto (ex.: 10× o mensal).

## Implementação técnica (o que vou fazer)
### 1) Criar tabelas “do app”
- Criar `app_plans` (planos fixos do IronTracks) e `app_subscriptions` (assinaturas do usuário com status).
- Guardar preços em `price_cents`, `interval`, `status`, `features_json` (limites/benefícios).
- RLS: leitura pública para `app_plans` (ou autenticado), escrita só admin/service role.

### 2) Seed dos planos fixos
- Na migration, inserir 3 planos (Start/Pro/Elite) com IDs fixos e preços.

### 3) Trocar o Marketplace para listar planos do app
- Atualizar `MarketplaceClient.tsx` para carregar de `/api/app/plans`.
- Remover dependência de teacher_id para exibir planos.
- Manter botão **Voltar** (já adicionamos) e melhorar o empty state.

### 4) Checkout e assinatura do app
- Criar `/api/app/checkout` que cria `app_subscriptions` e gera cobrança PIX via Asaas (modelo atual já faz isso para teacher plans).
- Atualizar o gate do VIP (`/api/vip/access` e `vip-coach`) para checar `app_subscriptions` (active/past_due).

### 5) Rate limit por plano (proteção de custo)
- Criar tabela `vip_usage_daily` e, em `/api/ai/vip-coach`, bloquear por plano (ex.: 10/30/80 msgs/dia).

### 6) Verificação
- Testar:
  - usuário sem plano → Marketplace mostra planos do app + Voltar
  - usuário com plano ativo → VIP desbloqueado
  - limite diário atingido → mensagem clara

Se aprovar, eu começo criando as migrations (app_plans/app_subscriptions/vip_usage_daily + seeds) e em seguida adapto Marketplace + checkout + gate do VIP.