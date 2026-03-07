## O que está acontecendo (por que o IronScanner falha)
- O IronScanner depende da variável **GOOGLE_GENERATIVE_AI_API_KEY**.
- Quando ela não existe no ambiente (Preview/Production), o backend responde `API de IA não configurada` (veja [iron-scanner-actions.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/iron-scanner-actions.ts#L18-L27)).
- O modelo é opcional: se você não setar **GOOGLE_GENERATIVE_AI_MODEL_ID**, ele usa `gemini-2.5-flash` por padrão.

## Passo a passo (leigo) para configurar
### 1) Criar a chave do Gemini
1. Abra **Google AI Studio**.
2. Vá em **API keys**.
3. Clique em **Create API key**.
4. Copie a chave.

### 2) Colocar a chave na Vercel (Preview e Production)
1. Vercel → seu projeto → **Settings → Environment Variables**.
2. Crie a variável:
   - **Name:** `GOOGLE_GENERATIVE_AI_API_KEY`
   - **Value:** (cole sua chave)
   - **Environment:** marque **Preview** e **Production**
3. (Opcional) se quiser fixar modelo:
   - **Name:** `GOOGLE_GENERATIVE_AI_MODEL_ID`
   - **Value:** `gemini-2.5-flash`
   - **Environment:** Preview e Production
4. Clique em **Save**.
5. Vá em **Deployments** e faça **Redeploy** do Preview.

### 3) Configurar local (se você usa no seu PC)
- No arquivo `.env.local`, adicionar:
  - `GOOGLE_GENERATIVE_AI_API_KEY=...`
  - (opcional) `GOOGLE_GENERATIVE_AI_MODEL_ID=gemini-2.5-flash`

### 4) Testar
- Abra o Preview, clique em **Importar Treino (Foto/PDF)** e envie uma imagem.
- Se ainda falhar, o erro vai vir no popup e também na resposta do endpoint `/api/iron-scanner`.

## O que eu vou ajustar no projeto (se você confirmar)
1) Melhorar o feedback do IronScanner para orientar exatamente qual env está faltando.
2) Atualizar o `DEPLOY.md` com um bloco “Configurar Gemini (IronScanner)” para você não esquecer em próximos deploys.
3) Rodar build e garantir que não quebrou nada.

## Nota importante (segurança)
- Essa chave **não pode** ser `NEXT_PUBLIC_*` e não deve ir para o frontend; ela fica só na Vercel (server-side). 

Quando você falar **“vamos para a parte do vídeo”**, eu sigo com a implementação de **Vídeos automáticos por exercício**.