# Plano — Botão START e controle de descanso (iOS + Web) + métricas para relatório e calorias

## Objetivo

Adicionar um botão **START** no “modal” do descanso do treino ativo (RestTimerOverlay) para dar controle total do ciclo e registrar tempos reais:

- **START**: marca o início da execução da próxima série (fim do descanso).
- **CONCLUÍDO/FEITO**: marca o fim da execução da série e **inicia o descanso**.
- O **timer de descanso permanece ativo** (inclusive após zerar) **até o próximo START**.

Além disso:
- Levar **tempo de execução** e **tempo de descanso** para o **relatório**.
- Usar esses tempos no **cálculo de calorias**.

Escopo: **iOS nativo (Capacitor) e Web** (mesmo comportamento nas duas plataformas).

## Comportamento desejado (máquina de estados)

### Estados
- **Execução** (série em andamento): iniciada por START.
- **Descanso** (timer em andamento): iniciado por CONCLUÍDO/FEITO.
- **Descanso concluído** (timer zerou): permanece em estado “BORA!” até START.

### Regras
- Ao clicar **CONCLUÍDO/FEITO**:
  - Marca a série como concluída (comportamento atual).
  - Dispara o descanso (`startTimer(restTime, context)`), como hoje.
  - Contexto do timer passa a carregar também qual é a “próxima série” a ser iniciada no START.
- Ao clicar **START**:
  - Encerra o descanso (fecha o overlay e limpa `timerTargetTime/timerContext`).
  - Marca a “próxima série” como iniciada (registro em `activeSession.logs[nextKey]` com timestamp).
  - Se o descanso já tinha zerado, o START é o “toque para voltar” (substitui o close atual).

### Integrações (iOS nativo e Web)
- **Notificação local**: continua sendo agendada para o fim do descanso quando ele começa.
- **Live Activity**: deve continuar existindo mesmo após o timer zerar (até o usuário apertar START).
- **Tela ligada** (`isIdleTimerDisabled`): permanece ligada durante descanso até START (sem desligar ao zerar).

## Alterações no código (arquivos e responsabilidades)

### 0) Persistência de tempos por série (base do relatório e calorias)
- Adicionar campos no log de cada série (em `activeSession.logs[key]`):
  - `startedAtMs?: number` (momento do START)
  - `completedAtMs?: number` (momento do CONCLUÍDO/FEITO)
  - `restSeconds?: number` (descanso real após essa série, calculado quando o próximo START acontece)
  - `executionSeconds?: number` (execução real dessa série, calculado quando CONCLUÍDO/FEITO acontece)
- Regras de cálculo:
  - Em CONCLUÍDO/FEITO: `executionSeconds = max(0, (now - startedAtMs)/1000)` (se `startedAtMs` ausente, assume 0 e ainda grava `completedAtMs`).
  - Em START (saindo do descanso): `restSeconds` é gravado no **set anterior** usando o contexto do timer (key da série anterior) e `restStartedAtMs` (ou `completedAtMs`).

### 1) Contexto do descanso incluir “próxima série”
- Ajustar criação do timer no momento do CONCLUÍDO para enviar um contexto mais rico:
  - Hoje: `{ kind: 'rest', key }`
  - Proposto: `{ kind: 'rest', key, nextKey, restStartedAtMs }`
- Implementação inicial simples para “próxima série”:
  - `nextKey = \`\${exIdx}-\${setIdx + 1}\`` quando existir.
  - Se não existir, manter `nextKey` ausente (START apenas encerra descanso).
- Arquivo principal:
  - `src/components/workout/SetRenderers.tsx`

### 2) Botão START no RestTimerOverlay (iOS + Web)
- Adicionar um callback `onStart` no componente do overlay.
- Quando `isFinished`:
  - O clique na tela verde chama `onStart(context)` (em vez de apenas fechar).
- Quando `!isFinished`:
  - Adicionar botão **START** ao lado do “Voltar”.
  - START chama `onStart(context)`.
- Ajustar efeitos de iOS para manter Live Activity/idle timer ativos após o timer zerar (até START).
- Arquivo:
  - `src/components/workout/RestTimerOverlay.tsx`

### 3) Ação do START (encerra descanso + marca início da próxima série + grava descanso real)
- Passar `onStart` no render do overlay, no dashboard:
  - Ao chamar START:
    - `handleCloseTimer()` para parar descanso.
    - Se `context.key` existir:
      - Gravar `restSeconds` na série anterior (`context.key`) com base em `context.restStartedAtMs` (ou `completedAtMs` do log).
    - Se `context.nextKey` existir:
      - Gravar `startedAtMs = Date.now()` no log da próxima série.
- Arquivo:
  - `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx`

### 4) Tipagem/compatibilidade
- Alinhar o tipo de `context` usado no overlay com o formato real (hoje há mismatch entre o overlay “workout” e o overlay duplicado em `src/components/RestTimerOverlay.tsx`).
- A abordagem segura é manter o `context` como objeto permissivo (`Record<string, unknown>`) no ponto de passagem e tipar apenas os campos usados (`kind`, `key`, `nextKey`).
- Arquivos envolvidos:
  - `src/components/workout/RestTimerOverlay.tsx`
  - `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx`
  - (Opcional) `src/components/RestTimerOverlay.tsx` para evitar divergência de tipos.

### 5) Levar tempos para o relatório
- Persistir os totais no payload de finalização do treino:
  - `executionTotalSeconds` (soma de `executionSeconds`)
  - `restTotalSeconds` (soma de `restSeconds`)
  - `totalTimeSeconds` continua existindo (tempo total do treino)
- Ajustar `finishWorkoutPayload` para incluir esses campos ao finalizar o treino.
- Ajustar `reportMetrics` para exibir:
  - Execução total
  - Descanso total
  - Densidade real (volume / (execução + descanso) ou volume / execução, conforme definição escolhida)
- Exibir no relatório:
  - Tela: `ReportMetricsPanel.tsx`
  - PDF/HTML: `buildHtml.ts`
- Arquivos:
  - `src/lib/finishWorkoutPayload.ts`
  - `src/utils/report/reportMetrics.ts`
  - `src/components/workout-report/ReportMetricsPanel.tsx`
  - `src/utils/report/buildHtml.ts`

### 6) Usar tempos no cálculo de calorias
- Ajustar `getKcalEstimate`/`kcalClientImpl` para enviar para `/api/calories/estimate`:
  - `executionMinutes` e `restMinutes` (quando existirem)
- Ajustar `/api/calories/estimate` para:
  - Quando `executionMinutes/restMinutes` existirem:
    - Calcular `kcal = weightKg * (MET_exec * execHours + MET_rest * restHours)`
    - `MET_rest` fixo conservador (ex.: 1.5).
    - `MET_exec` derivado do modelo atual (Gemini) usando apenas execução (mais fiel) ou mantido como hoje com ajuste proporcional.
  - Manter fallback atual para treinos antigos (sem esses campos).
- Arquivos:
  - `src/utils/calories/kcalClientImpl.ts`
  - `src/app/api/calories/estimate/route.ts`
  - `src/components/WorkoutReport.tsx` (para usar os novos campos quando disponíveis)

## Critérios de aceitação (iOS)
Em iOS nativo e Web:
- Concluir uma série inicia descanso normalmente.
- Ao zerar, tela “BORA!” permanece até o usuário apertar START.
- START encerra o descanso e volta ao treino.
- START não inicia automaticamente um novo descanso.
- Relatório passa a exibir:
  - Tempo de execução total
  - Tempo de descanso total
- Cálculo de calorias passa a considerar execução vs descanso quando esses dados existirem.

## Validação
- `npm run build` deve passar.
- Teste manual iOS (iPhone/iPad) e Web:
  - Iniciar treino → Concluir set → descanso aparece → aguardar zerar → confirmar que permanece “BORA!” → apertar START → overlay fecha.
  - Concluir outro set → descanso reinicia → repetir.
  - Finalizar treino → abrir relatório → conferir Execução/Descanso.
  - Conferir calorias antes/depois (com e sem os novos campos) sem quebrar fallback.

## Entregáveis
- START no overlay (iOS nativo e Web).
- Descanso não encerra automaticamente ao zerar (permanece até START).
- Contexto do timer com `nextKey/restStartedAtMs` quando aplicável.
- Totais de execução/descanso persistidos e exibidos no relatório.
- Calorias usando execução/descanso quando disponível.
