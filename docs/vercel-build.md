# Build da Vercel — memória e `vercel.json`

## `buildCommand` carrega `NODE_OPTIONS`

```json
"buildCommand": "NODE_OPTIONS=--max-old-space-size=6144 npm run build"
```

O build de produção morreu de OOM três vezes em 06–07/08/2026 e deixou a
produção um dia sem atualizar — e o app nativo carrega o front do servidor,
então isso segura TODOS os usuários, não só a web.

Onde a memória vai: o upload de sourcemaps do Sentry e o `tsc` no mesmo
container. Por isso não reproduz local, onde `SENTRY_AUTH_TOKEN` não existe e os
sourcemaps nem são gerados.

Está versionado no repo, e não como env var no painel, para o ajuste sobreviver
a quem recriar o projeto na Vercel.

## ⚠️ `vercel.json` NÃO aceita chave desconhecida

Comentário em JSON via chave `_comment_*` **derruba o deploy de produção**:

```
The `vercel.json` schema validation failed with the following message:
should NOT have additional property `_comment_buildCommand`
```

Aconteceu em 09/08/2026 — a chave de comentário foi adicionada junto com o
`buildCommand` e os três merges seguintes falharam em produção. Documentação
sobre configuração de build mora **aqui**, não dentro do JSON.

Detalhe que fez isso passar batido: o **preview** do PR ficou `READY`. A
validação de schema reprovou só no deploy de **produção**. Ou seja, preview
verde não garante que o `vercel.json` é válido — confira o estado do deploy de
produção depois de mexer nesse arquivo.

`build.env` também não serve: não está mais no schema.
