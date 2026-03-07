# ADR 001 — Estratégia de RLS Granular no Supabase

**Data**: 2025-03  
**Status**: Accepted  
**Autores**: Time IronTracks

---

## Contexto

O IronTracks usa Supabase (PostgreSQL) como banco principal. Todos os dados
de treino, relatórios e dados sociais são armazenados em tabelas acessíveis
via cliente JavaScript (`@supabase/supabase-js`) diretamente do browser e do
app nativo (Capacitor).

Duas opções foram consideradas para proteger os dados:

1. **Validação apenas na API** — todas as queries passam por Next.js API routes
   que verificam autenticação e autorização antes de chamar o banco.
2. **RLS granular no banco** — políticas de Row Level Security definidas
   diretamente no PostgreSQL, permitindo queries diretas do cliente com segurança garantida no banco.

---

## Decisão

**RLS granular (opção 2)** foi adotado como estratégia principal.

O projeto tem **151+ migrações** com políticas RLS por tabela, com granularidade
por `user_id`, `teacher_id`, `student_id` e `is_template`.

---

## Justificativa

| Critério | API-only | RLS granular |
|---|---|---|
| Segurança | Depende de não esquecer verificações | Garantida pelo banco mesmo com bug na API |
| Performance | Round-trip extra (client → API → DB) | Client → DB direto para leituras |
| Offline-first | Difícil | Compatível com cache local |
| Complexidade de manutenção | Alta (cada endpoint precisa de auth check) | Média (policies concentradas em migrações) |
| Auditoria | Logs na aplicação | Policies versionadas em SQL |

O app tem **54+ hooks** que fazem queries diretas ao Supabase a partir do
browser para features em tempo real (presença, stories, chat). Exigir que
todas passem por API routes criaria latência inaceitável para UX de fitness
em tempo real.

---

## Consequências

**Positivas**:
- Queries diretas do cliente são seguras por padrão
- Menos código de auth duplicado nas API routes (server-side complement)
- Políticas versionadas e auditáveis em SQL

**Negativas / Trade-offs**:
- Curva de aprendizado de RLS para novos devs
- Alguns bugs de RLS são silenciosos (retornam 0 rows em vez de erro)
- Mudanças de policy exigem nova migration, não apenas deploy de código

---

## Alternativas Rejeitadas

- **API-only**: rejeitado pelo overhead de latência para features real-time e
  pelo risco de auth checks inconsistentes entre endpoints.
- **RLS mínimo + API-only para escrita**: considerado mas rejeitado porque
  leituras ainda precisariam de proteção contra vazamento cross-user.
