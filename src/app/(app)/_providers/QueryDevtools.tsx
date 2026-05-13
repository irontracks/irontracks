/**
 * @module QueryDevtools
 *
 * Wrapper pra devtools do TanStack Query. Carregada via dynamic import
 * NoSSR só em dev (ver QueryProvider). Tree-shake garante zero KB em prod.
 */
'use client'

import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export function QueryDevtools() {
  return <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
}
