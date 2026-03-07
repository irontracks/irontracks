## Diagnóstico
- Você não está vendo o botão porque ele fica **atrás de uma feature flag**.
- No seu `.env.local` **não existe** `NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO` nem `ENABLE_EXECUTION_VIDEO`, então o componente retorna `null` e não renderiza.

## Onde deveria aparecer
- No Treino Ativo, em cada card de exercício, canto direito do cabeçalho (ao lado do botão “Vídeo”/setinha).

## Plano (passo a passo)
1) **Adicionar flags no `.env.local`**
   - `NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO=true`
   - `ENABLE_EXECUTION_VIDEO=true`
2) **Reiniciar o dev server** (`npm run dev`) para o Next recarregar as envs (em especial `NEXT_PUBLIC_*`).
3) **Recarregar a página** (hard refresh) e conferir se aparece o botão pequeno “Enviar” (ícone de vídeo).
4) **Teste rápido do clique**
   - Se ao clicar aparecer erro `no_teacher_assigned`, vou ajustar/validar no banco que o aluno logado tem `teacher_id` atribuído na tabela `students`.
5) **(Opcional) Deixar mais “à prova de erro”**
   - Se quiser, eu posso fazer o botão aparecer com tooltip “Função desativada” quando as flags estiverem off (sem remover a possibilidade de desligar).