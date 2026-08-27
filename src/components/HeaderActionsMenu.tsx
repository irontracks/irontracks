'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import {
  Apple,
  Bell,
  Calendar,
  Cog,
  Command,
  CreditCard,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Sparkles,
  Crown,
} from 'lucide-react'
import { isIosNative } from '@/utils/platform'
import { backdropProps } from '@/utils/a11y/backdrop'
import { useDialog } from '@/contexts/DialogContext'

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
  onOpenTeacherArea?: () => void
  onOpenChatList?: () => void
  onOpenHistory?: () => void
  /** Histórico de REFEIÇÕES — irmão do de treinos, e onde o dono foi procurar. */
  onOpenNutritionHistory?: () => void
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

/**
 * Badge de "tem coisa nova" no menu do avatar.
 *
 * Era `bg-red-500 text-white`. Vermelho neste app quer dizer ERRO e PERDA —
 * meta estourada, excluir, falhou. Uma mensagem nova não é nenhuma dessas
 * coisas, e gastar o vermelho nela é o mesmo defeito que a paleta de macros já
 * pagou caro: quando tudo é alarme, o alarme não avisa mais nada.
 *
 * O dourado é a cor de "olhe aqui" no IronTracks, e este é o badge padrão do
 * design system. Ele não some de vista: o item do menu só muda de cor no HOVER,
 * que no celular não existe — em repouso, o badge é o único sinal, e por isso
 * ele fica, apenas na cor certa.
 *
 * O ponto vermelho SOBRE O AVATAR (menu fechado) continua vermelho de
 * propósito: ali vale a convenção de plataforma que o usuário já traz do iOS,
 * é o único indicador quando o menu está fechado, e um ponto dourado sobre um
 * cabeçalho dourado desapareceria.
 */
const NOVO_BADGE =
  'text-[10px] font-bold bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 rounded-full px-2 py-0.5 leading-none'

/**
 * Item do menu.
 *
 * ⚠️ `gold` significa UMA coisa: **há algo vivo aqui agora** (não lido, pendente).
 * Ele não marca categoria nem convida para nada. Até 12/08/2026 marcava as três
 * coisas ao mesmo tempo — 5 itens dourados, 4 deles fixos (professor, painel,
 * agenda, cobranças) e um convite ("Ver tour") — e o único dourado que carregava
 * informação perecível, o de mensagem não lida, ficava indistinguível do resto.
 * Quando um sinal significa três coisas, não significa nenhuma.
 *
 * Pertencimento a "área de coach" é comunicado pelo AGRUPAMENTO (os divisores já
 * separam o bloco), que faz o trabalho sem gastar o pigmento da ação primária.
 */
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
  onOpenTeacherArea,
  onOpenChatList,
  onOpenHistory,
  onOpenNutritionHistory,
  onOpenNotifications,
  onLogout,
  onOpenSchedule,
  onOpenWallet,
  onOpenSettings,
  onOpenTour,
  onOpenProfile,
}: HeaderActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const { alert, confirm } = useDialog()
  const [cancellingVip, setCancellingVip] = useState(false)
  const [hideVipCtas, setHideVipCtas] = useState(false)
  const [portalMounted, setPortalMounted] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const openedAtRef = useRef(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { setHideVipCtas(isIosNative()) }, [])
  useEffect(() => { setPortalMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const close = () => setOpen(false)
  const closeFromBackdrop = () => {
    // Guard contra ghost clicks do iOS WKWebView (~300ms após abrir)
    if (Date.now() - openedAtRef.current < 350) return
    setOpen(false)
  }

  const cancelVip = async () => {
    if (cancellingVip) return
    /**
     * Diálogo do APP, não o do navegador. O `window.confirm` sai sem a
     * identidade visual, sem o vermelho de destrutivo e sem safe-area no
     * iPhone — e este é o único ponto do menu que ainda usava o nativo.
     *
     * ⚠️ O item aparece para TODO usuário web, tenha assinatura ou não: o menu
     * não conhece o status VIP, e buscá-lo custaria um fetch a cada abertura.
     * Por isso o texto não pressupõe que exista assinatura — quem não tem
     * recebe "nenhuma assinatura ativa" logo depois, que é o caminho que a
     * rota já trata.
     */
    const confirmed = await confirm(
      'Se houver uma assinatura ativa nesta conta, ela será cancelada.',
      'Cancelar assinatura VIP?',
      { confirmText: 'Cancelar assinatura', cancelText: 'Manter', destructive: true },
    )
    if (!confirmed) return
    setCancellingVip(true)
    try {
      const res = await fetch('/api/app/subscriptions/cancel-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) {
        await alert(String(json?.error || 'Falha ao cancelar assinatura.'))
        return
      }
      // Apple IAP: server returns cancelled=false + apple_iap=true + a friendly
      // message explaining that cancellation has to happen through iOS Settings.
      // Without this branch the UI would say "Nenhuma assinatura ativa encontrada"
      // which is both wrong (they DO have an active Apple sub) and harmful
      // (Apple keeps charging).
      if (json?.apple_iap) {
        await alert(String(json?.message || 'Para cancelar, vá em Ajustes do iPhone → Apple ID → Assinaturas → IronTracks.'))
        return
      }
      if (!json?.cancelled) {
        await alert('Nenhuma assinatura ativa encontrada.')
        return
      }
      await alert('Assinatura cancelada.')
    } catch {
      await alert('Falha ao cancelar assinatura.')
    } finally {
      setCancellingVip(false)
      close()
    }
  }

  const displayName = String(user?.displayName || '').trim() || 'Usuário'
  const initial = displayName.slice(0, 1).toUpperCase()
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
    const next = !open
    if (next && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownStyle({
        position: 'fixed',
        right: `${window.innerWidth - rect.right}px`,
        top: `${rect.bottom + 8}px`,
        zIndex: 9999,
      })
      openedAtRef.current = Date.now()
    }
    setOpen(next)
  }

  return (
    <div className="relative">
      {/* Story Ring Avatar trigger */}
      <button
        ref={triggerRef}
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
        {/* Sem anel de story: o próprio story agora aparece na fileira STORIES com
            a prévia da mídia, então o anel virou redundante. Fica só uma borda
            neutra discreta delimitando o avatar do menu. */}
        <div
          className="w-[50px] h-[50px] rounded-full flex items-center justify-center p-[2px] border border-neutral-700 transition-colors"
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

      {open && portalMounted && createPortal(
        <>
          {/* Backdrop — fora do stacking context do header, sem clipping */}
          {/* O véu NÃO é um controle: como <button> ele entrava na ordem de foco
              e era anunciado "Fechar menu, botão" — um alvo de tela inteira que
              promete uma ação que o próprio menu já oferece. `backdropProps` é
              o helper que o repo criou para isto no PR #779 (role presentation,
              tabIndex -1, e o guard de `e.target === e.currentTarget`); este
              ponto tinha escapado da varredura. */}
          <div
            {...backdropProps(closeFromBackdrop, 'Fechar menu')}
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
          />

          {/* Dropdown panel — portal no document.body, posição calculada via getBoundingClientRect */}
          <div
            className="w-[min(18rem,calc(100vw-2rem))] rounded-2xl overflow-hidden animate-dropdown-in"
            style={{
              ...dropdownStyle,
              background: 'linear-gradient(160deg, #161200 0%, #0a0a0a 25%)',
              boxShadow:
                '0 32px 64px -12px rgba(0,0,0,0.95), 0 0 0 1px rgba(234,179,8,0.18), inset 0 1px 0 rgba(234,179,8,0.22)',
            }}
          >
            {/* Gold shimmer top line */}
            <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/80 to-transparent" />

            {/* User mini-profile */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5">
              <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-yellow-500/60 flex-shrink-0">
                {user?.photoURL ? (
                  <Image
                    src={user.photoURL}
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
                    <span className="text-[10px] text-neutral-400">Ver meu perfil</span>
                  )}
                </div>
              </button>
            </div>

            {/* Menu items — staggered entrance */}
            <div className="p-2 space-y-0.5 stagger-children">

              {/* Coach tools group */}
              {isCoach && (
                <>
                  {/* Área do professor: pra TODO coach (teacher e admin). O admin ainda
                      tem o "Painel de Controle" (painel completo) logo abaixo. */}
                  <MenuItem
                    icon={<LayoutDashboard size={14} className="text-neutral-400" />}
                    label="Área do professor"
                    data-tour="menu-coach-tools"
                    onClick={() => { onOpenTeacherArea?.(); close() }}
                  />
                  {user?.role === 'admin' && (
                    <MenuItem
                      icon={<Command size={14} className="text-neutral-400" />}
                      label="Painel de Controle"
                      onClick={() => { onOpenAdmin?.(); close() }}
                    />
                  )}
                  <MenuItem
                    icon={<Calendar size={14} className="text-neutral-400" />}
                    label="Agenda"
                    onClick={() => { onOpenSchedule?.(); close() }}
                  />
                  {!hideVipCtas && (
                    <MenuItem
                      icon={<CreditCard size={14} className="text-neutral-400" />}
                      // Matches the "COBRANÇAS" tab label inside the Admin
                      // Panel. The previous "Carteira" label created a
                      // same-destination-different-name inconsistency that
                      // surfaced during the UI audit.
                      label="Cobranças"
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
                    <span className={NOVO_BADGE}>
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
                    <span className={NOVO_BADGE}>
                      Novo
                    </span>
                  ) : undefined
                }
                onClick={() => { onOpenChatList?.(); close() }}
              />

              <Divider />

              {/* Utility */}
              {/* Dois históricos, nomeados: "Histórico" sozinho virou ambíguo no dia
                  em que a nutrição ganhou o seu — e o dono procurou o de refeições
                  aqui, não dentro da aba. */}
              <MenuItem
                icon={<History size={14} className="text-neutral-400" />}
                label="Histórico de treinos"
                onClick={() => { onOpenHistory?.(); close() }}
              />

              {onOpenNutritionHistory && (
                <MenuItem
                  icon={<Apple size={14} className="text-neutral-400" />}
                  label="Histórico de refeições"
                  onClick={() => { onOpenNutritionHistory?.(); close() }}
                />
              )}

              <MenuItem
                icon={<Sparkles size={14} className="text-neutral-400" />}
                label="Ver tour"
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
        </>,
        document.body
      )}
    </div>
  )
}
