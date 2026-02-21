'use client'

import { useState, useCallback } from 'react'

const ADMIN_PANEL_OPEN_KEY = 'irontracks_admin_panel_open'
const ADMIN_PANEL_TAB_KEY = 'irontracks_admin_panel_tab'
const VALID_TABS = new Set(['dashboard', 'students', 'teachers', 'templates', 'videos', 'broadcast', 'system'])

interface UseAdminPanelStateOptions {
  userRole?: string | null
}

interface UseAdminPanelStateReturn {
  showAdminPanel: boolean
  setShowAdminPanel: (open: boolean) => void
  openAdminPanel: (tab?: unknown) => void
  closeAdminPanel: () => void
  restoreAdminPanelIfNeeded: () => void
}

/**
 * Manages the AdminPanel open/close state and sessionStorage persistence.
 * Handles URL tab param sync and role-based restore on page load.
 */
export function useAdminPanelState({
  userRole,
}: UseAdminPanelStateOptions): UseAdminPanelStateReturn {
  const [showAdminPanel, setShowAdminPanel] = useState(false)

  const setUrlTabParam = useCallback((nextTab: unknown) => {
    try {
      if (typeof window === 'undefined') return
      const tabValue = String(nextTab || '').trim()
      if (!tabValue) return
      const url = new URL(window.location.href)
      url.searchParams.set('tab', tabValue)
      window.history.replaceState({}, '', url)
    } catch { }
  }, [])

  const removeUrlTabParam = useCallback(() => {
    try {
      if (typeof window === 'undefined') return
      const url = new URL(window.location.href)
      url.searchParams.delete('tab')
      window.history.replaceState({}, '', url)
    } catch { }
  }, [])

  const openAdminPanel = useCallback((tab?: unknown) => {
    setShowAdminPanel(true)
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(ADMIN_PANEL_OPEN_KEY, '1')
        if (tab) sessionStorage.setItem(ADMIN_PANEL_TAB_KEY, String(tab))
        if (tab) setUrlTabParam(tab)
      }
    } catch { }
  }, [setUrlTabParam])

  const closeAdminPanel = useCallback(() => {
    setShowAdminPanel(false)
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(ADMIN_PANEL_OPEN_KEY)
        sessionStorage.removeItem(ADMIN_PANEL_TAB_KEY)
      }
    } catch { }
    removeUrlTabParam()
  }, [removeUrlTabParam])

  const restoreAdminPanelIfNeeded = useCallback(() => {
    try {
      if (typeof window === 'undefined') return
      const role = String(userRole || '').toLowerCase()
      const isPrivileged = role === 'admin' || role === 'teacher'
      if (!isPrivileged) return

      const url = new URL(window.location.href)
      const urlTabRaw = String(url.searchParams.get('tab') || '').trim()
      const urlTab = VALID_TABS.has(urlTabRaw) ? urlTabRaw : ''

      const open = sessionStorage.getItem(ADMIN_PANEL_OPEN_KEY)
      const storedTabRaw = String(sessionStorage.getItem(ADMIN_PANEL_TAB_KEY) || '').trim()
      const storedTab = VALID_TABS.has(storedTabRaw) ? storedTabRaw : ''

      const shouldOpen = (open === '1' && !!storedTab) || !!urlTab

      if (!shouldOpen) {
        setShowAdminPanel(false)
        return
      }

      const tab = urlTab || storedTab || 'dashboard'

      // Sync storage if coming from URL
      if (urlTab) {
        try {
          sessionStorage.setItem(ADMIN_PANEL_OPEN_KEY, '1')
          sessionStorage.setItem(ADMIN_PANEL_TAB_KEY, tab)
        } catch { }
      }

      setShowAdminPanel(true)
    } catch { }
  }, [userRole])

  return {
    showAdminPanel,
    setShowAdminPanel,
    openAdminPanel,
    closeAdminPanel,
    restoreAdminPanelIfNeeded,
  }
}
