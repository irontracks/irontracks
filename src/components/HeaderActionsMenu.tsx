'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import {
  Bell,
  Calendar,
  Camera,
  Cog,
  Command,
  CreditCard,
  History,
  Lock,
  LogOut,
  MessageSquare,
  Sparkles,
  Users,
  Crown,
} from 'lucide-react'
import { isIosNative } from '@/utils/platform'
import dynamic from 'next/dynamic'

const ChangePasswordModal = dynamic(() => import('@/components/settings/ChangePasswordModal'), { ssr: false })
const AvatarUploadModal = dynamic(() => import('@/components/settings/AvatarUploadModal'), { ssr: false })

interface HeaderActionsMenuProps {
  user: {
    photoURL?: string | null
    displayName?: string | null
    role?: string | null
  } | null
  isCoach?: boolean
  hasUnreadChat?: boolean
  hasUnreadNotification?: boolean
  hasActiveStory?: boolean      // ← true if user has a live story
  onAddStory?: () => void       // ← opens story creator on long press
  onOpenAdmin?: () => void
  onOpenChatList?: () => void
  onOpenGlobalChat?: () => void
  onOpenHistory?: () => void
  onOpenNotifications?: () => void
  onLogout?: () => void
  onOpenSchedule?: () => void
  onOpenWallet?: () => void
  onOpenSettings?: () => void
  onOpenTour?: () => void
  onOpenProfile?: () => void
}

function IconBox({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <div
      className={[
        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
        gold
          ? 'bg-yellow-500/15 border border-yellow-500/25'
          : 'bg-white/5 border border-white/8',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  gold = false,
  badge,
  danger = false,
  onClick,
  disabled = false,
  'data-tour': dataTour,
}: {
  icon: React.ReactNode
  label: string
  gold?: boolean
  badge?: React.ReactNode
  danger?: boolean
  onClick?: () => void
  disabled?: boolean
  'data-tour'?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-tour={dataTour}
      className={[
        'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 disabled:opacity-50',
        danger
          ? 'hover:bg-red-500/10 active:bg-red-500/15'
          : gold
            ? 'hover:bg-yellow-500/8 active:bg-yellow-500/12'
            : 'hover:bg-white/6 active:bg-white/10',
      ].join(' ')}
    >
      <IconBox gold={gold && !danger}>
        {icon}
      </IconBox>
      <span
        className={[
          'flex-1 text-[13.5px] font-medium text-left transition-colors',
          danger
            ? 'text-red-400 group-hover:text-red-300'
            : gold
              ? 'text-yellow-100/90 group-hover:text-yellow-50'
              : 'text-neutral-300 group-hover:text-white',
        ].join(' ')}
      >
        {label}
      </span>
      {badge}
    </button>
  )
}

function Divider() {
  return (
    <div className="mx-3 my-1">
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  )
}

export default function HeaderActionsMenu({
  user,
  isCoach,
  hasUnreadChat,
  hasUnreadNotification,
  hasActiveStory = false,
  onAddStory,
  onOpenAdmin,
  onOpenChatList,
  onOpenGlobalChat,
  onOpenHistory,
  onOpenNotifications,
  onLogout,
  onOpenSchedule,
  onOpenWallet,
  onOpenSettings,
  onOpenTour,
  onOpenProfile,
}: HeaderActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [cancellingVip, setCancellingVip] = useState(false)
  const [hideVipCtas, setHideVipCtas] = useState(false)
  useEffect(() => { setHideVipCtas(isIosNative()) }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const close = () => setOpen(false)

  const cancelVip = async () => {
    if (cancellingVip) return
    const confirmed = window.confirm('Cancelar sua assinatura VIP agora?')
    if (!confirmed) return
    setCancellingVip(true)
    try {
      const res = await fetch('/api/app/subscriptions/cancel-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) {
        window.alert(String(json?.error || 'Falha ao cancelar assinatura.'))
        return
      }
      if (!json?.cancelled) {
        window.alert('Nenhuma assinatura ativa encontrada.')
        return
      }
      window.alert('Assinatura cancelada.')
    } catch {
      window.alert('Falha ao cancelar assinatura.')
    } finally {
      setCancellingVip(false)
      close()
    }
  }

  // Password change + avatar upload modals
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [avatarUploadOpen, setAvatarUploadOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [localPhotoURL, setLocalPhotoURL] = useState<string | null>(null)

  // Fetch user data when menu opens (for modals)
  useEffect(() => {
    if (!open) return
    import('@/utils/supabase/client').then(({ createClient }) => {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }) => {
        const uid = String(data?.user?.id || '')
        setUserEmail(String(data?.user?.email || ''))
        setUserId(uid)
        if (uid) {
          supabase.from('profiles').select('photo_url').eq('id', uid).maybeSingle()
            .then(({ data: profile }) => {
              setLocalPhotoURL(String(profile?.photo_url || data?.user?.user_metadata?.avatar_url || '') || null)
            })
        }
      })
    })
  }, [open])

  const displayName = String(user?.displayName || '').trim() || 'Usuário'
  const initial = displayName.slice(0, 1).toUpperCase()
  const effectivePhotoURL = localPhotoURL || user?.photoURL || null
  const roleLabel = isCoach ? 'Coach' : user?.role === 'admin' ? 'Admin' : null

  // Long-press detection for "add story"
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = React.useRef(false)

  const handlePointerDown = () => {
    didLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      if (hasActiveStory) {
        // Long press + has story → view own story
        try { window.dispatchEvent(new CustomEvent('irontracks:stories:view-mine')) } catch { }
      } else {
        // Long press + no story → add story
        try { window.dispatchEvent(new CustomEvent('irontracks:stories:open-creator')) } catch { }
      }
    }, 600)
  }
  const handlePointerUp = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }
  const handleClick = () => {
    if (didLongPress.current) { didLongPress.current = false; return }
    // Short tap ALWAYS opens menu
    setOpen((v) => !v)
  }

  return (
    <>
    <div className="relative">
      {/* Story Ring Avatar trigger */}
      <button
        type="button"
        data-tour="header-menu"
        aria-label="Menu"
        aria-expanded={open}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); return false }}
        className="relative focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-neutral-950 rounded-full select-none"
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
        title={onAddStory ? 'Toque para menu • Segure para adicionar story' : 'Menu'}
      >
        {/* Outer ring — pulsing yellow when has story, dashed when empty */}
        <div
          className={[
            'w-[50px] h-[50px] rounded-full flex items-center justify-center transition-all duration-300',
            hasActiveStory
              ? 'p-[2.5px] border-[3px] border-yellow-400 shadow-[0_0_12px_2px_rgba(234,179,8,0.45)] animate-pulse'
              : 'p-[2px] border-2 border-dashed border-yellow-500/50',
          ].join(' ')}
          style={{ WebkitTouchCallout: 'none', pointerEvents: 'none' } as React.CSSProperties}
        >
          {/* Inner avatar */}
          <div className="w-[42px] h-[42px] rounded-full overflow-hidden bg-neutral-900 flex items-center justify-center">
            {user?.photoURL ? (
              <Image
                src={user.photoURL} width={42} height={42}
                className="w-full h-full object-cover pointer-events-none"
                alt="Perfil" unoptimized draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-neutral-800 flex items-center justify-center font-black text-yellow-500 text-sm select-none">
                {initial}
              </div>
            )}
          </div>
        </div>

        {/* Notification badge — pop-in animation */}
        {!open && (hasUnreadChat || hasUnreadNotification) && (
          <span
            className="pointer-events-none absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-neutral-950 shadow-lg shadow-red-900/60 badge-glow"
            style={{ animation: 'prBadgeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={close}
            className="fixed inset-0 z-40"
          />

          {/* Dropdown panel */}
          <div
            className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-2rem))] z-50 rounded-2xl overflow-hidden animate-dropdown-in"
            style={{
              background: 'linear-gradient(160deg, #161200 0%, #0c0c0c 25%)',
              boxShadow:
                '0 32px 64px -12px rgba(0,0,0,0.95), 0 0 0 1px rgba(234,179,8,0.18), inset 0 1px 0 rgba(234,179,8,0.22)',
            }}
          >
            {/* Gold shimmer top line */}
            <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/80 to-transparent" />

            {/* User mini-profile */}
            <div className="px-4 py-3.5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-yellow-500/60 flex-shrink-0">
                  {effectivePhotoURL ? (
                    <Image
                      src={effectivePhotoURL}
                      width={36}
                      height={36}
                      className="w-full h-full object-cover"
                      alt="Perfil"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-neutral-800 flex items-center justify-center font-black text-yellow-500 text-xs">
                      {initial}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { onOpenProfile?.(); close() }}
                  className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity active:scale-[0.98]"
                >
                  <p className="text-[13px] font-semibold text-white truncate">{displayName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {roleLabel ? (
                      <>
                        <Crown size={9} className="text-yellow-500" />
                        <span className="text-[10px] font-bold text-yellow-500/90 uppercase tracking-wide">{roleLabel}</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-neutral-500">Ver meu perfil</span>
                    )}
                  </div>
                </button>
              </div>

              {/* Account quick actions */}
              <div className="flex items-center gap-2 mt-2.5 pl-12">
                <button
                  type="button"
                  onClick={() => { close(); setAvatarUploadOpen(true) }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700/60 text-[10px] font-bold text-neutral-300 hover:bg-neutral-700/80 transition-colors"
                >
                  <Camera size={10} />
                  Trocar Foto
                </button>
                <button
                  type="button"
                  onClick={() => { close(); setChangePasswordOpen(true) }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700/60 text-[10px] font-bold text-neutral-300 hover:bg-neutral-700/80 transition-colors"
                >
                  <Lock size={10} />
                  Trocar Senha
                </button>
              </div>
            </div>

            {/* Menu items — staggered entrance */}
            <div className="p-2 space-y-0.5 stagger-children">

              {/* Coach tools group */}
              {isCoach && (
                <>
                  <MenuItem
                    icon={<Command size={14} className="text-yellow-400" />}
                    label="Painel de Controle"
                    gold
                    data-tour="menu-coach-tools"
                    onClick={() => { onOpenAdmin?.(); close() }}
                  />
                  <MenuItem
                    icon={<Calendar size={14} className="text-yellow-400" />}
                    label="Agenda"
                    gold
                    onClick={() => { onOpenSchedule?.(); close() }}
                  />
                  {!hideVipCtas && (
                    <MenuItem
                      icon={<CreditCard size={14} className="text-yellow-400" />}
                      label="Carteira"
                      gold
                      onClick={() => { onOpenWallet?.(); close() }}
                    />
                  )}
                  <Divider />
                </>
              )}

              {/* Communication */}
              <MenuItem
                icon={<Bell size={14} className={hasUnreadNotification ? 'text-yellow-400' : 'text-neutral-400'} />}
                label="Notificações"
                gold={!!hasUnreadNotification}
                badge={
                  hasUnreadNotification ? (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-2 py-0.5 leading-none">
                      Novo
                    </span>
                  ) : undefined
                }
                onClick={() => { onOpenNotifications?.(); close() }}
              />
              <MenuItem
                icon={<MessageSquare size={14} className={hasUnreadChat ? 'text-yellow-400' : 'text-neutral-400'} />}
                label="Conversas"
                gold={!!hasUnreadChat}
                badge={
                  hasUnreadChat ? (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-2 py-0.5 leading-none">
                      Novo
                    </span>
                  ) : undefined
                }
                onClick={() => { onOpenChatList?.(); close() }}
              />
              <MenuItem
                icon={<Users size={14} className="text-neutral-400" />}
                label="Iron Lounge"
                onClick={() => { onOpenGlobalChat?.(); close() }}
              />

              <Divider />

              {/* Utility */}
              <MenuItem
                icon={<History size={14} className="text-neutral-400" />}
                label="Histórico"
                onClick={() => { onOpenHistory?.(); close() }}
              />

              <MenuItem
                icon={<Sparkles size={14} className="text-yellow-400" />}
                label="Ver tour"
                gold
                data-tour="menu-tour"
                onClick={() => { onOpenTour?.(); close() }}
              />
              <MenuItem
                icon={<Cog size={14} className="text-neutral-400" />}
                label="Configurações"
                onClick={() => { onOpenSettings?.(); close() }}
              />

              {/* Cancel VIP */}
              {!hideVipCtas && (
                <>
                  <Divider />
                  <MenuItem
                    icon={<CreditCard size={14} className="text-red-400" />}
                    label="Cancelar assinatura VIP"
                    danger
                    disabled={cancellingVip}
                    onClick={cancelVip}
                  />
                </>
              )}

              <Divider />

              {/* Logout */}
              <MenuItem
                icon={<LogOut size={14} className="text-red-400" />}
                label="Sair"
                danger
                onClick={() => { onLogout?.(); close() }}
              />
            </div>

            {/* Gold shimmer bottom line */}
            <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
          </div>
        </>
      )}
    </div>

    {/* Password change modal */}
    <ChangePasswordModal isOpen={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} userEmail={userEmail} />

    {/* Avatar upload modal */}
    <AvatarUploadModal
      isOpen={avatarUploadOpen}
      onClose={() => setAvatarUploadOpen(false)}
      currentPhotoURL={effectivePhotoURL}
      userId={userId}
      onPhotoUpdated={(url) => { setLocalPhotoURL(url); setAvatarUploadOpen(false) }}
    />
    </>
  )
}
