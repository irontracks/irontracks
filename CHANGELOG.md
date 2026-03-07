# Changelog

Todas as mudanças notáveis do IronTracks são documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [Unreleased]

### Adicionado
- Coverage gate no CI (threshold ≥ 25% statements)
- `loading.tsx` em 6 rotas (dashboard, community, marketplace, assessments, recovery, privacy)
- `error.tsx` em 3 rotas (community, marketplace, assessments)
- Testes unitários para `canonicalRemapping`, `webhookHelpers`, `finishHelpers`, `parseJsonWithSchema` (+49 test cases)
- JSDoc em 7 hooks sem documentação
- `CONTRIBUTING.md` com setup e convenções

### Melhorado
- CI agora gera relatório de coverage e falha se abaixo do threshold

---

## [1.0.0] — 2025-12-01

### Adicionado
- App completo com treinos, comunidade, marketplace, avaliações
- Sistema VIP com MercadoPago
- Ghost Partner e Team Streaks
- PWA com Offline Sync
- Push Notifications (iOS nativo)
- Painel Admin para coaches
- Relatórios de treino com AI Insights
- CI/CD com GitHub Actions (type check, lint, testes, build)
