## Objetivo
- Aluno, durante o **treino ativo**, grava/envia um **vídeo de execução** para o professor.
- Professor recebe no **Painel de Controle → Alunos → aluno** uma lista de vídeos enviados, consegue assistir e responder com uma mensagem.
- Implementação com **feature flag** para remover fácil (“Retirar função…”).

## Como vai funcionar (fluxo do usuário)
### Aluno (Treino Ativo)
1) No **ActiveWorkout** aparece um botão “Enviar vídeo ao professor”.
2) Ao tocar:
   - abre câmera (mobile) via `<input type="file" accept="video/*" capture="environment">`.
3) Ao confirmar o vídeo:
   - o app pede um “preparo de upload” no server (gera id e URL/token de upload)
   - faz upload para Storage (bucket privado)
   - finaliza/registrar envio no banco (status `pending`)
4) O aluno vê um feedback “Enviado para o professor” e o vídeo fica listado no perfil/treino (opcional).

### Professor (Painel)
1) No **AdminPanelV2 → Alunos** ao abrir o aluno, surge uma seção “Vídeos de Execução”.
2) O professor vê cards com:
   - data/hora, nome do exercício (se informado), status (`pendente` / `avaliado`)
   - botão “Assistir” (abre modal com `<video controls>` usando URL assinada)
   - campo “Resposta” + botão “Enviar”
3) Ao enviar resposta:
   - cria/abre canal DM (RPC `get_or_create_direct_channel` já existente)
   - envia mensagem para o aluno (texto + referência ao vídeo)
   - marca o item como `reviewed` (e guarda feedback no registro)

## Segurança (RLS + Storage)
### Banco (tabela de submissões)
- Criar tabela `exercise_execution_submissions` com:
  - `id uuid`, `student_user_id uuid`, `teacher_user_id uuid`, `workout_session_id/text (opcional)`, `exercise_name text (opcional)`
  - `media_path text`, `media_mime text`, `status text`, `created_at`, `reviewed_at`, `teacher_feedback text (opcional)`
- RLS:
  - aluno pode **INSERT/SELECT** onde `student_user_id = auth.uid()`.
  - professor pode **SELECT/UPDATE** onde existe vínculo em `students.user_id = student_user_id AND students.teacher_id = auth.uid()`.
  - admin tudo (usando `public.is_admin()` já existente).

### Storage (bucket privado)
- Criar bucket `execution-videos` como **public:false**.
- Upload sempre via **signed upload url** emitido pelo server (service role).
- Path estrito: `${studentUserId}/execution/${submissionId}.mp4` (ou ext real).
- Endpoint server valida:
  - usuário autenticado
  - tem professor vinculado (`students.user_id = auth.uid()` e `teacher_id` não nulo)

### Visualização do vídeo
- Sem URL pública.
- Endpoint server `POST /api/execution-videos/media` gera signed URL curta (ex.: 10 min) e só libera se:
  - requester é o aluno dono, ou
  - requester é o professor daquele aluno, ou
  - admin.

## Remoção fácil (feature flag)
- Implementar flag:
  - `NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO=true|false` (UI)
  - `ENABLE_EXECUTION_VIDEO=true|false` (server)
- Se flag desligada:
  - botão não aparece
  - rotas retornam `404`/`disabled`
  - painel não mostra a seção
- Código isolado em:
  - componente novo `ExecutionVideoCapture` (usado apenas no ActiveWorkout)
  - rotas `/api/execution-videos/*` e `/api/storage/execution-videos/*`
  - migração única do Supabase
  Assim, “Retirar função…” vira: desligar flag + apagar esses arquivos.

## Passo a passo de implantação (técnico)
1) **Banco (Supabase)**
   - Migration criando `exercise_execution_submissions` + índices + RLS.
   - Migration criando bucket `execution-videos` (ou endpoint `ensure-bucket` como já existe) + políticas se necessário.
2) **APIs (Next)**
   - `POST /api/execution-videos/prepare` → cria registro `pending_upload`, retorna `{submissionId, path, token}`.
   - `POST /api/execution-videos/complete` → marca como `pending` (upload concluído).
   - `POST /api/execution-videos/media` → signed URL para playback.
   - `GET /api/teacher/students/{studentId}/execution-videos` → lista para o professor/admin.
   - `POST /api/teacher/execution-videos/{id}/review` → salva feedback/status.
3) **Aluno (UI)**
   - Em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js) adicionar botão + componente de captura.
   - Reusar padrão de upload já existente (ex.: `uploadToSignedUrl` como em `StoriesBar.tsx`/`ChatDirectScreen.js`).
4) **Professor (UI)**
   - Em [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js) dentro do aluno selecionado:
     - fetch lista dos vídeos
     - modal player com signed URL
     - campo de feedback + enviar mensagem
   - Mensagem via DM reutilizando o sistema existente (`direct_channels`/`direct_messages`).
5) **Testes/Validação**
   - Teste no iPhone/Android: captura via câmera, upload, status.
   - Professor: abre aluno, assiste vídeo, responde, item vira `reviewed`.
   - Segurança: aluno não acessa vídeo de outro aluno; professor só dos seus.
   - Feature flag OFF: nada aparece e APIs retornam disabled.

## O que eu vou reutilizar do sistema atual
- Mecanismo de **signed upload** e padrão de storage (já existe em `/api/storage/signed-upload` e `StoriesBar.tsx`).
- Relação professor↔aluno via `students.user_id` e `students.teacher_id` (já usada nas RLS de treinos).
- Mensageria via **Direct Messages** (`get_or_create_direct_channel` + `direct_messages`).
- Painel do professor já existente (`AdminPanelV2`).

Se você confirmar esse plano, eu implemento em pequenos arquivos isolados + feature flag, para você poder remover sem risco.