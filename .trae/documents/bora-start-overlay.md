# Plano — “BORA” não pode esconder o START

## Problema

Quando o descanso zera, aparece a tela verde “BORA!”. Ao tocar nela, o timer some e o usuário fica sem acesso ao botão START (controle do descanso).

Objetivo: manter o **START sempre acessível** quando o descanso terminar, sem perder o feedback visual/sonoro do “BORA”.

## Estratégia (melhor solução)

Trocar o comportamento de “fim do descanso” para:

- **O card do timer (bottom sheet) permanece visível e em primeiro plano**, com o botão **START** disponível.
- A tela verde “BORA” vira um **backdrop visual** (fica por trás do card), sem capturar toques na tela inteira.
- O descanso só encerra quando o usuário apertar **START** (no card).

Isso resolve o problema de UX e mantém o controle total do ciclo execução/descanso.

## Mudanças de UI/UX

### Quando `isFinished === true`
- Continuar tocando som/vibração e mantendo Live Activity/idle timer como já está (até START).
- Renderizar:
  1) um “backdrop BORA” (verde) **com `pointer-events: none`** (ou apenas em áreas fora do card)
  2) o **card** do timer (mesmo layout atual), porém trocando a contagem por “0:00” e destacando o botão **START**

### Tempo extra (overtime)
- O **tempo de descanso continua contando** após zerar (tempo extra).
- O card deve mostrar explicitamente esse extra, por exemplo:
  - `0:00 (+0:12)`
- A contagem de `restSeconds` deve considerar **descanso planejado + extra**:
  - `restSeconds = round((nowMs - restStartedAtMs) / 1000)`
- O descanso **só para** quando o usuário clicar **START**.

### Clique no “BORA”
- Não encerra nada.
- Opcional: pode só fazer um “pulse”/animação, mas não fecha timer.

## Implementação (arquivos)

### 1) Ajustar render de fim do descanso
- Arquivo: `src/components/workout/RestTimerOverlay.tsx`
- Alterações:
  - Remover o `onClick` do fullscreen verde que hoje dispara `handleStart/onFinish`.
  - Manter o backdrop verde, mas com `pointer-events-none` e z-index abaixo do card.
  - Manter o card (bottom sheet) renderizando também quando `isFinished` for true, para exibir o botão START.
  - Garantir z-index: backdrop < card < resto (ex.: backdrop `z-[2000]`, card `z-[2100]`).
  - Calcular e exibir `extraSeconds` quando `Date.now() > targetTime`.
  - Não “resetar” o descanso automaticamente ao zerar; o estado continua até START.

### 1.1) Live Activity e notificação no overtime
- Manter a notificação agendada para o fim do descanso (como hoje).
- Ao atingir `isFinished`:
  - Encerrar a notificação repetida (já acontece) e manter apenas o visual “BORA”.
  - A Live Activity pode:
    - (Preferível) ser encerrada ao zerar para evitar contagem negativa, mantendo o overlay ativo até START, **ou**
    - ser mantida “congelada” em 0:00 (se já existir suporte).
  - Em ambos os casos, o **tempo extra continua sendo contado no app** e gravado em `restSeconds` no START.

### 2) START passa a ser o único “encerra descanso” no estado final
- Arquivo: `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx`
- O callback `onStart` continua:
  - gravando `restSeconds` no set anterior
  - gravando `startedAtMs` no próximo set (quando existir)
  - fechando o timer (`handleCloseTimer`)
- `onFinish`/`onClose` continuam existindo como “Voltar” (caso o usuário queira fechar o timer manualmente).

### 3) Compatibilidade Web + iOS
- Não tem lógica específica por plataforma; comportamento igual em iOS nativo e Web.

## Critérios de aceitação
- Quando o descanso zera:
  - A tela verde “BORA” aparece, mas o **card do timer permanece** com botão START visível.
  - Não existe cenário em que o usuário “perca” o botão START.
  - O tempo extra é visível e aumenta até START.
- Ao clicar START:
  - Descanso encerra.
  - O tempo de descanso é contabilizado.
  - O início da próxima série é marcado.
- `npm run build` passa.

## Validação manual recomendada
- Iniciar treino → concluir set → aguardar zerar → verificar BORA + card com START → apertar START → overlay fecha.
- Repetir o ciclo em 2 séries seguidas.
