## O que quebrou (diagnóstico)
- O avatar do topo e “perfil completo” dependem do objeto `user` no cliente.
- Hoje o `user.photoURL` e `user.displayName` são preenchidos **só** via `user.user_metadata` (Google `picture`/`avatar_url`) e **não** usam `profiles.photo_url` / `profiles.display_name`.
  - Para contas antigas (ou contas que não têm `picture` no metadata), isso faz o avatar sumir e o nome ficar genérico.
- O “Nenhum treino criado” continua porque o fetch pode estar rodando com um client Supabase “novo” (criado na hora) e/ou sem sessão pronta, ou caindo em algum erro silencioso — e aí `workouts` fica vazio.

## Correções
### 1) Restaurar display name e avatar a partir de `profiles`
- Ajustar o `useEffect` que monta `nextUser` em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js) para:
  - priorizar `initialProfile.display_name` sobre `user_metadata.full_name/name`
  - priorizar `initialProfile.photo_url` sobre `user_metadata.picture/avatar_url`

### 2) Sync de perfil no client deve atualizar o `user` (não só checar “incompleto”)
- Na rotina “Sync Profile Separately”, mudar o select de `profiles` para pegar `display_name, photo_url` e:
  - se vierem preenchidos, atualizar `setUser(prev => ({...prev, displayName, photoURL }))`
  - manter `profileIncomplete` funcionando

### 3) Tornar o fetch de treinos confiável
- No `fetchWorkouts`, parar de criar um `createClient()` novo e reutilizar o client já existente (`useRef(createClient()).current`).
- Se ainda vier vazio/erro:
  - fallback: chamar `GET /api/workouts/list` (server-side, com cookies) e hidratar exercícios/séries a partir daí.

## Validação
- Logar com:
  - conta antiga (sem metadata de foto)
  - conta com Google
- Conferir:
  - avatar volta no topo
  - nome/perfil não aparece como “incompleto” indevidamente
  - lista de treinos volta a carregar
- Rodar lint/build.
