## Garantia de segurança (como evitar quebrar de novo)
- Vou fazer uma correção **mínima e reversível**, sem mexer em render/UI principal.
- Não vou alterar schema, RLS, nem fluxos de login.
- Vou apenas impedir que o dashboard faça chamadas `profiles` no browser quando o Supabase client estiver sem sessão (isso é o que gera o 403).
- Validação: lint/build + smoke test no dashboard (menu/avatar/RP/Stories/records).

## Correção (passo a passo)
### 1) Eliminar as chamadas `profiles` no client do dashboard (sem trocar arquitetura)
- No [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L1071-L1138):
  - Trocar o `update last_seen` e o `select display_name/photo_url` por lógica que **não chama `supabase.from('profiles')`**.
  - Para “perfil incompleto”: usar `initialProfile.display_name` + dados já retornados pelo `/api/dashboard/bootstrap` (que já roda server-side e não dá 403).
  - Resultado: some o 403 sem tocar no resto.

### 2) (Opcional, mas seguro) Atualizar `last_seen` via server endpoint
- Criar `POST /api/profiles/ping` (server-side com cookies): valida usuário e atualiza `profiles.last_seen`.
- No client, chamar `fetch('/api/profiles/ping')`.
- Se eu implementar, fica **isolado** e não interfere no dashboard render.

## Validação (antes de te entregar)
- Abrir `/dashboard` e confirmar:
  - avatar abre menu
  - Ferramentas abre
  - RP/Rank/Novos Recordes aparecem
  - console sem 403 para `profiles`
- Rodar `npm run lint` e `npm run build`.

Se você aprovar, eu aplico o passo 1 agora (é o mais seguro) e só faço o passo 2 se continuar precisando do `last_seen`.