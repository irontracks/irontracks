# Documentação: Sistema de Créditos VIP e Relatórios

## 1. Visão Geral
O sistema de créditos VIP controla o acesso a recursos premium do IronTracks (Coach IA, Workout Wizard, Insights). Ele é baseado em **Planos** (Start, Pro, Elite) e **Limites** (Diários ou Semanais).

## 2. Estrutura de Dados

### Tabela `app_plans`
Armazena as configurações de cada plano, incluindo a coluna `limits` (JSONB).
Exemplo de `limits`:
```json
{
  "chat_daily": 10,
  "wizard_weekly": 1,
  "insights_weekly": 3,
  "history_days": 60,
  "nutrition_macros": false
}
```

### Tabela `vip_usage_daily`
Registra o consumo de cada recurso.
- **user_id**: ID do usuário.
- **feature_key**: `chat`, `wizard`, ou `insights`.
- **day**: Data do uso (YYYY-MM-DD).
- **usage_count**: Quantidade usada naquele dia.

## 3. Contadores Visuais (Client-Side)
Os contadores aparecem automaticamente nas ferramentas quando o usuário tem um plano ativo (ou Free com limites).
- **Coach IA**: Mostra `Usado/Limite` no topo do chat.
- **Insights**: Mostra badge no card de Insights pós-treino.
- **Wizard**: Mostra badge no modal de criação automática.

> **Nota:** Os contadores só aparecem se a API `/api/user/vip-credits` retornar dados válidos. Isso exige que as migrações de banco de dados tenham sido executadas.

## 4. Painel Administrativo (Relatórios)
O Admin possui uma aba **VIP Reports** que mostra:
- Total de usuários por plano (Free, Start, Pro, Elite).
- Consumo global de recursos (Chat, Insights, Wizard).
- Capacidade total do sistema vs. Uso real.

### Função RPC: `admin_get_vip_stats`
Uma função de banco de dados otimizada que agrega os dados de `vip_usage_daily` e cruza com os limites dos planos para gerar o relatório em milissegundos, sem sobrecarregar o banco.

## 5. Como Manter
Para alterar limites, basta atualizar a coluna `limits` na tabela `app_plans`. O sistema reflete a mudança imediatamente para todos os usuários daquele plano.

---
**IronTracks Engineering**
