# Plano - Rate Limit RLS

## Objetivo
Configurar policies RLS na tabela `rate_limit_counters` para restringir o acesso apenas ao `service_role` (backend) e negar explicitamente o acesso direto de clientes (anon/authenticated).

## Arquivo Alvo
`supabase/migrations/20260219150000_rate_limit_function.sql`

## Alterações
Inserir o seguinte bloco SQL logo após a linha `ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;`:

```sql
-- Apenas service role (admin) pode operar essa tabela
-- Usuários normais não têm acesso direto
CREATE POLICY "service role full access on rate_limit_counters"
  ON rate_limit_counters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Bloquear explicitamente acesso anônimo e autenticado
CREATE POLICY "deny public access on rate_limit_counters"
  ON rate_limit_counters
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
```

## Validação
- Verificar se o arquivo foi salvo corretamente com as novas linhas.
- Nenhuma outra alteração será feita na função ou estrutura da tabela.
