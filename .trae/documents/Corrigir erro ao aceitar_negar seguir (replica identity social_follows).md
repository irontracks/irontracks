O erro do print (“cannot update table \"social_follows\" because it does not have a replica identity and publishes updates”) acontece quando o Postgres precisa enviar **UPDATE/DELETE** para o Realtime/publication, mas a tabela **não tem Replica Identity** (normalmente resolvido com **PRIMARY KEY** ou `REPLICA IDENTITY FULL`).

No nosso caso:
- O endpoint `/api/social/follow/respond` faz `.update({ status: 'accepted' })` e `.delete()` em `social_follows`.
- A migration `20260117193000_social_system.sql` adiciona `social_follows` ao `supabase_realtime` publication, mas a tabela foi criada **sem primary key** (apenas UNIQUE), então UPDATE/DELETE podem falhar com esse erro.

## Plano
1) **Criar uma migration nova para corrigir o schema de social_follows**
- Adicionar `PRIMARY KEY (follower_id, following_id)` em `public.social_follows` (idempotente).
- Opcional: remover o UNIQUE antigo (redundante) se existir, para evitar duplicidade de constraints.
- (Alternativa caso prefira algo mais simples/rápido): `ALTER TABLE public.social_follows REPLICA IDENTITY FULL;`.

2) **Aplicar a migration no Supabase remoto/local**
- Rodar o push de migrations para o Supabase que o app usa (o mesmo do `.env.local`).

3) **Validar o fluxo no app**
- Abrir o modal “Solicitação para seguir”.
- Clicar **Aceitar** e **Negar** e confirmar que não aparece mais o erro e que o status muda/deleta corretamente.

4) **(Opcional) Melhorar mensagem de erro no modal**
- Se ainda ocorrer erro de banco, exibir mensagem mais clara (“Faltando primary key/replica identity na social_follows”) ao invés do erro cru.

Se você confirmar, eu implemento a migration (opção PK + idempotência) e faço a validação completa no /dashboard.