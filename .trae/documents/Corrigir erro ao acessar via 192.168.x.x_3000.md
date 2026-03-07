## Diagnóstico (mais provável)
- O script de dev não define hostname, então o Next tende a bindar em localhost e o acesso via IP LAN pode falhar: [package.json](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/package.json#L5-L12).
- Se a home abre mas o login falha, o OAuth usa `redirectTo` baseado no origin da requisição; ao acessar por `http://192.168.100.2:3000`, o callback vira `http://192.168.100.2:3000/auth/callback`, que precisa estar allowlisted no Supabase/Google: [auth/login route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/login/route.ts#L15-L75) e [auth/callback route.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/callback/route.js#L17-L40).

## Plano de correção (código)
### 1) Expor o dev server na rede
- Ajustar `package.json` para rodar `next dev` com hostname `0.0.0.0` (mantendo porta 3000), garantindo acesso via `192.168.100.2:3000`.

### 2) Fixar origem/redirect do OAuth em dev (sem depender do host do request)
- Adicionar suporte a uma env `IRONTRACKS_PUBLIC_ORIGIN` (ex.: `http://192.168.100.2:3000`).
- Em `src/app/auth/login/route.ts` e `src/app/auth/callback/route.js`, usar essa env como prioridade para montar `safeOrigin` (com validação), e só cair para `request.url.origin` se a env não existir.

## Ajuste necessário fora do código (Supabase/Google)
- No Supabase Auth, adicionar na allowlist de redirect URLs:
  - `http://192.168.100.2:3000/auth/callback`
- Se estiver usando Google OAuth, adicionar o mesmo callback permitido no console do Google.

## Validação
- Subir `npm run dev` e testar:
  - abrir `http://192.168.100.2:3000/` em outro dispositivo
  - fazer login e confirmar que retorna para `/dashboard` sem erro
  - confirmar que `localhost:3000` continua funcionando
