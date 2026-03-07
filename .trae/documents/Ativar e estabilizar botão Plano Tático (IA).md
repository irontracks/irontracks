## Objetivo
Fazer o botão “Plano Tático (IA)” realmente gerar e exibir o plano na tela, com feedback claro (carregando/erro) e sem depender do usuário abrir “Detalhes” manualmente.

## Diagnóstico
- Hoje o plano só é renderizado quando `selectedAssessment === assessment.id` (dentro de “Detalhes”), então o usuário clica e “não vê nada”.
- Em ambientes sem `GOOGLE_GENERATIVE_AI_API_KEY`, a IA não roda e cai no fallback; isso precisa ficar explícito na UI.

## Mudanças no Frontend (AssessmentHistory)
- Ao clicar em “Plano Tático (IA)”, abrir automaticamente o painel “Detalhes” da avaliação clicada (`setSelectedAssessment(assessment.id)`).
- Garantir que o bloco do plano apareça imediatamente com estado “Gerando plano…”.
- Exibir erro na UI quando `res.ok === false` (hoje pode ficar pouco visível).
- (Opcional) Guardar o plano por `assessment.id` como já faz, mas também rolar a tela até o bloco do plano para ficar evidente.

## Mudanças no Backend (generateAssessmentPlanAi)
- Melhorar mensagens quando dados essenciais estiverem faltando (ex.: peso/altura/idade/%gordura): retornar `ok:true` com um plano curto explicando o que falta e `usedAi:false`, para não parecer “quebrado”.
- Quando a `GOOGLE_GENERATIVE_AI_API_KEY` estiver ausente, retornar fallback com um aviso explícito (exibido na UI) de que está usando modo não-IA.

## Configuração (para a IA de fato)
- Verificar que `GOOGLE_GENERATIVE_AI_API_KEY` está definida no ambiente (local e Vercel). Sem isso, o plano funciona em modo fallback.

## Validação
- Caso 1: avaliação completa com API key → plano gerado e exibido ao clicar.
- Caso 2: avaliação incompleta → UI mostra quais campos faltam.
- Caso 3: sem API key → UI mostra fallback + aviso “IA desativada neste ambiente”.

Se você confirmar, eu implemento essas mudanças e valido no navegador.