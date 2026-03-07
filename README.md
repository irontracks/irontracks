# IronTracks

> **Plataforma fitness social** para atletas e personal trainers — treinos em tempo real, relatórios pós-treino com IA, ranking, stories e marketplace de planos.

## Tech Stack

| Camada | Tecnologia |
|---|---|
| Web / App | Next.js 14 (App Router) · TypeScript · Tailwind CSS |
| Mobile | Capacitor 6 (iOS + Android) |
| Backend / DB | Supabase (PostgreSQL + RLS + Edge Functions) |
| Auth | Supabase Auth (email/magic-link + Apple Sign-In) |
| IA | Google Gemini (insights de treino, coach IA, AI scanner) |
| Pagamentos | MercadoPago · RevenueCat (IAP) |
| Push | Supabase + Capacitor Push Notifications |
| Deploy | Vercel (web) · Xcode + Gradle (nativo) |
| Testes | Vitest (unit) · TypeScript strict |

## Features Principais

- 🏋️ **Treinos**: templates, sessões ativas, timer, sets com RPE/drop-set/warmup
- 📊 **Relatório pós-treino**: PR detection (Epley e1RM), tendência muscular 4 semanas, estimativa de calorias (MET-based)
- 🤖 **IA integrada**: insights Gemini, coach chat VIP, AI assessment scanner
- 👥 **Social**: follows, stories, feed de atividade, notificações push
- 🏃 **Treino em equipe**: presença em tempo real, chat, pause/resume
- 🏆 **Gamificação**: Iron Rank (leaderboard), streaks, badges
- 🎓 **Professor/Aluno**: whitelist, convites, student workouts, marketplace
- 💳 **VIP & Monetização**: tiers com limites, billing por Asaas/MercadoPago

## Setup Rápido

### Pré-requisitos
- Node.js 20.x
- Conta Supabase com projeto configurado

### Instalação

```bash
npm ci --legacy-peer-deps
```

### Variáveis de Ambiente

Copie `.env.local.example` (ou crie `.env.local`) com:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Chave pública do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Chave de serviço (server-side only) |
| `GEMINI_API_KEY` | ✅ | Google Gemini para IA |
| `MERCADOPAGO_ACCESS_TOKEN` | ✅ (pagamentos) | Token do MercadoPago |
| `REVENUECAT_API_KEY` | ✅ (IAP) | RevenueCat para compras nativas |
| `NEXT_PUBLIC_CAPACITOR_URL` | Mobile | URL do servidor local para dev mobile |

### Rodar em modo dev

```bash
npm run dev
# Abre http://localhost:3000
```

### Testes

```bash
npm run test:unit        # Vitest — funções puras
npm run test:smoke       # Testes de integração lightweight
```

## Documentação Adicional

| Doc | Descrição |
|---|---|
| [DEPLOY.md](./DEPLOY.md) | Deploy web (Vercel) passo a passo |
| [MOBILE_GUIDE.md](./MOBILE_GUIDE.md) | Build iOS e Android com Capacitor |
| [PUBLISH_GUIDE.md](./PUBLISH_GUIDE.md) | Publicar na App Store e Google Play |
| [docs/API.md](./docs/API.md) | Sumário dos 125+ endpoints da API |
| [docs/adr/](./docs/adr/) | Architecture Decision Records |
| [CHECKLIST_FUNCIONAL.md](./CHECKLIST_FUNCIONAL.md) | Checklist de features e QA |

## Estrutura do Projeto

```
src/
├── app/            # Next.js App Router (pages + API routes)
│   └── api/        # 125 endpoints agrupados por domínio
├── components/     # Componentes React
├── hooks/          # 54 hooks de estado da aplicação
├── actions/        # Server Actions (Supabase, IA)
├── utils/          # Utilitários puros (calorias, PR, formatters…)
└── lib/            # Logger, Supabase client helpers
```
