# Deploy seguro (Vercel automático via GitHub)

Este projeto usa o modo mais simples e seguro: **Vercel conectado ao GitHub**.
Você testa em **Preview** via Pull Request e só depois publica em **Production** ao fazer merge na `main`.

## 1) Configurar a Vercel (uma única vez)
1. Entre em `https://vercel.com` e faça login.
2. Clique em **Add New → Project**.
3. Selecione o repositório do IronTracks no GitHub.
4. Confirme a branch de produção (recomendado: `main`).
5. Clique em **Deploy**.

## 1.1) (Obrigatório) Fazer login funcionar no Preview (Supabase)
Se no Preview aparecer **Erro de autenticação** com `missing_env`, significa que faltam as variáveis do Supabase no ambiente Preview.

### A) Vercel: configurar variáveis no ambiente Preview
1. Vercel → Project → **Settings → Environment Variables**.
2. Adicione (ou confirme) marcando **Preview** (e também **Production** se quiser):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Clique em **Save**.
4. Vá em **Deployments** → abra o Preview → **Redeploy**.

### B) Supabase: onde pegar os valores
1. Supabase → seu projeto → **Project Settings → API**.
2. Copie:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### C) Supabase: permitir o redirect do Google no Preview
1. Supabase → **Authentication → URL Configuration**.
2. Em **Additional Redirect URLs**, adicione a URL do seu Preview:
   - Pegue em Vercel → Deployment Details → **Domains**.
   - Use o domínio que termina com `.vercel.app` e adicione `/auth/callback`.
   - Exemplo: `https://SEU-PREVIEW.vercel.app/auth/callback`
3. Salve.

## 1.2) (Opcional) Configurar Gemini (IronScanner)
Se ao importar treino por imagem/PDF aparecer **“API de IA não configurada”**, falta a variável `GOOGLE_GENERATIVE_AI_API_KEY` no deploy (Preview/Production).

### A) Criar a chave do Gemini
1. Abra o Google AI Studio e crie uma API key.
2. Copie a chave.

### B) Vercel: configurar variáveis (Preview e Production)
1. Vercel → Project → **Settings → Environment Variables**.
2. Crie/adicione:
   - `GOOGLE_GENERATIVE_AI_API_KEY` (marque **Preview** e **Production**)
3. (Opcional) Para fixar modelo:
   - `GOOGLE_GENERATIVE_AI_MODEL_ID=gemini-2.5-flash`
4. Salve e faça **Redeploy** do Preview.

## 2) Como fazer deploy do jeito certo (dia a dia)

### A) Criar um Preview (para testar antes)
1. No GitHub, abra seu repositório.
2. Clique em **Pull requests → New pull request**.
3. Base: `main`.
4. Compare: sua branch (ex.: `fix-editor`).
5. Clique em **Create pull request**.
6. Aguarde aparecer um check da Vercel no PR (Preview).
7. Clique no link do Preview e teste.

### B) Publicar em Produção
1. Quando o Preview estiver OK, no mesmo PR clique em **Merge pull request**.
2. Isso faz push na `main`.
3. A Vercel vai criar automaticamente um deploy **Production**.

## 3) Rollback (voltar versão anterior com 1 clique)
1. Abra o projeto na Vercel.
2. Vá em **Deployments**.
3. Encontre um deploy antigo que estava funcionando.
4. Clique no deploy → **Promote to Production**.

## Observações importantes
- As variáveis de ambiente do app devem estar configuradas na Vercel (Production/Preview).
- Evite usar `npm run deploy` para produção: ele faz deploy direto do seu computador e pode subir coisas que nem foram para o GitHub.
