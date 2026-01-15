## Causa (confirmada pelo log)
- O build do Vercel está tentando prerenderizar `/dashboard/schedule` e executa `createClient()` do Supabase durante o prerender.
- Como o Vercel não tem `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` configuradas no ambiente de build, o código lança: **Missing Supabase environment variables**.

## Correção em 2 camadas (para zerar o problema)

### 1) Configurar ENV no Vercel (obrigatório)
- Em Vercel → Project → Settings → Environment Variables:
  - Adicionar `NEXT_PUBLIC_SUPABASE_URL`
  - Adicionar `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Marcar para **Production + Preview** (e Development se você usa).
- Re-deploy (redeploy do último commit) após salvar.

### 2) Evitar prerender desses paths (resiliência)
- Transformar páginas client que chamam `createClient()` em render (ex.: `/dashboard/schedule` e `/marketplace`) em **rotas dinâmicas** para o Next não tentar prerender no build:
  - Opção A (preferida): `page.tsx` server wrapper com `export const dynamic = 'force-dynamic'` e importar um `ScheduleClient.tsx` (use client).
  - Opção B: manter como client page e adicionar `export const dynamic = 'force-dynamic'` (se o Next aceitar no seu setup).

## Validação
- Rodar `npm run build` local com env ausentes (simular) para garantir que não quebra.
- Confirmar que o Vercel build completa e que `/dashboard/schedule` abre sem crash.

## Entregáveis
- Patch nas páginas `/dashboard/schedule` e `/marketplace` para não prerender.
- Checklist de ENV do Vercel (Preview/Production) e como testar.

Se você confirmar, eu aplico a camada 2 no código agora (wrapper server + dynamic) e deixo o deploy blindado mesmo quando Preview estiver sem env.