Vou aplicar exatamente esses 4 ajustes, mexendo só no necessário.

## 1) Observações do professor em cada exercício
- Em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js), vou tornar o bloco `ex.notes` mais evidente e sempre “legível” no mobile (contraste e espaçamento), mantendo o conteúdo vindo de `exercises.notes`.

## 2) Mostrar REPS planejado (do professor) de forma clara
- Ainda em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js), vou mudar o display do `plannedReps` para um formato mais óbvio (ex.: badge/“Meta: X”) no row da série, sem atrapalhar o input.
- O cálculo continuará vindo de `plannedSet?.reps ?? ex?.reps`.

## 3) Harmonizar o nome do treino no topo
- Ajustar o header sticky do ActiveWorkout para:
  - título centralizado (ou 2 linhas com clamp) e sem “metade cortada” no mobile;
  - timer alinhado de forma consistente.

## 4) Remover números no canto inferior direito (todas as telas)
- Remover o `<DeployBadge />` do root layout em [layout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/layout.js) para não aparecer mais em nenhuma rota.

## Validação
- Conferir no mobile: notas visíveis por exercício, meta de reps visível por série, header harmonioso e sem badge no canto.
