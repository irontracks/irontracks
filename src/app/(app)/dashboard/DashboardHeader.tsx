'use client'

import React from 'react'
import { Crown } from 'lucide-react'
import HeaderActionsMenu from '@/components/HeaderActionsMenu'
import type { AdminUser } from '@/types/admin'

interface SyncState {
    pending?: number
    failed?: number
    online?: boolean
    syncing?: boolean
}

interface VipAccess {
    hasVip?: boolean
}

interface DashboardHeaderProps {
    isCoach: boolean
    view: string
    user: AdminUser | null
    hasUnreadChat: boolean
    hasUnreadNotification: boolean
    hasActiveStory?: boolean      // ← user has a live story
    hideVipOnIos: boolean
    vipAccess: VipAccess | null
    syncState: SyncState | null
    userSettings: Record<string, unknown> | null
    isHeaderVisible: boolean
    coachPending: boolean
    onGoHome: () => void
    onOpenVip: () => void
    onOpenAdmin: () => void
    onOpenChatList: () => void
    onOpenGlobalChat: () => void
    onOpenHistory: () => void
    onOpenNotifications: () => void
    onOpenSchedule: () => void
    onOpenWallet: () => void
    onOpenSettings: () => void
    onOpenTour: () => void
    onOpenProfile: () => void
    onLogout: () => void
    onOfflineSyncOpen: () => void
    onAcceptCoach: () => Promise<void>
    onAddStory?: () => void        // ← triggers story creator from header long-press
}

export function DashboardHeader({
    isCoach, user, hasUnreadChat, hasUnreadNotification, hasActiveStory,
    hideVipOnIos, vipAccess, syncState, userSettings,
    isHeaderVisible, coachPending,
    onGoHome, onOpenVip, onOpenAdmin, onOpenChatList, onOpenGlobalChat,
    onOpenHistory, onOpenNotifications, onOpenSchedule, onOpenWallet,
    onOpenSettings, onOpenTour, onOpenProfile, onLogout, onOfflineSyncOpen, onAcceptCoach,
    onAddStory,
}: DashboardHeaderProps) {
    if (!isHeaderVisible) return null

    const pending = Number(syncState?.pending || 0)
    const failed = Number(syncState?.failed || 0)
    const online = syncState?.online !== false
    const offlineSyncV2Enabled = userSettings?.featuresKillSwitch !== true && userSettings?.featureOfflineSyncV2 === true

    const syncBadge = (() => {
        if (!online) {
            return <div className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-black uppercase tracking-widest">Offline</div>;
        }
        if (offlineSyncV2Enabled && (pending > 0 || failed > 0)) {
            return (
                <button type="button" onClick={onOfflineSyncOpen} className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs font-black uppercase tracking-widest hover:bg-yellow-500/15" title="Abrir central de pendências">
                    {syncState?.syncing ? 'Sincronizando' : 'Pendentes'}: {pending}{failed > 0 ? ` • Falhas: ${failed}` : ''}
                </button>
            )
        }
        if (pending > 0) {
            return <div className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs font-black uppercase tracking-widest">{syncState?.syncing ? 'Sincronizando' : 'Pendentes'}: {pending}</div>;
        }
        return null;
    })();

    return (
        <>
            <div className="bg-neutral-950 flex justify-between items-center fixed top-0 left-0 right-0 z-40 border-b border-zinc-800 px-6 shadow-lg pt-[env(safe-area-inset-top)] min-h-[calc(4rem+env(safe-area-inset-top))]">
                <div className="flex items-center cursor-pointer group" onClick={onGoHome}>
                    <div className="flex items-center gap-2">
                        {/* Gold dumbbell icon — inline SVG, transparent bg, scales perfectly */}
                        <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0 group-hover:opacity-80 transition-opacity" style={{ filter: 'drop-shadow(0 0 4px rgba(245,158,11,0.5))' }}>
                            <rect x="0" y="3" width="3" height="8" rx="1.5" fill="#f59e0b"/>
                            <rect x="3" y="1" width="2.5" height="12" rx="1.25" fill="#fbbf24"/>
                            <rect x="5.5" y="5.5" width="11" height="3" rx="1.5" fill="#f59e0b"/>
                            <rect x="16.5" y="1" width="2.5" height="12" rx="1.25" fill="#fbbf24"/>
                            <rect x="19" y="3" width="3" height="8" rx="1.5" fill="#f59e0b"/>
                        </svg>
                        <h1
                            className="text-[1.7rem] font-black italic leading-none select-none group-hover:opacity-80 transition-opacity"
                            style={{ letterSpacing: '-0.04em' }}
                        >
                            <span style={{ color: '#ffffff' }}>IRON</span><span
                                style={{
                                    color: '#f59e0b',
                                    textShadow: '0 0 20px rgba(245,158,11,0.6), 0 0 40px rgba(245,158,11,0.2)',
                                }}
                            >TRACKS</span>
                        </h1>
                    </div>
                    {/* VIP badge — shows on all platforms; non-interactive on iOS (no IAP nav) */}
                    {vipAccess?.hasVip && (
                        hideVipOnIos
                            ? (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 shadow-[0_0_10px_-3px_rgba(234,179,8,0.3)] ml-3">
                                    <Crown size={11} className="text-yellow-500 fill-yellow-500" />
                                    <span className="text-[10px] font-black text-yellow-500 tracking-widest leading-none">VIP</span>
                                </div>
                            )
                            : (
                                <button type="button" onClick={(e) => { e.stopPropagation(); onOpenVip() }} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 shadow-[0_0_10px_-3px_rgba(234,179,8,0.3)] ml-3 hover:bg-yellow-500/15">
                                    <Crown size={11} className="text-yellow-500 fill-yellow-500" />
                                    <span className="text-[10px] font-black text-yellow-500 tracking-widest leading-none">VIP</span>
                                </button>
                            )
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {syncBadge}
                    <HeaderActionsMenu
                        user={user as AdminUser}
                        isCoach={isCoach}
                        hasUnreadChat={hasUnreadChat}
                        hasUnreadNotification={hasUnreadNotification}
                        hasActiveStory={hasActiveStory}
                        onAddStory={onAddStory}
                        onOpenAdmin={onOpenAdmin}
                        onOpenChatList={onOpenChatList}
                        onOpenGlobalChat={onOpenGlobalChat}
                        onOpenHistory={onOpenHistory}
                        onOpenNotifications={onOpenNotifications}
                        onOpenSchedule={onOpenSchedule}
                        onOpenWallet={onOpenWallet}
                        onOpenSettings={onOpenSettings}
                        onOpenTour={onOpenTour}
                        onOpenProfile={onOpenProfile}
                        onLogout={onLogout}
                    />
                </div>
            </div>

            {isCoach && coachPending && (
                <div className="bg-yellow-500 text-black text-sm font-bold px-4 py-2 text-center" style={{ marginTop: 'calc(4rem + env(safe-area-inset-top))' }}>
                    Sua conta de Professor está pendente.{' '}
                    <button className="underline" onClick={onAcceptCoach}>Aceitar</button>
                </div>
            )}
        </>
    )
}
