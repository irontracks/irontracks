## Confirmação (sim, está implantado)
- O botão de play **existe no treino ativo** e aparece no card do exercício quando o exercício tem `videoUrl` (ou `video_url`) preenchido: [ActiveWorkout.js:L949-L1005](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L949-L1005).
- No **editor de treino**, não tem botão de play; só existe o campo de URL do vídeo: [ExerciseEditor.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ExerciseEditor.js).

## Por que você não está vendo
- Aprovar no painel salva o vídeo como **padrão** em `exercise_library.video_url`, mas seus treinos/templates antigos continuam com `exercises.video_url` vazio. Então o `ActiveWorkout` não tem URL e não mostra o play.
- Aprovação (define padrão): [AdminPanelV2.js:L2214-L2233](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js#L2214-L2233)
- O app mapeia `videoUrl` a partir de `exercises.video_url` quando carrega o treino: [IronTracksAppClient.js:L62-L118](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L62-L118)

## Ajuste que vou implementar (para aparecer imediatamente)
1) Criar um resolver que, dado o nome do exercício, retorna `exercise_library.video_url`.
2) Ao abrir/iniciar um treino, preencher `workout.exercises[*].videoUrl` quando estiver vazio, usando o resolver.
3) (Opcional) Persistir esse preenchimento no banco para não precisar resolver de novo.
4) (Opcional) Adicionar um botão “Ver vídeo” também no ExerciseEditor.

## Validação
- Aprovar um vídeo → abrir um treino que tenha esse exercício → confirmar que o play aparece imediatamente, sem re-salvar treino.