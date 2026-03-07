## Já Implementado (removido da lista)
- Modo do App (Iniciante/Intermediário/Avançado) + presets
- Toggling de módulos (Social/Comunidade/Marketplace) + gating
- Check-in pré e pós-treino (modais + persistência)
- Exibição do check-in no Relatório do treino
- Toggles nas Configurações para ligar/desligar check-in pré/pós

## Ideias que Restam (pra você escolher)
### 1) Histórico de Check-ins (recomendado)
- Criar uma tela/aba com lista e filtros (pré/pós), e visão de tendência (Energia/Dor/RPE).
- Benefício: vira um “diário” e aumenta retenção.

### 2) Obrigatoriedade e regras
- Opções: obrigatório (não deixa iniciar/finalizar sem responder) OU “soft” (lembra e deixa pular).
- Benefício: melhora qualidade dos dados.

### 3) Telemetria / Analytics básico
- Registrar eventos (ex.: checkin_pre_shown/submitted/skipped, checkin_post_shown/submitted/skipped) e funil.
- Benefício: você mede adoção real e ajusta o produto.

### 4) Calendário de treinos
- Visão mensal/semanal, histórico + planejado.
- Benefício: aumenta clareza e planejamento do aluno.

### 5) Insights e recomendações usando check-in
- Usar check-ins pra sugerir ajuste (carga/volume) e avisos (dor alta).
- Benefício: entrega “coach-like” automaticamente.

### 6) Visão do coach (se fizer sentido)
- Coach vê check-ins do aluno (com RLS já compatível), com alertas (dor alta / energia baixa repetida).

## Como eu sigo quando você escolher 1 opção
- Mapear os pontos de UI existentes pra encaixar sem quebrar fluxo.
- Implementar a feature com persistência/consultas no Supabase.
- Validar com lint/build + teste no localhost.

**Me diga o número (1–6) que você quer agora** (se quiser, pode escolher 2 em sequência: 1 e 5 combinam muito bem).