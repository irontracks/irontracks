## Avaliação da Ideia
- É uma das features com mais “cara de premium”: transforma intenção ("quero treinar X") em um treino pronto, sem atrito.
- Para ficar profissional no nível IronTracks, o segredo é: **poucas perguntas bem escolhidas**, **preview claro**, e **sempre permitir edição** no editor atual.

## Onde Encaixa no App (ponto certo)
- O botão **Novo Treino** chama `onCreateWorkout` no [StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx#L251-L271).
- Esse handler é `handleCreateWorkout` no container [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L1685-L1686) e hoje abre direto o editor.
- O melhor encaixe é: **interceptar `handleCreateWorkout` para abrir o Wizard**. No “finalizar”, o wizard preenche `currentWorkout` e abre o editor (`view='edit'`).

## Wizard “Premium Plus” (UX)
- **Step 0 (Escolha rápida)**: “Criar automaticamente” / “Criar manualmente”.
- **Step 1 (Objetivo)**: Hipertrofia / Força / Condicionamento / Manutenção.
- **Step 2 (Divisão e frequência)**: Full body 3x, Upper/Lower 4x, PPL 6x, etc.
- **Step 3 (Tempo e equipamento)**: 30/45/60 min + Casa/Academia + halteres/barra/máquinas.
- **Step 4 (Preferências e restrições)**: nível (iniciante/intermediário/avançado), foco (ex.: pernas/peito/costas), limitações (ex.: dor no joelho/ombro).
- **Preview final**: mostra o treino gerado (exercícios, séries, reps, descanso e nota de execução). Botões: “Abrir no editor” e “Gerar outra variação”.

## Lógica de Geração (versão 1, robusta)
- Implementar um **gerador baseado em regras** (sem IA) com biblioteca de exercícios “curada” (push/pull/legs/fullbody) e parâmetros por objetivo/nível/tempo.
- Saída sempre no formato que o editor já entende: `{ title, exercises: [...] }`.
- Ajustes automáticos:
  - Se tempo < 45 min: reduzir nº de exercícios e priorizar compostos.
  - Se nível iniciante: ranges conservadores (ex.: 2–3 séries, reps moderadas, foco técnica).
  - Se restrição (ex.: joelho): trocar padrões (agachamento pesado → variações seguras).

## Integração com o Fluxo Atual
- No “Abrir no editor”, fazemos `setCurrentWorkout(generated)` e `setView('edit')`.
- O usuário salva como template normalmente (já usa RPC `save_workout_atomic`).

## Checklist/“Memória” das Mudanças (pedido seu)
- Criar um arquivo único **CHECKLIST_FUNCIONAL.md** no projeto com:
  - lista de features adicionadas
  - onde testar no app
  - passos de teste (manual) e resultado esperado
- A cada feature nova, eu atualizo esse checklist e também mantenho um resumo curto “na memória” para a gente bater item a item depois.

## Implementação (passos)
1) Criar componente `WorkoutWizardModal` (UI multi-step + preview).
2) Criar módulo `workoutAutoGenerator` com regras e presets.
3) Alterar `handleCreateWorkout` para abrir o wizard e, no finish, abrir o editor com o treino gerado.
4) Adicionar entradas no **CHECKLIST_FUNCIONAL.md** com passos de teste.
5) Validar com lint/build + teste no localhost.

Se você aprovar, eu começo pela versão 1 (gerador por regras) para entregar rápido e confiável; depois dá para evoluir para “gerar variações” e “usar histórico/check-ins como personalização fina”.