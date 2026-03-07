## O que já está certo hoje
- Essa caixa já é lida pela IA: o endpoint do wizard dá **prioridade máxima** ao `answers.constraints` e inclui o texto original e normalizado no prompt ([workout-wizard/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/workout-wizard/route.ts#L56-L121)).
- O “MAPA MUSCULAR” já injeta instruções nessa mesma caixa via prefill local (por isso funciona como “instruções do coach”).

## Mudanças pedidas
### 1) Renomear a caixa
- Trocar o título **“Restrições (opcional)”** por **“Preferências e restrições (opcional)”**.
- Ajustar o texto de ajuda e placeholder para deixar explícito que serve para preferências (foco muscular, ordem, estilo) e restrições (dor, evitar exercícios/equipamentos).

### 2) Tempo até 2h
- Expandir opções de tempo no wizard para incluir **90 min** e **120 min (2h)**.
- Atualizar o tipo `timeMinutes` no wizard e o fallback gerador para respeitar esse tempo (mais exercícios/volume quando 90/120).

## Implementação (o que vou editar)
1) UI do wizard
- [WorkoutWizardModal.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/WorkoutWizardModal.tsx)
  - Trocar label da textarea para “Preferências e restrições (opcional)”.
  - Atualizar o helper/placeholder.
  - Alterar as opções de tempo de `[30,45,60]` para `[30,45,60,90,120]`.
  - Atualizar o tipo `timeMinutes` para `30 | 45 | 60 | 90 | 120`.

2) Fallback (quando IA falha)
- [workoutWizardGenerator.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/workoutWizardGenerator.ts)
  - Ajustar `countByTime()` para:
    - até 60 → comportamento atual
    - 90 → +1 exercício
    - 120 → +2 exercícios
  - Isso faz o treino “caber” melhor em 2h sem depender da IA.

3) Prompt (clareza)
- [workout-wizard/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/workout-wizard/route.ts)
  - Atualizar o texto do prompt para chamar esse campo de “Preferências e restrições”, mantendo o mesmo `answers.constraints` (sem quebrar compatibilidade).

## Validação
- Rodar lint/build.
- Abrir o wizard e confirmar:
  - label novo aparece;
  - opções 90/120 aparecem;
  - ao clicar “Criar treino” pelo mapa muscular, o texto prefill continua indo para essa caixa;
  - IA respeita esse texto (porque já é prioridade máxima).
