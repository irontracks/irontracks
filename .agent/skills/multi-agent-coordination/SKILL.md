---
name: multi-agent-coordination
description: Coordenação de múltiplos agentes trabalhando em paralelo no IronTracks, cada um em um setor isolado para evitar conflitos de arquivos.
---

# Multi-Agent Coordination — IronTracks

## Conceito
Dividir o projeto em **5 setores isolados** para que até 5 agentes possam trabalhar em paralelo, cada um em sua própria conversa, sem conflitos de arquivo.

## Os 5 Setores

### 🏋️ Setor 1: Workout Engine
**Escopo:** Tudo relacionado ao treino ativo e lógica de sessão.
**Arquivos exclusivos:**
- `src/components/workout/**`
- `src/components/ActiveWorkout.tsx`
- `src/lib/finishWorkoutPayload.ts`
- `src/lib/workoutSafetyNet.ts`
- `src/hooks/useSessionSync.ts`
- `src/hooks/useLocalPersistence.ts`
- `src/hooks/useWorkoutRecovery.ts`
- `src/app/api/workouts/**`

### 📊 Setor 2: Dashboard & UI
**Escopo:** Dashboard, componentes visuais, layout, navegação.
**Arquivos exclusivos:**
- `src/components/dashboard/**`
- `src/components/ui/**`
- `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx`
- `src/components/WorkoutReport.tsx`
- `src/components/workout-report/**`
- `src/components/ProfilePage.tsx`
- `src/components/SettingsModal.tsx`

### 🔐 Setor 3: Auth, API & Backend
**Escopo:** Autenticação, APIs, server actions, middleware.
**Arquivos exclusivos:**
- `src/app/api/**` (exceto `/api/workouts/`)
- `src/actions/**`
- `src/middleware.ts`
- `src/utils/supabase/**`
- `src/lib/logger.ts`
- `src/lib/redis*.ts`
- `supabase/**`

### 🤝 Setor 4: Social & Community
**Escopo:** Chat, stories, equipes, convites, notificações.
**Arquivos exclusivos:**
- `src/components/Chat*.tsx`
- `src/components/Story*.tsx`
- `src/components/Team*.tsx`
- `src/components/Invite*.tsx`
- `src/components/Notification*.tsx`
- `src/contexts/TeamWorkoutContext.tsx`
- `src/app/(app)/community/**`
- `src/hooks/useTeam*.ts`

### 📱 Setor 5: Mobile, PWA & Build
**Escopo:** Capacitor, service worker, build nativo, deploy.
**Arquivos exclusivos:**
- `ios/**`
- `android/**`
- `capacitor.config.ts`
- `public/sw.js`
- `next.config.ts`
- `package.json`
- `.github/**`

## Arquivos Compartilhados (⚠️ Zona de Conflito)
Estes arquivos podem ser tocados por mais de um setor. **Apenas UM agente** deve editá-los por vez:
- `src/types/app.ts` — tipos globais
- `src/utils/*.ts` — utilitários
- `src/hooks/use*.ts` — hooks genéricos
- `tailwind.config.ts` / `globals.css`

## Como Usar (Workflow)

### Passo 1: Abrir 5 conversas
Abra 5 conversas separadas no Gemini CLI / IDE, uma para cada setor.

### Passo 2: Prompt de inicialização
Copie e cole o seguinte prompt **adaptado para cada setor**:

```
Você é o agente responsável pelo Setor [N]: [NOME DO SETOR] do IronTracks.

REGRAS:
1. Você SÓ pode editar arquivos dentro do seu escopo (listado abaixo)
2. Se precisar alterar um arquivo fora do escopo, PARE e peça autorização
3. Faça git pull antes de começar qualquer trabalho
4. Faça commits frequentes com prefix: [setor-N]
5. NÃO edite arquivos compartilhados sem confirmar primeiro

Seu escopo de arquivos:
[LISTAR ARQUIVOS DO SETOR]

Tarefa atual:
[DESCREVER A TAREFA]
```

### Passo 3: Coordenação
- Cada agente faz `git pull` antes de começar
- Commits com prefixo: `[setor-1] feat: ...`, `[setor-2] fix: ...`
- Se dois setores precisam do mesmo arquivo → um espera o outro terminar
- Ao finalizar, cada agente faz push

### Passo 4: Merge
Após todos finalizarem, faça um pull final e resolva conflitos (se houver).

## Limitações
- Não há orquestração automática entre agentes
- Cada conversa é independente — agentes não se comunicam entre si
- Conflitos de git são possíveis em arquivos compartilhados
- O usuário é o "Project Manager" que coordena os agentes

## Exemplo Prático
```
Conversa 1: "Agente Setor 1, implemente auto-save no treino ativo"
Conversa 2: "Agente Setor 2, redesenhe o card de Iron Rank"
Conversa 3: "Agente Setor 3, otimize as queries do Supabase"
Conversa 4: "Agente Setor 4, implemente reactions nos stories"
Conversa 5: "Agente Setor 5, configure push notifications no Android"
```

Todas as 5 tarefas rodam em paralelo sem conflitos de arquivo.
