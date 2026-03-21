---
description: How to run SQL directly on Supabase via Management API
---
// turbo-all

## Prerequisites
The Supabase CLI Personal Access Token is stored in the macOS Keychain.

## Run SQL

1. Extract the token from Keychain:
```bash
SUPA_PAT=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null | base64 -d)
```

2. Execute SQL via Management API:
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

## Notes
- Project ref: `enbueukmvgodngydkpzm`
- The token is a Personal Access Token (`sbp_...`), not the service_role key
- The Management API returns status 201 for successfully executed queries
- **ALWAYS** verify changes with a SELECT query after executing DDL/DML
