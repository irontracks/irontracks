## Por que sumiu
- A “marca d’água” (reps/RPE sugeridos aparecendo dentro do input) está implementada na versão [ActiveWorkout 2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout%202.js#L595-L767), que calcula `plannedReps/plannedRpe` e renderiza um overlay absoluto no input.
- O app que está rodando no deploy atual importa o componente “oficial” [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L498-L529) via [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js#L39-L40) — e nessa versão os inputs de reps/RPE não têm overlay (só `placeholder`).

## Impacto na Apple Review
- Se a build iOS está apontando para um site remoto (Capacitor com `server.url`), qualquer mudança no web pode ser vista pelo revisor. Então dá para corrigir agora, mas o ideal é fazer uma mudança pequena e segura, e evitar mexer em fluxos críticos enquanto estiver “Em revisão”.

## Plano de correção (mínima e segura)
1. Portar para [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js) a mesma lógica de:
   - calcular `plannedReps` e `plannedRpe` a partir de `getPlannedSet(ex, setIdx)` e fallback `ex.reps/ex.rpe` (como em [ActiveWorkout 2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout%202.js#L595-L717)).
   - renderizar o overlay no input (wrapper `relative` + `<div>` absoluto à direita).
2. Garantir que isso funciona tanto no layout mobile quanto desktop (os dois blocos existem no `ActiveWorkout.js`).
3. Validar localmente:
   - Treino com `setDetails`/`reps` planejados mostra o número sugerido (sem atrapalhar digitação).
4. Publicar no deploy atual e confirmar no `https://app-iron-tracks.vercel.app`.

## Alternativa (rápida, porém mais arriscada)
- Trocar o import para usar `ActiveWorkout 2.js`. Não recomendo porque pode trazer diferenças colaterais entre versões.
