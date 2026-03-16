---
name: deep-code-review
description: Análise profunda do codebase em busca de bugs, falhas de segurança, dead code, race conditions, IDOR e problemas de lógica.
---

# Deep Code Review

Skill para executar uma análise profunda e sistemática do codebase. Siga cada fase na ordem.

## Quando usar

O usuário pede variações de: "faça um code review", "analise o código", "busque bugs", "/code-review", "/review".

## Formato de saída

Gere um artifact `code_review_report.md` com score e categorias. Use o template:

```markdown
# Code Review — [Nome do Projeto]

**Data:** YYYY-MM-DD
**Escopo:** [arquivos/pastas analisados]
**Score Global:** X/10

## Crítico (Score 100)
### N. [Título curto]
[Descrição do problema + impacto]
`path/to/file.ts:linha`
**Fix sugerido:** [como resolver]

## Alto (Score 75)
...

## Médio (Score 50)
...

## Baixo (Score 25)
...

## Análise de Impacto das Correções

| # | Fix | Breaking? | Risco de regressão | Impacto para o usuário |
|---|---|---|---|---|
| 1 | [Título] | Sim/Não | Baixo/Médio/Alto | [descrição curta] |
| 2 | ... | ... | ... | ... |

### Detalhes de Impacto
Para cada fix, detalhar:
- **O que muda** para o usuário final
- **O que quebra** (se algo) — e se é intencional
- **Risco de regressão** — quais fluxos podem ser afetados
- **Dependências** — se o fix depende de outro

## Resumo
- X críticos, Y altos, Z médios, W baixos
- Áreas mais problemáticas: [lista]
```

---

## ⚠️ REGRA OBRIGATÓRIA: Confirmação do Usuário

**NUNCA comece a codar correções automaticamente.**

Após gerar o relatório com a análise de impacto:

1. **Apresente** o relatório completo ao usuário via `notify_user` com `BlockedOnUser: true`
2. **Pergunte explicitamente:** _"Quer que eu corrija todos? Ou deseja selecionar quais corrigir?"_
3. **Aguarde** a resposta do usuário antes de qualquer edição de código
4. Se o usuário aprovar tudo → corrija na ordem de prioridade (Crítico → Alto → Médio → Baixo)
5. Se o usuário selecionar itens específicos → corrija apenas os selecionados

---

## Fase 1 — Mapeamento (obrigatório)

1. Listar a estrutura principal do projeto (`src/`, `app/`, etc.)
2. Identificar tecnologias (framework, ORM, auth, storage, billing)
3. Identificar padrões de autenticação usados (middleware, guards, etc.)
4. Mapear endpoints de API, server actions e cron jobs

## Fase 2 — Análise de Segurança (Crítico)

Verificar CADA endpoint e server action para:

### 2.1 Autenticação
- [ ] Toda rota tem auth check? (getUser, requireUser, requireRole)
- [ ] Server actions validam sessão antes de operar?
- [ ] Cron jobs usam auth por header (não query string)?
- [ ] Endpoints de webhook validam assinatura?

### 2.2 Autorização (IDOR)
- [ ] Mutations filtram por `user_id` do caller? (.eq('user_id', user.id))
- [ ] Deletes verificam ownership antes de executar?
- [ ] Updates verificam ownership antes de executar?
- [ ] Endpoints admin verificam role E ownership (professor → seus alunos)?

### 2.3 Injection
- [ ] Inputs de busca são sanitizados antes de `.or()`, `.ilike()`, `.filter()`?
- [ ] Valores do cliente são escapados antes de interpolação em queries?
- [ ] SQL/PostgREST operators são removidos de input? (caracteres: `,().\`)

### 2.4 Upload / Storage
- [ ] Paths de upload são gerados server-side? (não controlados pelo cliente)
- [ ] File types e tamanhos são validados?

### 2.5 Rate Limiting e DoS
- [ ] Endpoints que chamam APIs externas (AI, billing) tem rate limit?
- [ ] Schemas de input tem `.max()` para strings e arrays?
- [ ] Endpoints de busca limitam resultados?

## Fase 3 — Integridade de Dados

### 3.1 Race Conditions
- [ ] Operações read-then-write são atômicas? (INSERT ON CONFLICT, optimistic lock)
- [ ] Operações de billing/subscription são idempotentes?
- [ ] Contadores são incrementados atomicamente?

### 3.2 Validação de Input
- [ ] Dates do cliente são clampadas server-side?
- [ ] Enums são validados contra lista fixa?
- [ ] UUIDs são validados antes de usar em queries?

### 3.3 Consistência
- [ ] Cascades de delete são completos? (workout → exercises → sets)
- [ ] Updates em uma tabela refletem em tabelas relacionadas?
- [ ] Cancellations revogam entitlements?

## Fase 4 — Dead Code e Lógica Morta

### 4.1 Variáveis e flags
- [ ] Variáveis são atribuídas e lidas corretamente? (e.g., flag = false dentro do catch, if(flag) nunca true)
- [ ] Guards e early returns são efetivos?
- [ ] Variáveis declaradas mas nunca lidas?

### 4.2 Imports e exports
- [ ] Imports não utilizados?
- [ ] Exports que nenhum outro arquivo importa?
- [ ] Funções definidas mas nunca chamadas?

### 4.3 Condições impossíveis
- [ ] if/else branches que nunca executam?
- [ ] Catch blocks vazios que engolem erros?
- [ ] Default cases que mascaram bugs?

## Fase 5 — Performance e Cache

### 5.1 Queries
- [ ] N+1 queries em loops?
- [ ] Selects sem paginação que podem retornar milhares de rows?
- [ ] Queries sem index nas colunas filtradas?

### 5.2 Cache
- [ ] Cache keys são únicas por user? (evitar vazamento cross-user)
- [ ] Cache é invalidado após mutations?
- [ ] TTL é razoável?

### 5.3 Memory
- [ ] Arrays grandes em memória sem streaming?
- [ ] JSON.stringify/parse em objetos muito grandes?

## Fase 6 — Padrões de Código

### 6.1 Error Handling
- [ ] Catch blocks logam o erro? (não catch vazio)
- [ ] Erros retornam status HTTP correto?
- [ ] Erros de DB são tratados antes de retornar ao cliente?

### 6.2 TypeScript
- [ ] Uso excessivo de `any`?
- [ ] Type assertions sem validação (`as Type` sem check)?
- [ ] Propriedades opcionais acessadas sem null check?

### 6.3 Naming e Colunas
- [ ] Nomes de colunas correspondem ao schema real do DB?
- [ ] Não há typos em nomes de campos? (`read` vs `is_read`)

## Fase 7 — Infraestrutura

### 7.1 Env Vars
- [ ] Secrets não estão hardcoded?
- [ ] Fallbacks de env vars são seguros?

### 7.2 Realtime / WebSockets
- [ ] Handlers de realtime validam payload antes de aplicar state?
- [ ] Partial payloads não zeram dados existentes?

### 7.3 Offline / Mobile
- [ ] Capacitor config permite offline?
- [ ] Jobs offline desconhecidos são logados (não silenciados)?
- [ ] Loading states têm timeout de segurança?

---

## Scoring

| Severity | Score | Critério |
|----------|-------|---------|
| Crítico | 100 | Bypass de auth, data leak, injection, perda de dados |
| Alto | 75 | Bug confirmado que afeta usuários em produção |
| Médio | 50 | Code smell, performance ruim, manutenção difícil |
| Baixo | 25 | Style, naming, dead import, melhoria opcional |

## Dicas de execução

1. **Priorize API routes e server actions** — são a superfície de ataque
2. **Grep por padrões perigosos:**
   - `.or(` + variável interpolada → injection
   - `.delete()` ou `.update()` sem `.eq('user_id'` → IDOR
   - `catch {}` ou `catch { }` → erros engolidos
   - `createAdminClient()` em rotas normais → RLS bypass
   - `req.body` ou `body.` sem sanitização → input trust
3. **Compare schemas Zod com colunas reais do DB**
4. **Verifique se client-side pode controlar server-side values** (paths, IDs, dates)
5. **Não reportar falsos positivos** — confirme cada achado lendo o código ao redor
6. **SEMPRE inclua a tabela de Análise de Impacto** no relatório
7. **SEMPRE pergunte ao usuário** antes de começar a codar qualquer correção
