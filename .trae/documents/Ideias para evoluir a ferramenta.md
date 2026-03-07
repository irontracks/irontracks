## Princípios de segurança (sem quebrar o app)
- **Tudo atrás de feature flags** (padrão OFF) e com **kill switch** global.
- **Backwards compatible**: migrations com defaults seguros + código tolerante a colunas/tabelas ausentes.
- **Rollout em camadas**: primeiro só Admin/Teacher, depois opt-in por usuário, depois gradual.
- **Telemetria/diagnóstico**: logar falhas (client e API) sem expor dados sensíveis.
- **Verificação sempre**: lint/build + testes smoke + fluxos principais (login, treino, finalizar, dashboard).

## Base obrigatória (antes de “ligar” qualquer feature)
1) **Feature Flags centralizadas**
- Criar uma camada `featureFlags` que lê de `user_settings.preferences` (com defaults) e expõe helpers: `isEnabled('offline_v2')`, `isEnabled('teamwork_v2')`, etc.
- Adicionar UI no AdminPanel para toggles (somente admin/teacher).

2) **Compatibilidade e fallback**
- Sempre que uma feature precisar de backend novo: se a rota/migration não existir, cair em fallback sem travar UI.

## Aplicação “de tudo” (organizado em épicos, um por vez)

### Épico A — Treino em Equipe V2 (em cima do que já existe)
- **Link/QR de convite** (reduz fricção do InviteManager).
- **Presença / sala do treino** (status: aquecendo/em treino/finalizou) e lista de participantes.
- **Leave session real no DB** (remover participante, e finalizar sessão quando host sair).
- **Permissões claras** (host/participante/admin) e RLS reforçada.

### Épico B — Offline + Sync V2 (evoluir o que já começamos)
- **Event queue** (ações do treino como eventos) com replay e idempotência.
- **Conflitos**: merge por ID de série e LWW só para campos simples.
- **UI de pendências**: tela/lista “Pendentes” com retry manual + badge.

### Épico C — Stories/Relatório V2 (confiável + automático)
- **Auto-story pós-treino** (1 clique, templates).
- **Story do time** (se TeamWorkout ativo, cria highlights).
- **Relatório semanal 1 página** (PDF/share), atleta e equipe.
- Continuar garantindo preview estável (foto/vídeo) e UX “à prova de Safari”.

### Épico D — Coach/Admin (B2B)
- **Coach Inbox com alertas explicáveis** (faltas, RPE alto, quedas).
- **Playbooks/templates aplicáveis a times**.
- **Auditoria** de alterações (quem alterou treino/carga).

## Estratégia de entrega (sem surpresa para usuários)
- Implementar um épico por vez, **sempre com flag OFF**.
- Validar com usuários internos (admin/teacher) → corrigir → habilitar opt-in.
- Só depois ativar para alunos.

## Checklist de validação por épico
- Fluxos críticos intactos: login, dashboard, iniciar treino, registrar séries, finalizar, ver histórico.
- Sem regressões de performance (carregamento/scroll).
- Lint/build passando.

## Próximo passo imediato (o que vou implementar primeiro)
- Implementar a **infra de feature flags + kill switch** e plugar nos módulos (team/offline/stories).
- Depois seguir com o **Épico A (TeamWorkout V2)**, porque já temos a base pronta no app e é a evolução mais direta.

Se você confirmar esse plano, eu começo pelo foundation (flags) e em seguida faço o Épico A completo, tudo com fallback e rollout seguro.