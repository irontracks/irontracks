## Entendi exatamente
- Hoje o card lista **uma linha por recorde** (Peso/Reps/Volume) e isso vira 2–3 linhas do mesmo exercício.
- Você quer **1 linha por exercício**, com o nome à esquerda e, à direita, **PESO / REPS / VOLUME tudo na mesma linha**.

## Onde mudar
- A lista é gerada em `getLatestWorkoutPrs()` e renderizada em `RecentAchievements.tsx`.

## O que vou fazer
### 1) Alterar o formato retornado por `getLatestWorkoutPrs`
- Em [workout-actions.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js#L448-L544):
  - Em vez de gerar 3 itens separados (`{exercise,label,value}`), vou gerar **1 item por exercício**:
    - `{ exercise, weight, reps, volume, improved: { weight, reps, volume } }`
  - O item entra no card se **qualquer** uma dessas métricas for PR.
  - Ordenação mantém prioridade por volume/peso/reps, como já existe.

### 2) Ajustar o layout do card
- Em [RecentAchievements.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/RecentAchievements.tsx#L144-L170):
  - Renderizar:
    - esquerda: nome do exercício (com `truncate`)
    - direita: `PESO 150kg   REPS 15   VOLUME 1.500kg` na **mesma linha** (`whitespace-nowrap`)
  - Se o texto do exercício for grande, ele corta com `…` para nunca empurrar as métricas para baixo.
  - Opcional (já deixo pronto): destacar a métrica que foi PR (ex.: valor em amarelo mais forte).

### 3) Validação
- Conferir visual no card com exercícios longos.
- Rodar lint/build.

Vou aplicar essas mudanças agora e o card vai ficar exatamente como você descreveu.