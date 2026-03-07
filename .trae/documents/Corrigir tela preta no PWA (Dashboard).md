## Diagnóstico (por que pisca e fica preta)
- O piscar confirma que o HTML inicial chega a renderizar e o problema acontece **no Client** logo após a hidratação/montagem.
- Na rota `/dashboard`, o server já garante `user.id` antes de renderizar ([dashboard/page.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/page.tsx#L73-L99)). Então a causa mais provável é:
  - **Hydration mismatch no iOS/Safari** (datas/Intl/locale divergem entre server e device) em componentes do dashboard.
  - **Acesso a campos de `user/profile` em estado parcial** (ex.: `user` existe, mas algum campo esperado é `undefined`) em algum trecho do client (ex.: `IronTracksAppClient 3.js`).

## Arquitetura atual da Dashboard (para saber onde mexer)
- `/dashboard` → [page.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/page.tsx) (server) → [DashboardClientEntry.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/DashboardClientEntry.tsx) → [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js)

## Correção seguindo seus passos
### 1) Proteção contra Null/Undefined (user/profile)
- Auditar e ajustar em [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js):
  - Trocar acessos diretos por `user?.id`, `user?.email`, `initialProfile?.role`, etc.
  - Blindar pontos críticos como `fetchWorkouts` (hoje há trechos que assumem `currentUser.id` sem `?.id`).
  - Garantir defaults seguros em props passadas para componentes (ex.: `settings={... ?? null}`, `userRole={String(user?.role || '')}` já existe em alguns pontos, mas vamos padronizar).

### 2) Estado de Carregamento (Loading State) / Trava de renderização
- Implementar um “gate” no topo do client para nunca renderizar a dashboard completa sem usuário válido:
  - `if (authLoading || !user?.id) return <LoadingScreen />` (já existe, mas vamos reforçar para evitar estados intermediários em iOS).
  - Adicionar também um loading “super cedo” no wrapper `IronTracksAppClient` para impedir render parcial durante hidratação.

### 3) Evitar Hydration Mismatch (iOS/Safari)
- Adicionar `isMounted` no nível mais alto do client ([IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js)):
  - `const [isMounted, setIsMounted] = useState(false)`
  - `useEffect(() => setIsMounted(true), [])`
  - `if (!isMounted) return <LoadingScreen />`
- Complemento: onde houver render de datas/Intl em textos, aplicar `suppressHydrationWarning` nos nós específicos (somente onde fizer sentido), para evitar o React abortar a hidratação.

### 4) Fallback de Emergência (ErrorBoundary + route error)
- O app já tem [ErrorBoundary.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ErrorBoundary.js) com botão de reload.
- Para impedir “tela preta sem saída” mesmo quando o erro ocorre antes do boundary, criar **Error Boundary do App Router**:
  - Novo arquivo `src/app/(app)/dashboard/error.tsx` (client) com tela de erro + ações:
    - tentar `window.location.reload()` automaticamente 1 vez (com flag em `sessionStorage` para evitar loop)
    - botão “Ir para Login” (`window.location.href='/?next=/dashboard'`)
- (Opcional) criar `src/app/(app)/dashboard/loading.tsx` com spinner centralizado para transições.

## Verificação
- Rodar build/lint.
- Testar no PWA/Safari iOS:
  - abrir `/dashboard` (sem piscar/tela preta)
  - simular sessão expirada (deve cair no loading e redirecionar)
  - forçar erro (confirmar que `error.tsx` aparece e oferece reload/login)
