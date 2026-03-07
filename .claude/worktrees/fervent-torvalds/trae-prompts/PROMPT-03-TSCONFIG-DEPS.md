# PROMPT-03 — Corrigir tsconfig.json e package.json

## Contexto

O projeto tem configurações desatualizadas e inconsistentes que podem causar problemas
em produção e no processo de build do Next.js 15+.

---

## 1. Corrigir `tsconfig.json`

### Problemas Identificados
- `"strict": false` — inconsistente com `"noImplicitAny": true`  
- `"moduleResolution": "node"` — desatualizado para Next.js 15+ (deve ser `"bundler"`)
- Ausência de `"noUnusedLocals"` e `"noUnusedParameters"`

### Arquivo Atual
```json
{
  "compilerOptions": {
    "target": "es5",
    "strict": false,
    "noImplicitAny": true,
    "moduleResolution": "node",
    ...
  }
}
```

### Arquivo Corrigido

Substitua o `tsconfig.json` na raiz do projeto pelo seguinte:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noImplicitAny": true,
    "useUnknownInCatchVariables": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "downlevelIteration": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    ".next",
    "eslint.config.ts",
    "eslint.config 2.ts",
    "_archive",
    "claude",
    "scripts",
    "_macro_mixer_orig",
    "_legacy_backup",
    "src/**/__tests__/**",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.test.js",
    "**/*.spec.ts",
    "**/*.spec.tsx"
  ]
}
```

> ⚠️ **IMPORTANTE:** Após ativar `"strict": true`, é provável que surjam novos erros de
> tipagem no projeto. Rode `tsc --noEmit 2>&1 | head -50` para ver os primeiros erros
> e corrija-os um a um. Os principais serão relacionados a:
> - Variáveis que podem ser `undefined` não sendo verificadas
> - Parâmetros de funções sem tipo explícito
> - Retornos de promises não tratados

---

## 2. Corrigir `package.json`

### Problema: Dependências de desenvolvimento ausentes

Estão faltando no `devDependencies`:
- `typescript` — compilador TS (provavelmente sendo usado do next, mas deve ser explícito)
- `@types/node` — tipos do Node.js (necessário para APIs do Next.js)

### Ação

Execute no terminal:

```bash
npm install --save-dev typescript @types/node
```

Ou adicione manualmente ao `package.json`:

```json
{
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    ...existing devDependencies...
  }
}
```

Depois rode:
```bash
npm install
```

---

## 3. Verificar após as mudanças

```bash
# Verificar erros de TypeScript
npx tsc --noEmit 2>&1 | wc -l

# Se muitos erros, ver os primeiros
npx tsc --noEmit 2>&1 | head -100

# Verificar build do Next.js
npm run build
```

> 💡 Se `strict: true` gerar mais de 50 erros, considere fazer a migração gradual:
> primeiro corrija os erros mais críticos (parâmetros `any` em funções públicas),
> depois ative strict completamente.
