## Função
- Aluno grava e envia vídeo de execução durante o treino ativo.
- Professor recebe no Painel → Alunos → aluno, assiste e responde.
- Remoção simples via feature flag.

## Fluxo do Usuário
- Aluno: botão “Enviar vídeo ao professor” no ActiveWorkout → captura (camera) → upload → envio registrado.
- Professor: seção “Vídeos de Execução” no aluno → assistir (URL assinada) → responder (DM) → marca como revisado.

## Segurança
- RLS: tabela `exercise_execution_submissions` com políticas (aluno self, teacher seu aluno, admin full).
- Storage: bucket privado `execution-videos`; upload via signed URL; path `${studentUserId}/submissionId/filename`.
- Media: endpoint de signed URL só para aluno dono, professor vinculado ou admin.

## Passos Técnicos
1) Migrations Supabase:
   - Tabela `exercise_execution_submissions` (+ índices, constraints, triggers RLS-friendly) [ok].
   - Bucket privado `execution-videos` + policies [ok].
2) APIs Next:
   - `POST /api/execution-videos/prepare` (cria registro pendente e assina upload).
   - `POST /api/execution-videos/complete` (marca arquivo e status pending).
   - `POST /api/execution-videos/media` (gera URL assinada curta para playback).
   - `GET /api/teacher/students/{studentId}/execution-videos` (lista para professor/admin).
   - `POST /api/teacher/execution-videos/{id}/review` (aprovar/rejeitar + feedback, e enviar DM).
3) UI Aluno (ActiveWorkout):
   - Componente `ExecutionVideoCapture` (flag `NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO`).
   - Usa `<input type="file" accept="video/*" capture="environment">` e fluxo de signed upload similar a Stories/Chat.
4) UI Professor (AdminPanelV2):
   - Seção “Vídeos de Execução” no aluno selecionado: listar, assistir, responder.
   - Resposta via DM aproveitando `get_or_create_direct_channel` + `direct_messages`.
5) Remoção rápida:
   - Flags `NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO` e `ENABLE_EXECUTION_VIDEO` desativam UI/rotas sem tocar no resto.
6) Validação:
   - Teste mobile (captura/upload), professor (play/resposta), RLS (acesso restrito), build/lint OK.

Se aprovado, sigo com a implementação conforme os passos acima (arquivos isolados + feature flag).