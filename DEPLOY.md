# Deploy seguro (Vercel automático via GitHub)

Este projeto usa o modo mais simples e seguro: **Vercel conectado ao GitHub**.
Você testa em **Preview** via Pull Request e só depois publica em **Production** ao fazer merge na `main`.

## 1) Configurar a Vercel (uma única vez)
1. Entre em `https://vercel.com` e faça login.
2. Clique em **Add New → Project**.
3. Selecione o repositório do IronTracks no GitHub.
4. Confirme a branch de produção (recomendado: `main`).
5. Clique em **Deploy**.

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
