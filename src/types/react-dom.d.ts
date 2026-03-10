// Type declaration shim for react-dom (needed because @types/react-dom is missing from devDependencies)
// react-dom 19.x exports createPortal directly
declare module 'react-dom' {
  import type { ReactNode } from 'react'
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: null | string): ReactNode
  export function flushSync<R>(fn: () => R): R
  export function unmountComponentAtNode(container: Element | DocumentFragment): boolean
  export const version: string
}
