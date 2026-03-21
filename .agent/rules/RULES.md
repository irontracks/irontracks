# IronTracks — Agent Rules

## 🚨 REGRAS CRÍTICAS (NUNCA violar)

### 1. NÃO deletar arquivos com `find -delete` ou `rm` com glob
- Filenames com espaço no macOS causam deleções acidentais
- Use SEMPRE `git rm` para rastrear, ou delete um arquivo por vez com path entre aspas
- **ANTES** de qualquer delete, listar os arquivos que serão afetados e confirmar

### 2. NÃO modificar modais sem verificar o fluxo completo
- Modais usam `z-index` em camadas: overlay (1200) > modal (1300) > toast (1400)
- **SEMPRE** verificar se o modal tem:
  - `onClose` funcional (click no X, click no overlay, ESC key)
  - `overflow-y-auto` no body para scroll em telas pequenas
  - `max-h-[85vh]` para não ultrapassar a tela
  - `pb-safe` para safe area no iOS
- **NUNCA** remover `position: fixed` ou `inset-0` de overlays
- **NUNCA** mudar z-index sem verificar colisões com outros modais ativos

### 3. NÃO modificar state management sem entender o fluxo
- `IronTracksAppClientImpl.tsx` é o God Component — qualquer estado global passa por ele
- `useViewNavigation.ts` controla TODA a navegação de views
- **ANTES** de mudar qualquer `useState`/`useEffect` em componentes core, trace o fluxo:
  1. Quem seta o state?
  2. Quem consome o state?
  3. Há side effects dependentes?

### 4. NÃO fazer batch operations em APIs sem rate limit check
- Toda rota nova DEVE ter `checkRateLimitAsync` ou verificação equivalente
- Schemas Zod DEVEM ter `.max()` em strings e arrays

### 5. NÃO interpolar variáveis em `.or()` do Supabase sem `safePg()`
- **SEMPRE** usar `import { safePg } from '@/utils/safePgFilter'`
- Pattern correto: `.or(\`col.eq.${safePg(value)}\`)`
- Pattern ERRADO: `.or(\`col.eq.${value}\`)`

---

## ⚠️ REGRAS DE SEGURANÇA

### 6. Inserções na tabela `notifications`
- **SEMPRE** incluir `is_read: false` e `read: false` explicitamente
- Usar `insertNotifications()` de `@/lib/social/notifyFollowers` quando possível (já garante defaults)

### 7. `createAdminClient()` — RLS Bypass
- Só usar quando RLS impede a operação legítima
- **SEMPRE** verificar auth ANTES de usar admin client
- **SEMPRE** adicionar comment: `// NEEDS ADMIN: [razão]`

### 8. Deletes e Updates
- `.delete()` DEVE ter `.eq('user_id', userId)` ou ownership check equivalente
- `.update()` DEVE filtrar por owner ou ter role check (admin/teacher)

---

## 🎨 REGRAS DE UI/UX

### 9. Design System Premium
- Background: `#0a0a0a` (preto profundo), cards: `rgba(15,15,15,0.98)`
- Gold: `#f59e0b` → `#d97706` → `#b45309` (gradiente 135deg)
- Borders: `rgba(234,179,8,0.25)` (gold subtle)
- **NUNCA** usar cores "flat" (vermelho puro, azul puro)
- **SEMPRE** usar `from '@/components/ui/PremiumUI'` para modais e botões
- Fontes: `font-black` para títulos, `text-sm` para body

### 10. Componentes > 500 linhas
- Extrair sub-componentes ou hooks antes de adicionar mais código
- Hooks > 300 linhas devem ser decompostos

### 11. Lazy Loading
- Todo modal e painel pesado DEVE usar `dynamic(() => import(...), { ssr: false })`
- Componentes que usam `chart.js`, `framer-motion` ou `html2canvas` DEVEM ser lazy

### 12. Imagens
- Usar `next/image` quando possível
- Exceções aceitas: avatares dinâmicos (Capacitor), previews de câmera, geração de PDF

---

## 🧪 REGRAS DE QUALIDADE

### 13. TypeScript
- **ZERO** `as any` ou `: any` — usar `unknown` + type guard
- Catch blocks devem logar: `catch (e) { logError('context', e) }`
- Schemas Zod em `src/schemas/` para validação de input

### 14. Erro Handling
- APIs retornam `{ ok: boolean, error?: string }`
- Status HTTP corretos: 401 (auth), 403 (forbidden), 429 (rate limit)
- **NUNCA** expor stack traces ao cliente em produção

### 15. Antes de commitar
- Rodar `npx tsc --noEmit` para type check
- Verificar que nenhum arquivo foi deletado acidentalmente: `git diff --name-status | grep "^D"`
- Commit messages em inglês com prefixo: `fix()`, `feat()`, `security()`, `refactor()`

---

## 📋 REGRAS DE TASK TRACKING

### 16. SEMPRE atualizar task.md com impacto pro usuário
- **ANTES** de começar qualquer fix/feature, atualizar `task.md` marcando `[/]` (em progresso)
- **DEPOIS** de concluir, marcar `[x]` e adicionar uma linha de **impacto para o usuário**:
  - Formato: `[x] Fix X — ✅ **Impacto:** [o que muda para o usuário]`
  - Exemplo: `[x] safePg client-side — ✅ **Impacto:** Proteção contra injection em buscas`
  - Exemplo: `[x] Atomic counter — ✅ **Impacto:** Contagem de uso correta mesmo com acessos simultâneos`
- **NUNCA** encerrar uma sessão sem atualizar task.md com o status final
- Ao notificar o usuário, incluir tabela resumo com coluna "Impacto"

### 17. Economia de tokens — ZERO loops desnecessários
- **ANTES de qualquer busca/grep**, definir exatamente o que procura e parar ao encontrar
- **NÃO** repetir o mesmo comando se já falhou — mudar abordagem imediatamente
- **NÃO** ler arquivos inteiros se só precisa de 10-20 linhas — usar StartLine/EndLine
- **NÃO** tentar mais de 2 abordagens para o mesmo problema; na 3ª, perguntar ao usuário
- **NÃO** verificar o mesmo arquivo mais de 1 vez na mesma sessão (guardar contexto)
- **batch**: se precisa editar vários arquivos com o mesmo padrão, usar `multi_replace` ou `grep` primeiro para listar todos e aplicar em uma rodada
- **pipeline**: encadear comandos shell com `&&` e `|` em vez de rodar um por um
- **atalhos**: usar `git diff --stat` em vez de `view_file` para verificar mudanças
- Se encontrou um erro de permissão/env, **NÃO** tentar 5 variações — usar abordagem alternativa na 2ª tentativa

### 18. SQL no Supabase — usar workflow `/supabase-sql`
- **NUNCA** pedir ao usuário para rodar SQL manualmente se o workflow está disponível
- Usar a Management API com PAT do Keychain (workflow já configurado)
- Após executar SQL, **SEMPRE** verificar com SELECT que a mudança foi aplicada
