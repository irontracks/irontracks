---
description: Como executar SQL diretamente no Supabase via Management API
---
// turbo-all

## Pré-requisitos
O Personal Access Token do Supabase CLI está armazenado no macOS Keychain.

## Executar SQL

1. Extrair o token do Keychain:
```bash
SUPA_PAT=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null | base64 -d)
```

2. Executar SQL via Management API:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/enbueukmvgodngydkpzm/database/query" \
  -H "Authorization: Bearer $SUPA_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query": "YOUR_SQL_HERE"}'
```

## One-liner (Node.js)
```bash
node -e "
const token = require('child_process').execSync('security find-generic-password -s \"Supabase CLI\" -w').toString().trim();
const pat = Buffer.from(token.replace('go-keyring-base64:',''), 'base64').toString();
fetch('https://api.supabase.com/v1/projects/enbueukmvgodngydkpzm/database/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + pat },
  body: JSON.stringify({ query: process.argv[1] }),
}).then(r => r.text()).then(console.log).catch(console.error);
" "SELECT 1"
```

## Notas
- Project ref: `enbueukmvgodngydkpzm`
- O token é um Personal Access Token (`sbp_...`), não é o service_role key
- A Management API retorna status 201 para queries executadas com sucesso
