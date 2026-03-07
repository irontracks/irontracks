O `.env.local` vale **só para localhost**. No deploy (Vercel/GitHub), as envs precisam estar configuradas no **ambiente de produção/preview** do Vercel (Project Settings → Environment Variables). Então o caminho mais provável é: o ambiente onde você está olhando o relatório não tem a API key (ou nem está com o código novo no ar).

## Passo 1 — Confirmar se o código novo está no ar
- No ambiente que você abriu o relatório, acesse no browser:
  - `https://SEU-DOMINIO/api/calories/estimate`
- Resultado esperado:
  - **404** → não está no deploy com a rota nova (PR não foi publicado/mergeado)
  - **405** → rota existe (GET não permitido) e o código novo está no ar

## Passo 2 — Confirmar se o endpoint está usando Gemini ou fallback
- Estando logado, rode no console:
  ```js
  fetch('/api/calories/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: window.__lastSession || null })
  }).then(r => r.json()).then(console.log)
  ```
- Se voltar `source: "fallback"` mesmo com peso, os motivos mais comuns:
  - envs não estão no Vercel (prod/preview)
  - endpoint não encontrou o peso daquele usuário no DB do ambiente
  - falha/timeout no Gemini (aí cai no fallback)

## Passo 3 — Se o problema for env do Vercel
- Copiar as envs do `.env.local` para o Vercel:
  - `GOOGLE_GENERATIVE_AI_API_KEY`
  - `GOOGLE_GENERATIVE_AI_MODEL_ID` (opcional)
- Fazer um **redeploy** (mesmo sem mudar código) para aplicar as envs.

## Passo 4 — Se o problema for peso (ambiente errado)
- Validar se a avaliação com peso existe no **mesmo projeto Supabase** do deploy.
- Se necessário, ajustar o endpoint para buscar assessment pela data do treino (em vez do mais recente) — sem mudar layout.

Se você aprovar, eu sigo esse roteiro e, se o problema for código (ex.: endpoint caindo sempre no fallback), eu corrijo diretamente no backend sem nenhuma alteração visual.