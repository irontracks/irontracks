# Checklist Funcional — IronTracks

Este documento serve para validar, manualmente, cada feature adicionada durante a evolução recente do app.

## 1) Check-in Pré/Pós-treino (salvar + exibir)
**Para que serve**: registrar energia/dor/tempo antes do treino e RPE/satisfação/dor após o treino, para contexto, histórico e ajustes.

**Onde achar (usuário)**:
- Pré: ao iniciar treino (quando habilitado)
- Pós: ao finalizar treino (quando habilitado)
- Relatório: dentro do relatório do treino

**Passos de teste**
- Iniciar um treino e preencher o check-in **Pré** (energia, dor, tempo, observações).
- Finalizar o treino e preencher o check-in **Pós** (RPE, satisfação, dor, observações).
- Abrir o relatório do treino e confirmar que o card “Check-in Pré e Pós-treino” mostra os dados.

**Resultado esperado**
- Pré e Pós aparecem no relatório.
- Check-ins ficam gravados em `workout_checkins` e associados ao `workout_id` quando possível.

## 2) Toggles de check-in nas Configurações
**Para que serve**: permitir ligar/desligar o check-in Pré e/ou Pós.

**Onde achar**
- Configurações → seção “Modo do App” → “Check-in pré-treino” e “Check-in pós-treino”.

**Passos de teste**
- Desligar “Check-in pré-treino” e iniciar um treino.
- Desligar “Check-in pós-treino” e finalizar um treino.

**Resultado esperado**
- Quando desligado, o modal não aparece e o treino funciona normalmente.

## 3) Histórico de Check-ins (Aluno)
**Para que serve**: visualizar check-ins no período, com filtros, médias e alertas.

**Onde achar**
- Dashboard → Ferramentas → Check-ins.

**Passos de teste**
- Abrir o modal e alternar filtros: Todos / Pré / Pós.
- Alternar período: 7 dias / 30 dias.
- Confirmar que aparecem as médias (Pré e Pós), alertas e lista.

**Resultado esperado**
- Lista carrega via Supabase (por `user_id`) e filtros funcionam.

## 4) Tendências/Alertas no Histórico de Check-ins (Aluno)
**Para que serve**: dar leitura rápida de estado e consistência.

**Onde achar**
- No mesmo modal do Histórico de Check-ins (Aluno), acima da lista.

**Passos de teste**
- Garantir que existam check-ins suficientes no período.
- Validar que as médias mudam ao alternar 7d/30d.

**Resultado esperado**
- Médias e alertas coerentes com os dados.

## 5) Check-ins do aluno (Coach/Professor)
**Para que serve**: professor acompanhar histórico, médias, alertas e sugestões do aluno.

**Onde achar**
- AdminPanelV2 → selecionar um aluno → subaba “Check-ins”.

**Passos de teste**
- Selecionar um aluno com `user_id` válido.
- Alternar filtros (Todos/Pré/Pós) e período (7d/30d).

**Resultado esperado**
- Lista e médias carregam e refletem os check-ins do aluno selecionado.
- Se aluno não tiver `user_id`, exibe mensagem informativa.

## 6) Alerta de check-ins no Inbox do Coach (Priorities)
**Para que serve**: avisar o professor automaticamente quando sinais de risco aparecerem (dor alta, energia baixa, satisfação baixa).

**Onde achar**
- AdminPanelV2 → aba Priorities/Inbox (feed).

**Passos de teste**
- Criar dados de check-in que disparem gatilho (ex.: dor ≥ 7 em 3+ check-ins na semana).
- Abrir Priorities/Inbox e procurar “Alerta de check-in”.
- Clicar “Sonecar” e confirmar que some temporariamente.
- Clicar “Concluir” e confirmar que não volta.

**Resultado esperado**
- Item aparece com reason claro e mensagem sugerida.
- Snooze/done funcionam.

## 7) Insights/Recomendações (Regras simples)
**Para que serve**: transformar check-in em ações concretas (ajustes de volume/carga/tempo/recuperação).

**Onde achar**
- Relatório do treino: bloco “Recomendações” dentro da seção de check-in.
- Histórico de Check-ins (Aluno): bloco “Sugestões”.
- Check-ins do aluno (Coach): bloco “Sugestões”.

**Passos de teste**
- Criar cenários (dor alta, energia baixa, RPE alto, pouco tempo).
- Confirmar que recomendações aparecem de forma coerente.

**Resultado esperado**
- Recomendações aparecem somente quando existem sinais suficientes.

## 8) Calendário de Treinos (Aluno)
**Para que serve**: visão semanal/mensal do histórico e navegação por dia, com indicação de check-in.

**Onde achar**
- Dashboard → Ferramentas → Calendário.

**Passos de teste**
- Abrir o calendário, alternar “Semana/Mês”.
- Navegar anterior/próximo e clicar em dias com treino.

**Resultado esperado**
- Dias com treino mostram contagem e indicador.
- Ao selecionar um dia, lista os treinos do dia e indica Pré/Pós quando houver.

## 9) Criador Automático de Treino (Wizard Premium)
**Para que serve**: gerar um treino inicial automaticamente com base no perfil desejado, e abrir no editor para ajustes.

**Onde achar**
- Dashboard → botão “Novo Treino” (abre o Wizard).
- Dashboard → Ferramentas → “Criar automaticamente” (atalho para abrir o Wizard).

**Passos de teste**
- Clicar “Novo Treino”.
- Escolher “Criar automaticamente”.
- Preencher etapas, clicar “Gerar treino” e depois “Abrir no editor”.
- Validar que o editor abre com título + exercícios preenchidos.
- Testar “Criar manualmente” (atalho) e validar que abre o editor em branco.

**Resultado esperado**
- Treino gerado contém exercícios, sets/reps/rest e abre no editor.
- Opção manual segue funcionando.

## 10) Scanner de Treino (fluxo)
**Para que serve**: permitir criação por imagem sem perder o caminho “manual”.

**Onde achar**
- Dashboard → Ferramentas → Scanner de Treino (Imagem).

**Passos de teste**
- Abrir o scanner e confirmar que leva para o editor corretamente.

**Resultado esperado**
- O scanner continua funcionando mesmo com o Wizard no “Novo Treino”.

## 11) Story Composer (Vídeo & Compartilhamento)
**Para que serve**: Compartilhar treinos no Instagram/Iron Story com vídeos longos (até 100MB) e layout aplicado (overlay).

**Onde achar**:
- Ao finalizar treino -> Botão de compartilhar.
- Histórico -> Selecionar treino -> Compartilhar.

**Passos de teste**:
- Gravar/Escolher vídeo > 50MB (até 100MB).
- Verificar se carrega sem erro.
- Escolher layout (Live, Normal, etc.).
- Clicar "Salvar" (deve gerar arquivo MP4/WebM com layout).
- Clicar "Iron Story" (deve enviar vídeo com layout para o feed).
- Clicar "Compartilhar" (deve abrir share sheet nativo com vídeo processado).

**Resultado esperado**:
- Vídeo deve conter as métricas desenhadas em cima (não só fundo preto).
- Áudio deve estar mudo (padrão atual).
- Qualidade deve ser mantida (1080p approx).
