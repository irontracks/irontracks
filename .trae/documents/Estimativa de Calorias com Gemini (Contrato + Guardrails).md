Vou implementar a estimativa de calorias com Gemini **sem mudar nada no layout** (nenhum texto novo, nenhum componente novo, nenhuma mudança visual). A única mudança será interna: de onde vem o número de kcal.

## 1) Contrato (JSON) e validação
- Definir um payload mínimo (peso do usuário + tempo + volume + opcional bike kcal).
- Definir resposta JSON estrita: `kcal`, `kcalMin`, `kcalMax`, `confidence`, `assumptions`.
- Validar ranges (MET/kcal/duração) e garantir fallback.

## 2) Endpoint server-side (seguro)
- Criar `POST /api/calories/estimate`.
- Regras:
  - Se existir `outdoorBike.caloriesKcal` → retornar esse valor.
  - Senão → chamar Gemini 2.5 Flash para retornar JSON (temperature baixa).
  - Se Gemini falhar/retornar inválido → usar o cálculo atual (volume*0.02 + minutos*4).

## 3) Integração “silenciosa” (sem UI)
- Substituir o cálculo atual (em report/story/pdf) por uma função utilitária `getKcalEstimate(session)` que:
  - tenta endpoint
  - cai no fallback local
- O número exibido continuará exatamente no mesmo lugar e com o mesmo estilo.

## 4) Log/privacidade
- Não enviar email/ids.
- Não logar payload nem resposta.

Se você aprovar, eu começo criando o endpoint + utilitário e em seguida substituo as 3 ocorrências atuais do cálculo (WorkoutReport, StoryComposer, buildHtml), sem alterar nenhuma UI.