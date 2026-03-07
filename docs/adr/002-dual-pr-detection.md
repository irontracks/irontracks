# ADR 002 — Dual PR Detection: Hook (UX) vs API (Persistência)

**Data**: 2025-03  
**Status**: Accepted  
**Autores**: Time IronTracks

---

## Contexto

O IronTracks detecta Personal Records (PRs) usando o estimador de 1RM de Epley:

```
e1RM = peso × (1 + reps / 30)
```

Existem **duas implementações** independentes desta lógica:

1. **`useReportData.ts` (hook, client-side)** — calcula PRs em tempo real
   durante a exibição do relatório pós-treino, sem round-trip de rede.
2. **API / Supabase RPC (server-side)** — valida e persiste PRs no banco
   com regras adicionais de negócio.

---

## Decisão

**Manter as duas implementações intencionalmente**, com propósitos distintos.

---

## Justificativa

### Hook (client-side) — propósito: UX responsiva

O atleta vê seus PRs **imediatamente** ao terminar o treino, antes de qualquer
round-trip ao servidor. Isso é crítico para o engajamento emocional — o momento
do PR é o momento de maior motivação.

Aceita imprecisão: se o servidor rejeitar um PR por regra de negócio (ex:
cooldown de 7 dias), a UI atualiza na próxima renderização com os dados do banco.

### API / RPC — propósito: persistência e fonte de verdade

O servidor aplica regras adicionais:
- Cooldown mínimo entre PRs do mesmo exercício
- Peso mínimo para contabilizar (evita PRs com 1kg)
- Validação contra histórico completo (não apenas última sessão)

---

## Fonte de Verdade

**Os valores persistidos pela API são canônicos.**

Quando os dois divergem (ex: edição retroativa de um set via API):
- O componente deve preferir os dados do banco quando disponíveis
- O hook serve apenas como fallback otimista para UX imediata

---

## Consequências

**Positivas**:
- UX de PR imediata sem latência
- Regras de negócio robustas no servidor sem impacto na UX

**Negativas / Trade-offs**:
- Duplicação da fórmula Epley — manter em sincronia
- Possível divergência temporária entre UI e banco (eventual consistency)
- Novos devs precisam entender qual implementação mudar para each caso

---

## Onde está cada implementação

| Arquivo | Função |
|---|---|
| `src/hooks/useReportData.ts` (L428+) | PR detection client-side (Epley, tempo real) |
| `src/actions/workout-actions.ts` | `getHistoricalBestE1rm` — all-time best do banco |
| Supabase RPC / API routes | Persistência de PRs com business rules |
