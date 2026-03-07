## Requisito (do jeito que você pediu)
- A IA deve **receber exatamente as respostas do modal** e gerar um treino **obedecendo fielmente**.
- O texto da caixa **restrições/observações** deve ser tratado como **prioridade máxima** (ex.: “dor no ombro direito”, “priorizar máquinas Smart Fit”, “evitar barra”, etc.).

## O que vou fazer
### 1) Enviar o objeto do modal “as-is” para a IA
- No handler do Wizard (onde hoje chama `generateWorkoutFromWizard(answers)`), vou trocar por um `fetch('/api/ai/workout-wizard', { body: JSON.stringify({ answers }) })`.
- O backend recebe `{ answers }` no formato atual do modal, sem perder campos.

### 2) Criar a rota `/api/ai/workout-wizard` usando Gemini 2.5 Flash
- Arquivo novo: `src/app/api/ai/workout-wizard/route.ts`.
- Modelo: `process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'`.

### 3) Prompt com “hierarquia de prioridades” explícita
- O prompt vai conter uma seção “REGRAS ABSOLUTAS” e a primeira delas será:
  - “Siga **à risca** `answers.constraints` (restrições/observações). Não ignore. Se houver conflito com `answers.goal/split`, adapte o treino para cumprir as restrições.”
- Vou exigir que a IA retorne um JSON com:
  - `title`
  - `exercises[]` (name, sets, reps, restTime, rpe, notes)
  - `constraintsApplied[]` (lista de bullets explicando COMO ela atendeu cada observação do usuário)
  - `rejectedItems[]` (se ela evitou algo por causa das restrições)

### 4) Validação automática (para impedir “ignorou tudo”)
Depois que a IA responder, o servidor valida:
- **Formato** (JSON parseável e com campos obrigatórios).
- **Restrições** (ex.: se `constraints` menciona ombro, bloquear exercícios de risco como overhead press/dips/upright row e forçar substituição).
- **Máquinas**: se `constraints` mencionar “máquinas / smart fit”, exigir maioria de exercícios em máquina/cabo.
- Se falhar: o servidor faz **retry de correção** (“Você ignorou X. Refazer obedecendo X, mantendo objetivo e tempo.”).
- Se falhar de novo: fallback controlado (ver item 6).

### 5) Evitar treinos iguais para iniciante vs avançado
Quando o usuário pedir 2 treinos (iniciante e avançado):
- A rota aceita `variants` e retorna dois treinos.
- Regra: o “avançado” deve diferir do “iniciante” em pelo menos N exercícios **e** em estrutura (volume/sets/método). Se ficar igual, retry automático.

### 6) Fallback (para não quebrar a experiência)
- Se a IA estiver fora do ar, retornar inválido ou violar restrições mesmo após retries:
  - Gerar com o gerador atual `generateWorkoutFromWizard` e aplicar um “filtro de segurança” básico em cima (tirar exercícios proibidos por restrição + substituir por alternativas de máquina/cabo quando solicitado).

### 7) Verificação
- Testes manuais com os mesmos comandos que você usou:
  - Iniciante vs avançado (não podem ser iguais)
  - “priorizar máquinas Smart Fit”
  - “dor no ombro direito”
- Verificar que o JSON sempre volta e que `constraintsApplied[]` explica como atendeu suas observações.

Se você confirmar, eu implemento essa rota + integração no modal mantendo o fallback, e a IA passa a ser o gerador principal do Wizard.