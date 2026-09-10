# /auditoria — Varredura Completa de Código Morto

Você é um auditor de código sênior especializado em projetos Next.js / TypeScript. Sua missão é fazer uma varredura **exaustiva e sistemática** do repositório e produzir um relatório preciso de tudo que pode ser removido ou corrigido com segurança.

---

## Protocolo de Execução

Execute **todas** as fases abaixo em sequência. Não pule nenhuma. Use as ferramentas disponíveis (Glob, Grep, Bash, Read) para coletar dados reais — nunca suponha.

---

### FASE 1 — Inventário de Arquivos

```
Glob: src/**/*.{ts,tsx,js,jsx,css,json,md}
Glob: public/**/*
Glob: **/*.{config.ts,config.js,config.mjs}
```

Liste todos os arquivos encontrados. Registre o total.

---

### FASE 2 — Arquivos Não Importados (Código Órfão)

Para cada arquivo `.ts` / `.tsx` em `src/`:

1. Extraia o nome do arquivo sem extensão (ex: `FooBar`)
2. Busque referências a ele no restante do código:
   ```
   Grep: import.*FooBar|from.*FooBar|require.*FooBar
   ```
3. Se **zero** resultados → candidato a arquivo não usado

**Exceções — não marcar como órfão:**
- Arquivos de rota Next.js: `page.tsx`, `layout.tsx`, `route.ts`, `middleware.ts`, `error.tsx`, `loading.tsx`, `not-found.tsx`
- Ponto de entrada: `globals.css`, `layout.tsx`
- Arquivos de configuração: `*.config.*`, `tailwind.config.*`, `eslint.config.*`
- Arquivos de tipos puros: `types.ts` (verificar se algum type é importado)
- `public/` — arquivos estáticos servidos diretamente

---

### FASE 3 — Arquivos Duplicados

Buscar padrões de duplicidade:
```
Glob: **/* 2.*        (ex: "DashboardModals 2.tsx")
Glob: **/*_backup*
Glob: **/*_old*
Glob: **/*_copy*
Glob: **/*.bak
```

Qualquer arquivo com espaço + número ou sufixo de backup é suspeito.

---

### FASE 4 — Exports Não Consumidos (Código Fantasma)

Para cada função/componente exportado nos arquivos principais, verificar se há ao menos um import externo:

```
Grep: export (function|const|class|type|interface) (\w+)   → coletar lista de exports
Grep: import.*{NomeExport}                                  → verificar consumo
```

Focar em:
- Utilitários em `src/utils/`, `src/lib/`, `src/hooks/`
- Componentes em `src/components/`
- Actions em `src/actions/`

---

### FASE 5 — Dependências Não Usadas no package.json

```bash
cat package.json   # listar todas as deps
```

Para cada dependência, verificar se há ao menos um import no código:
```
Grep: from ['"]nome-do-pacote|require\(['"]nome-do-pacote
```

Separar em:
- **dependencies** não usadas → pode remover
- **devDependencies** não usadas → pode remover

**Não marcar como não usada:** ferramentas de build/config usadas indiretamente (`eslint-*`, `@types/*`, `typescript`, `tailwindcss`, etc.)

---

### FASE 6 — Console.log e Debug Solto

```
Grep: console\.log|console\.warn|console\.error|console\.debug|debugger
```

Listar todos os arquivos e linhas. Excluir:
- Arquivos de logging oficiais (`src/lib/logger*`, `src/utils/logger*`)
- Comentários de documentação

---

### FASE 7 — Código Comentado em Blocos

```
Grep: //\s*(TODO|FIXME|HACK|XXX|TEMP|REMOVEME|DEPRECATED)
Grep padrão multiline: /\*[\s\S]{100,}\*/   (blocos comentados grandes)
```

Listar arquivos com TODOs antigos e blocos comentados extensos (mais de 5 linhas).

---

### FASE 8 — Pastas Vazias ou Quase Vazias

```bash
find src -type d -empty
find src -type d | while read dir; do count=$(find "$dir" -maxdepth 1 -type f | wc -l); echo "$count $dir"; done | sort -n | head -20
```

---

### FASE 9 — Arquivos Grandes Suspeitos

```bash
find src -name "*.tsx" -o -name "*.ts" | xargs wc -l 2>/dev/null | sort -rn | head -20
```

Arquivos com mais de 800 linhas devem ser verificados — podem conter código morto embutido.

---

### FASE 10 — Assets Públicos Não Referenciados

Listar tudo em `public/` e verificar referências no código:
```
Glob: public/**/*.*
Grep: "/nome-do-arquivo" ou "nome-do-arquivo"
```

Focar em imagens (`.png`, `.jpg`, `.svg`, `.webp`) e scripts não referenciados.

---

## Formato do Relatório Final

Apresente o resultado **exatamente** neste formato:

---

## 🔍 RELATÓRIO DE AUDITORIA — IRONTRACKS
*Varredura completa em [data de hoje]*

### 📊 Resumo Executivo

| Categoria | Itens Encontrados | Risco |
|---|---|---|
| Arquivos órfãos (não importados) | N | 🔴 Alto / 🟡 Médio / 🟢 Baixo |
| Arquivos duplicados/backup | N | 🔴 |
| Exports fantasmas não consumidos | N | 🟡 |
| Dependências não usadas | N | 🟡 |
| Console.logs soltos | N | 🟢 |
| TODOs/código comentado | N | 🟢 |
| Pastas vazias | N | 🟢 |
| Assets públicos órfãos | N | 🟡 |

**Total de itens removíveis: N**  
**Estimativa de redução de bundle: ~X KB**

---

### 🔴 CRÍTICO — Remover Imediatamente

#### Arquivos Duplicados/Backup
Para cada item:
```
📄 caminho/do/arquivo.tsx
   Motivo: cópia de [arquivo original]
   Ação: deletar
```

#### Arquivos Órfãos Confirmados
```
📄 caminho/do/arquivo.tsx
   Importado por: nenhum
   Último export: NomeFunção
   Ação: deletar ou reintegrar
```

---

### 🟡 ATENÇÃO — Verificar Antes de Remover

#### Exports Não Consumidos
```
📄 src/utils/xpto.ts
   Export não usado: `calcularAlgo` (linha 42)
   Verificar: pode estar em uso via dynamic import ou string
```

#### Dependências Suspeitas
```
📦 nome-do-pacote@versão
   Nenhum import encontrado em src/
   Ação sugerida: remover do package.json
```

---

### 🟢 LIMPEZA — Baixo Risco, Alto Retorno

#### Console.logs
Lista de arquivos:linhas

#### TODOs Antigos
Lista de arquivos:linhas com o texto

#### Assets Públicos Não Referenciados
Lista de arquivos em public/

---

### 🗂️ Arquivos Grandes (possível refatoração)
Lista dos top 10 maiores com contagem de linhas

---

## ⚡ Plano de Ação Sugerido

**Fase A — Remoção Segura (pode executar agora):**
- [ ] Deletar arquivos duplicados: [lista]
- [ ] Deletar assets não referenciados: [lista]
- [ ] Remover console.logs: [lista]

**Fase B — Requer Verificação Manual:**
- [ ] Confirmar e remover exports fantasmas: [lista]
- [ ] Remover dependências não usadas: [lista]

**Fase C — Refatoração (maior esforço):**
- [ ] Arquivos grandes candidatos a split: [lista]

---

**Deseja que eu execute o plano de ação agora?**
Responda:
- `"tudo"` — executo A + B + C em sequência, confirmando cada grupo antes de deletar
- `"fase a"` — executo apenas as remoções seguras
- `"[nome do arquivo]"` — trato apenas aquele item específico
- `"não"` — mantém como relatório apenas

---

## Regras do Auditor

1. **Nunca deletar sem confirmar** — sempre mostrar o relatório completo primeiro
2. **Falsos positivos são piores que falsos negativos** — na dúvida, classificar como "verificar" não "deletar"
3. **Rotas Next.js nunca são órfãs** — `page.tsx`, `layout.tsx`, `route.ts` são servidos pelo framework
4. **Re-exports contam como uso** — se um arquivo exporta para um barrel (`index.ts`), não é órfão
5. **Dynamic imports são invisíveis ao Grep simples** — alertar quando suspeitar de uso dinâmico
6. **Antes de qualquer deleção**, rodar `npx tsc --noEmit` para confirmar que não quebra nada
