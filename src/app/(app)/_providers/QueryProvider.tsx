/**
 * @module QueryProvider
 *
 * Provider do TanStack Query v5. PR-A da modernização React 19
 * (REACT19_MIGRATION_PLAN.md).
 *
 * Por que `(app)/_providers/` e não na raiz `app/layout.tsx`:
 *   - Landing/login NÃO precisam de Query (zero hooks de fetch ali).
 *   - Provider só monta dentro de `(app)/layout.tsx` (rotas autenticadas)
 *     → não infla bundle da home pública.
 *
 * Config defensiva pra o contexto mobile do IronTracks:
 *   - `refetchOnWindowFocus: false`: Capacitor app dispara focus events
 *     ruidosos a cada gesto (drawer, modal). Refetch agressivo aqui torra
 *     dados móveis sem ganho real.
 *   - `staleTime: 30s`: dados "frescos" por 30s — suficiente pra evitar
 *     refetch instantâneo após hydration (initialData do SSR) e curto
 *     o suficiente pra refletir mudanças em treino ativo.
 *   - `gcTime: 5min`: cache em memória após unmount; permite voltar de
 *     uma view e ter dado imediato.
 *   - `networkMode: 'offlineFirst'`: prioridade pra cache local quando
 *     offline (academia subsolo). Combinado com `initialData` via
 *     localStorage/IDB, faz UI aparecer instantâneo mesmo sem rede.
 *   - `retry: 2`: 2 tentativas, com backoff exponencial nativo do Query.
 *
 * Mutations:
 *   - `onError` global captura no Sentry pra surfacear bugs em prod.
 *     Toast localizado fica responsabilidade do mutation handler.
 */
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import dynamic from 'next/dynamic'

const QueryDevtools = dynamic(
  () => import('./QueryDevtools').then((m) => m.QueryDevtools),
  { ssr: false },
)

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState com lazy init garante 1 instância por sessão de cliente.
  // Re-render do provider não recria o QueryClient (que limparia o cache).
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 2,
        networkMode: 'offlineFirst',
      },
      mutations: {
        onError: (error) => {
          Sentry.captureException(error, { tags: { source: 'tanstack-mutation' } })
        },
      },
    },
  }))

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV !== 'production' ? <QueryDevtools /> : null}
    </QueryClientProvider>
  )
}
