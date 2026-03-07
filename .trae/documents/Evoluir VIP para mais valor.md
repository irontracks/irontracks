## Objetivo
- Transformar o VIP em um “Coach IA com resultado” (ações 1‑clique, contexto real, memória persistente, insights e UX premium), usando dados do IronTracks + Marketplace.

## Escopo do que será implementado
### 1) Ações 1‑clique (resultado imediato)
- Resposta da IA passa a devolver `actions[]` e a UI renderiza botões.
- Ações iniciais:
  - **Gerar treino de hoje** (salvar treino e abrir no dashboard).
  - **Gerar bloco 4 semanas** (criar 4 templates/treinos e salvar).
  - **Aplicar ajustes** (ex.: reduzir volume/alterar exercícios) em um treino selecionado.

### 2) Resumo semanal VIP (insights com dados reais)
- Endpoint `GET /api/vip/weekly-summary`:
  - frequência (dias treinados), volume por grupamento (sets ou fallback notes), PRs recentes, tendência de sono/energia/dor (check-ins), aderência ao plano.
- UI com cards + “o que fazer agora” (call‑to‑action)

### 3) Memória VIP (preferências e restrições persistentes)
- Criar tabela Supabase `vip_profile` (por user): objetivo, restrições, equipamentos, preferências, histórico de lesão, estilo, tempo disponível.
- RLS: usuário só lê/escreve o próprio; admin/teacher com acesso apropriado.
- IA sempre injeta essa memória no prompt.
- UI para editar rapidamente (chips + textarea).

### 4) Chat VIP premium (persistência e referência)
- Persistir histórico do chat VIP (tabela `vip_chat_threads`/`vip_chat_messages`).
- Exibir “Dados usados” com links (últimos treinos/avaliações/check-ins) e follow-ups clicáveis.
- Streaming opcional (se a lib suportar fácil); caso contrário, loading robusto.

### 5) Biblioteca VIP (conteúdo recorrente)
- Playbooks/protocolos (hipertrofia 4x, força 3x, cutting, deload, etc.) + botão “adaptar ao meu caso”.
- Templates gerados ficam disponíveis no dashboard.

## Implementação (ordem)
1) Padronizar `actions[]` e integrar UI do VipHub.
2) Criar `weekly-summary` e UI de cards.
3) Criar tabelas + RLS da Memória VIP e integrar no prompt.
4) Persistir chat VIP no Supabase e renderizar histórico.
5) Adicionar biblioteca/playbooks e “adaptar ao meu caso”.

## Verificação
- Testar 3 perfis: admin/teacher, usuário VIP (assinatura ativa/past_due), usuário não‑VIP (paywall).
- Garantir build/lint passando e conferir no Browser do Trae.

Se você confirmar, eu começo já criando as tabelas (migrations + RLS) e em seguida conecto ações 1‑clique e o resumo semanal.