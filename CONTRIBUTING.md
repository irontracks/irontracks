# Contribuindo com o IronTracks

Obrigado por querer contribuir! Este guia cobre setup, convenções e o processo de PR.

## Setup Local

```bash
# Requisitos
node -v   # >= 20.x
npm -v    # >= 10.x

# Clone e instale
git clone <repo-url>
cd App\ IronTracks
npm ci --legacy-peer-deps
cp .env.example .env.local   # preencha SUPABASE_URL e ANON_KEY
```

## Desenvolvimento

```bash
npm run dev          # Next.js dev server (http://localhost:3000)
npm run test:unit    # Vitest — testes unitários
npm run test:smoke   # Testes de fumaça
npm run lint         # ESLint
npx tsc --noEmit     # Type check
```

## Convenções

### Branches

| Prefixo      | Uso                         |
| ------------ | --------------------------- |
| `feat/`      | Nova funcionalidade         |
| `fix/`       | Correção de bug             |
| `refactor/`  | Refatoração sem mudança de comportamento |
| `docs/`      | Apenas documentação         |
| `chore/`     | Tooling, CI, deps           |

### Commits

Usamos Conventional Commits:

```
feat(workout): add rest timer notification actions
fix(auth): handle expired refresh token gracefully
docs(hooks): add JSDoc to useSessionSync
```

### Código

- **TypeScript strict** — `noEmit` deve passar sem erros
- **Zod** em todos os endpoints de API para validação de entrada
- **JSDoc** em todos os hooks exportados — propósito, parâmetros, retorno
- **Sem `any`** — use `unknown` + type guards

### Tamanho de PR

- Máximo ~400 linhas alteradas (excluindo gerado / lock files)
- PRs maiores devem ser divididas em stacked PRs

## Processo de PR

1. Abra uma branch a partir de `main`
2. Faça seus commits
3. Rode `npm run lint && npx tsc --noEmit && npm run test:unit` localmente
4. Abra um PR com descrição clara do que mudou e por quê
5. CI roda automaticamente (type check → lint → testes → build)
6. Aguarde review de pelo menos 1 mantenedor
7. Merge via **Squash and merge**

## Estrutura do Projeto

```
src/
├── actions/        # Server Actions (Next.js)
├── app/            # App Router (rotas, layouts, API routes)
├── components/     # Componentes React reutilizáveis
├── hooks/          # Custom hooks
├── lib/            # Bibliotecas/integrações (Supabase, MercadoPago)
├── types/          # TypeScript types
└── utils/          # Funções utilitárias puras
```
