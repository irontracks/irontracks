## Resposta rápida (GitHub)
- Sim: você pode usar o repositório que já está no GitHub. No outro PC é só clonar o repo e rodar `npm install` + copiar seu `.env.local`.

## Diagnóstico (por que hoje sai “D - … (Dia X)”)
- No modo “program” do Wizard, ao salvar, o app faz: `finalTitle = `${baseTitle} (Dia ${i + 1})`` em [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js#L2155-L2166).
- Ou seja: o prefixo “D - …” vem do `draft.title` que a IA devolve, e o “(Dia X)” é anexado pelo app.

## Objetivo
- Fazer os títulos do Wizard (IA) ficarem padronizados como seus treinos manuais: `A - ... (SEGUNDA)`, `B - ... (TERÇA)` etc.

## Implementação
### 1) Centralizar a formatação do título do “programa”
- Criar uma função (local no IronTracksAppClient 3.js ou util em `src/utils/workoutTitle.js`), por exemplo `formatProgramWorkoutTitle(draftTitle, index)`.
- Regras dessa função:
  - **Letra**: `A, B, C, D, E, F` conforme o índice do treino (0..5).
  - **Dia da semana**: mapear `index` para `SEGUNDA, TERÇA, QUARTA, QUINTA, SEXTA, SÁBADO` (se vier 6 dias).
  - **Base title**: limpar do `draft.title` qualquer prefixo já existente (ex.: `D -`) e remover sufixos já existentes (`(Dia X)` ou `(... )`) para evitar duplicação.
  - Montar no padrão final: `"{LETRA} - {BASE} ({DIA_SEMANA})"`.

### 2) Aplicar no salvamento do Wizard (program)
- Substituir `finalTitle = `${baseTitle} (Dia ${i + 1})`` por `finalTitle = formatProgramWorkoutTitle(baseTitle, i)` em [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js#L2155-L2166).
- Isso garante que os próximos planos gerados já nasçam padronizados.

### 3) (Opcional, recomendado) Melhorar o prompt da IA
- Ajustar o prompt do endpoint `/api/ai/workout-wizard` (modo program) para pedir explicitamente que o `title` venha **sem** letra e **sem** dia (ex.: apenas `Empurrar`, `Pernas`, etc.).
- O app continua sendo a fonte de verdade do formato `A - ... (SEGUNDA)`.

### 4) (Opcional) Padronizar os treinos IA que já existem
- Criar um botão “Padronizar nomes do plano IA” nas Ferramentas do dashboard, que:
  - detecta títulos no padrão antigo (ex.: contém `(Dia 1)`…)
  - e renomeia em lote com a mesma função `formatProgramWorkoutTitle`.

## Validação
- Gerar um plano de 3–6 dias pelo Wizard e conferir:
  - títulos ficam `A - ... (SEGUNDA)` etc.
  - não cria duplicações de letra/dia.
- Rodar lint/build.
