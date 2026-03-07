Vou implementar exatamente os 3 blocos que você pediu, de um jeito seguro e rastreável (com auditoria) e sem apagar coisas “por engano”.<mccoremem id="01KH4BK07S82ZPQFBVJC0N5ANK" />

Atenção: no seu projeto eu encontrei 2 sistemas reais de foto/vídeo:
- **Stories** (bucket `social-stories`) — já tem `expires_at` e endpoints prontos: [stories/list](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/stories/list/route.ts), [stories/delete](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/stories/delete/route.ts)
- **Mídia no chat** (bucket `chat-media`) — upload via [signed-upload](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/storage/signed-upload/route.ts) e existe um purge total: [purge-chat-media](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/storage/purge-chat-media/route.ts)

A partir disso, o plano fica assim:

## 1) Rejeitar solicitação: apagar de verdade + auditoria
### O que você vai ver
- Quando você clicar em **Recusar** no Admin, a solicitação some da lista.
- E fica registrado num “histórico” (auditoria) para você rastrear: quem recusou, quando e por quê.

### O que vou fazer (técnico, mas simples)
1. Criar uma tabela de auditoria `audit_log` (append-only) para registrar ações importantes.
2. Alterar o endpoint de admin [access-requests/action](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/admin/access-requests/action/route.ts) para, ao **Recusar**:
   - Registrar no `audit_log` (ação “reject”).
   - **Deletar o registro** da tabela `access_requests` (delete permanente).
   - Se existir um usuário já criado no Auth para esse e-mail **e ele ainda NÃO estiver aprovado**, deletar também:
     - `profiles` desse usuário
     - o usuário em `auth.users`
     - (opcional) o registro em `students` ligado a esse e-mail
   - Segurança: nunca deletar admin/professor e nunca deletar alguém já aprovado.

## 2) Expiração 24h automática (a cada 1 hora) para fotos/vídeos
### O que você vai ver
- Após 24h, stories e mídias efêmeras do chat somem sozinhas.
- O arquivo também some do Storage para não ficar gastando espaço.

### Como isso vai funcionar (bem direto)
Vou separar em 2 fases porque é o jeito mais seguro:

**Fase A — Marcar o que expirou no banco**
1. Criar uma função no banco que encontra tudo com mais de 24h e marca para remoção.
   - Stories: já existe `expires_at`, então é só filtrar `expires_at <= now()`.
   - Chat: hoje a mídia fica dentro do `content` das mensagens; vou criar um campo/estrutura para guardar `media_path` e `expires_at` de forma consultável.

**Fase B — Apagar do Storage e limpar registros relacionados**
2. Criar um job agendado (rodando 1x por hora) que:
   - Remove os arquivos no Storage (`social-stories` e `chat-media`).
   - Remove do banco todos os registros ligados (likes, comentários, views, mensagens, etc.).

### Onde vou implementar o job (cron)
- Vou implementar como **rotina agendada** que roda sozinha.
- Opção robusta no Supabase:
  - criar uma tabela “fila de deleção” (queue)
  - e uma **Edge Function** (com service role) que roda de hora em hora para executar as deleções no Storage.

## 3) Delete manual do post: cascata + confirmação + soft delete 30 dias
### O que você vai ver
Quando um usuário clicar em “Deletar meu post”:
1. Aparece uma confirmação: “isso é irreversível”.
2. Ao confirmar:
   - O post some do app na hora.
   - Fotos/vídeos do post são apagados do Storage.
   - Comentários/curtidas/views e outros registros relacionados são removidos.
3. Mesmo assim, como “backup”, o sistema guarda uma cópia por 30 dias (soft delete).

### Como vou garantir o soft delete 30 dias sem quebrar o banco
1. Criar uma tabela de “lixeira” (backup) `soft_delete_bin`:
   - Guarda um snapshot (JSON) do post e dos registros relacionados.
   - Guarda `media_paths` e `purge_after = now() + 30 days`.
2. No momento do delete manual:
   - Primeiro grava o snapshot na `soft_delete_bin`.
   - Depois faz a deleção em cascata (DB + Storage).
3. Criar um job diário/horário que faz a limpeza definitiva da `soft_delete_bin` quando passar `purge_after`.

### Onde mexe no código
- **Stories:** já tem delete em [stories/delete](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/stories/delete/route.ts); vou expandir para:
  - confirmar no frontend
  - chamar uma rota segura que cria snapshot + apaga dependências + apaga Storage
- **Chat:** vou criar delete granular (hoje só existe purge total em [purge-chat-media](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/storage/purge-chat-media/route.ts)).

## Validação (o que vou testar)
1. Criar story com mídia e confirmar que expira em 24h (simulando data no banco para testar rápido).
2. Confirmar que o job horário apaga o arquivo do Storage e os registros relacionados.
3. Deletar manualmente um story e confirmar:
   - sumiu do app
   - arquivo removido do Storage
   - likes/comments/views removidos
   - snapshot na `soft_delete_bin`
4. Recusar uma solicitação e confirmar:
   - request removida
   - auditoria gravada
   - se tiver user não aprovado, conta removida

Se você aprovou esse plano, eu parto para implementar em código + migrations, com tudo automatizado e com trilha de auditoria.