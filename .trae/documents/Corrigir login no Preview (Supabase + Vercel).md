## Resposta direta
- Sim — **é exatamente assim**, desde que esse domínio seja um dos que aparecem em **Vercel → Deployment Details → Domains** (copie/cole para não errar letras).
- No Supabase, em **Additional Redirect URLs**, você deve adicionar a URL completa com o caminho:
  - `https://app-iron-tracks-git-deploy-20260114-160525-djmks-projects.vercel.app/auth/callback`

## Passo a passo (leigo) para o Preview logar
### 1) Vercel: variáveis de ambiente no Preview
1. Vercel → Project → **Settings → Environment Variables**.
2. Adicione/garanta para **Preview**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **Save**.
4. Vá em **Deployments** → abra o Preview → **Redeploy**.

### 2) Supabase: pegar URL e anon key
1. Supabase → seu projeto → **Project Settings → API**.
2. Copie:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3) Supabase: liberar redirect do Google para o Preview
1. Supabase → **Authentication → URL Configuration**.
2. Em **Additional Redirect URLs**, adicione:
   - `https://app-iron-tracks-git-deploy-20260114-160525-djmks-projects.vercel.app/auth/callback`
   - `https://irontracks.com.br/auth/callback` (produção)
3. **Save**.

## Observação importante
- Se ainda der erro de redirect, às vezes é detalhe de URL. A solução prática é adicionar também a variação com barra no final:
  - `https://...vercel.app/auth/callback/`

## O que eu posso ajustar no repositório (opcional)
- Atualizar o DEPLOY.md com esse passo a passo do login em Preview.
- Melhorar a mensagem de erro `missing_env` para indicar qual variável está faltando.