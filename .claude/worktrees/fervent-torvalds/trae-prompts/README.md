# 🤖 TRAE — Prompts de Correção do IronTracks

Este diretório contém prompts sequenciais para o TRAE corrigir e melhorar o projeto.
Execute-os **na ordem numérica** — cada prompt depende do anterior.

---

## 📋 Ordem de Execução

| Arquivo | Prioridade | Descrição |
|---|---|---|
| `PROMPT-01-LIMPAR-JS-DUPLICADOS.md` | 🔴 CRÍTICO | Remove arquivos .js que têm versão .ts/.tsx |
| `PROMPT-02-CORRIGIR-TYPES-ANY.md` | 🔴 CRÍTICO | Elimina `any` dos tipos principais |
| `PROMPT-03-TSCONFIG-DEPS.md` | 🔴 CRÍTICO | Corrige tsconfig.json e package.json |
| `PROMPT-04-ADMIN-COMPONENTS.md` | 🟡 IMPORTANTE | Tipagem correta em RequestsTab e AdminVipReports |
| `PROMPT-05-ZOD-API-ROUTES.md` | 🟡 IMPORTANTE | Adiciona validação Zod às routes sem ela |
| `PROMPT-06-SCHEMAS-CENTRAIS.md` | 🟢 MELHORIA | Cria schemas Zod centrais para entidades |
| `PROMPT-07-MELHORIAS-GERAIS.md` | 🟢 MELHORIA | Melhorias de consistência e qualidade |

---

## ⚠️ Observações Importantes

- **Não execute prompts em paralelo** — aguarde cada um terminar antes do próximo
- Após cada prompt, rode `tsc --noEmit` para verificar se não introduziu erros
- O projeto usa **Next.js + Supabase + Zod** — respeite esses padrões ao gerar código
- Alias de path: `@/` aponta para `src/`
- **NÃO altere** `src/app/sw.js` — Service Worker deve permanecer em JS

---

## 📊 Resumo dos Problemas Encontrados

### Erros Críticos
- 9 arquivos `.js` coexistindo com versões `.ts`/`.tsx` (com `allowJs: false` no tsconfig)
- `strict: false` no tsconfig (inconsistente com `noImplicitAny: true`)
- `typescript` e `@types/node` ausentes do `devDependencies`
- `moduleResolution: "node"` desatualizado para Next.js 15+

### Problemas de Tipagem
- 12+ usos de `any` em `types/admin.ts`
- `[key: string]: any` em `UserRecord` (types/app.ts)
- `metadata?: Record<string, any>` em tipos sociais
- `supabase: any` em AdminVipReports
- 75 ocorrências de `as any` nas routes de API

### Falta de Validação Zod
- 58 routes de API sem `parseJsonBody` ou `parseSearchParams`
- Apenas 2 schemas em `src/schemas/` (database.ts e settings.ts)
- Faltam schemas para: requests de API, social, admin, assessment
