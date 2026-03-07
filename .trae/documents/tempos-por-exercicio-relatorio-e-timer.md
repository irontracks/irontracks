# Plano — Tempos por exercício no relatório/histórico + melhoria do timer flutuante

## Objetivos

1) No **Relatório/Histórico**, exibir **tempo total por exercício em execução** (real).  
2) No **Relatório/Histórico**, exibir **tempo total por exercício em descanso** (real).  
3) Exibir **tempo total do treino em execução** (real).  
4) Exibir **tempo total do treino em descanso** (real).  
5) Melhorar a apresentação do **tempo de recuperação** no timer flutuante (print está estranho).

## Fonte de verdade (dados)

Já existe registro em nível de série (log):
- `executionSeconds` e `executionSeconds` (tempo real da série) gravados ao concluir.
- `restSeconds` (descanso real após a série, incluindo overtime) gravado ao clicar START.

Já existe total em nível de sessão:
- `executionTotalSeconds` e `restTotalSeconds` no payload de finalização.

## Como calcular “por exercício” (execução e descanso)

Para cada exercício `exIdx`:
- Somar `executionSeconds` de todas as chaves `"{exIdx}-{setIdx}"`.
- Somar `restSeconds` das mesmas chaves.

Observação: isso inclui descanso “entre exercícios” no último set do exercício anterior (porque o descanso é atribuído ao set anterior via `restSeconds`), o que é desejável para análise real do treino.

Fallback:
- Sessões antigas sem `executionSeconds/restSeconds` continuam funcionando; nesses casos, mostrar “—”.

## Mudanças (Relatório/Histórico)

### 1) Gerar métricas “tempo real por exercício” no `reportMeta`
- Arquivo: `src/utils/report/reportMetrics.ts`
- Alterações:
  - Estender `ReportExerciseMetrics` com:
    - `executionMinutes?: number` (ou `executionSeconds?: number`, e formatar na UI)
    - `restMinutes?: number`
  - Durante `buildReportMetrics`, para cada exercício:
    - somar `executionSeconds/restSeconds` do `session.logs` por `exIdx`
    - armazenar os novos campos no item de `report.exercises[]`

### 2) Exibir no relatório (tela) dentro do bloco “Detalhe por exercício”
- Arquivo: `src/components/WorkoutReport.tsx`
- Alterações:
  - Adicionar colunas na tabela “Detalhe por exercício”:
    - `Execução` (min)
    - `Descanso (real)` (min)
  - Manter a coluna já existente de descanso planejado (se fizer sentido) ou renomear para `Descanso (plan)` para não confundir.

### 3) Exibir no histórico
- O histórico abre o mesmo componente de relatório, então o ganho já aparece em “Histórico” automaticamente.
- Opcional (se necessário): adicionar um resumo rápido na lista do histórico, mas só se não poluir a UI.

### 4) Exibir no PDF/print (HTML)
- Arquivo: `src/utils/report/buildHtml.ts`
- Alterações:
  - Incluir uma seção “Detalhe por exercício” no HTML (tabela) usando:
    - `session.reportMeta.exercises` (preferível, pois unifica com a UI), ou
    - cálculo direto via `logs` (fallback).
  - Exibir colunas:
    - Execução (min)
    - Descanso real (min)

### 5) Totais do treino (execução/descanso)
- Já existem no nível de sessão e já aparecem no relatório em “Métricas do treino”.
- Ajuste (se faltar em algum ponto de UI/HTML):
  - Garantir que a tela e o PDF exibam `Execução total` e `Descanso total` quando `executionTotalSeconds/restTotalSeconds > 0`.

## Mudanças (Timer flutuante / recuperação)

Problema observado no print:
- O timer flutuante mostra “Descanso: -” e a área de recuperação está visualmente confusa.

### 1) Corrigir “Descanso: -” e melhorar o contexto
- Arquivo: `src/components/workout/WorkoutFooter.tsx`
- Alterações:
  - Trocar a fonte do descanso planejado para usar `currentExercise.restTime/currentExercise.rest_time` (fallback para `rest/rest_time`).
  - Ajustar o texto para ficar consistente (ex.: `Descanso (plan): 180s`).

### 2) Quando existir descanso ativo, mostrar o tempo de recuperação no timer flutuante
- Arquivo: `src/components/workout/WorkoutFooter.tsx`
- Alterações:
  - Se `session.timerTargetTime` existir:
    - O timer flutuante passa a mostrar `Recuperação` com contagem regressiva
    - Se zerar, mostra `0:00 (+mm:ss)` (overtime) até o usuário clicar START
  - Se não existir descanso:
    - Mantém o comportamento atual (Treino/Exercício alternando).

### 3) Ajuste visual (sem mudar layout inteiro)
- Manter o mesmo card existente, apenas mudando:
  - label (ex.: `Recuperação`, `Treino`, `Exercício`)
  - valor do tempo (rest countdown vs treino/exercício)
  - linha de descanso planejado sempre coerente (sem “-” quando existir restTime).

## Critérios de aceitação

### Relatório/Histórico
- O relatório mostra por exercício:
  - Execução (min) real
  - Descanso (min) real
- O relatório mostra totais do treino:
  - Execução total
  - Descanso total
- Sessões antigas sem dados continuam renderizando com “—” (sem quebrar).

### Timer flutuante
- Durante descanso:
  - Mostra contagem regressiva e overtime `(+mm:ss)` após zerar
  - Não aparece “Descanso: -” quando o exercício tem rest configurado
- Fora do descanso:
  - Alterna Treino ↔ Exercício corretamente.

## Validação
- `npm run build` passa.
- Teste manual:
  - Concluir set → descanso ativo → timer flutuante mostra recuperação
  - Deixar zerar → overtime aparece → START encerra descanso
  - Abrir relatório no fim → tempos por exercício e totais aparecem.

