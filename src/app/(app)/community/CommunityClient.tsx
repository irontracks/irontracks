'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useUserSettings } from '@/hooks/useUserSettings'
import { InAppNotificationsProvider, useInAppNotifications } from '@/contexts/InAppNotificationsContext'
import { ArrowLeft, Search, Settings, UserPlus, UserMinus, Users, Check, X, Clock, Bell, Loader2, Rss, Trophy, Radio, Swords } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCommunityData, type ProfileRow, type FollowRow, type FollowRequestItem } from './useCommunityData'
import FeedCard from './FeedCard'
import type { FeedItem } from './FeedCard'
import UserProfileModal from './UserProfileModal'
import LeaderboardPanel from './LeaderboardPanel'
import ChallengesPanel from './ChallengesPanel'

type CommunityTab = 'feed' | 'follow' | 'ranking' | 'challenges'

const safeString = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

const formatRoleLabel = (raw: unknown): string => {
  const r = String(raw || '').trim().toLowerCase()
  if (r === 'teacher') return 'PROFESSOR'
  if (r === 'admin') return 'ADMIN'
  if (r === 'user') return 'ALUNO'
  return r ? r.toUpperCase() : 'ALUNO'
}

const getRoleColor = (raw: unknown): string => {
  const r = String(raw || '').trim().toLowerCase()
  if (r === 'teacher') return 'text-amber-400'
  if (r === 'admin') return 'text-yellow-300'
  return 'text-neutral-400'
}

const GoldGradientBorder = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`rounded-2xl p-[1px] ${className}`}
    style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.4) 0%, rgba(255,255,255,0.05) 50%, rgba(234,179,8,0.15) 100%)' }}
  >
    <div className="rounded-[15px] overflow-hidden h-full" style={{ background: 'rgba(15,15,15,0.98)' }}>
      {children}
    </div>
  </div>
)

const Avatar = ({ photo, name, size = 44 }: { photo?: string | null; name: string; size?: number }) => {
  const initials = name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 relative"
      style={{
        width: size,
        height: size,
        background: photo ? 'transparent' : 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
        boxShadow: '0 0 0 1.5px rgba(234,179,8,0.25), 0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      {photo ? (
        <Image src={photo} alt="" width={size} height={size} className="w-full h-full object-cover" unoptimized />
      ) : (
        <span className="font-black text-yellow-500/80" style={{ fontSize: size * 0.36 }}>{initials || '?'}</span>
      )}
    </div>
  )
}

const GoldButton = ({
  onClick, disabled, children, variant = 'gold', className = ''
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  variant?: 'gold' | 'ghost' | 'danger'
  className?: string
}) => {
  const styles = {
    gold: {
      background: disabled ? 'rgba(234,179,8,0.2)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)',
      color: disabled ? 'rgba(0,0,0,0.4)' : '#000',
      boxShadow: disabled ? 'none' : '0 4px 16px rgba(234,179,8,0.3)',
    },
    ghost: {
      background: 'rgba(255,255,255,0.04)',
      color: disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)',
      border: '1px solid rgba(255,255,255,0.08)',
    },
    danger: {
      background: 'rgba(239,68,68,0.08)',
      color: disabled ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.85)',
      border: '1px solid rgba(239,68,68,0.2)',
    },
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs transition-all duration-150 active:scale-95 ${disabled ? 'cursor-not-allowed' : 'hover:opacity-90'} ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  )
}

function ToggleButton({
  settingKey, label, description, userSettingsApi,
}: {
  settingKey: string
  label: string
  description: string
  userSettingsApi: ReturnType<typeof useUserSettings>
}) {
  const isOn = Boolean((userSettingsApi?.settings as Record<string, unknown>)?.[settingKey] ?? true)
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-white/5 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-bold text-white">{label}</div>
        <div className="text-xs text-neutral-500 mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        aria-label={label}
        onClick={() => userSettingsApi.updateSetting(settingKey, !isOn)}
        className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-all duration-300 ${isOn ? 'bg-yellow-500' : 'bg-neutral-700'}`}
        style={isOn ? { boxShadow: '0 0 12px rgba(234,179,8,0.4)' } : {}}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${isOn ? 'left-6' : 'left-0.5'}`}
        />
      </button>
    </div>
  )
}

export default function CommunityClient({ embedded }: { embedded?: boolean }) {
  if (embedded) return <CommunityClientInner embedded />
  return (
    <InAppNotificationsProvider>
      <CommunityClientInner />
    </InAppNotificationsProvider>
  )
}

function CommunityClientInner({ embedded }: { embedded?: boolean }) {
  const router = useRouter()
  const { notify } = useInAppNotifications()
  const {
    supabase, userId, loading, profiles, follows, followRequests, loadError,
    busyId, busyRequestId,
    feedItems, feedLoading, feedHasMore, feedLoadedRef, loadFeed,
    onlineFriends, onlineFriendProfiles,
    respondFollowRequest, cancelFollowRequest, follow, unfollow,
  } = useCommunityData()
  const userSettingsApi = useUserSettings(userId)
  const [communitySettingsOpen, setCommunitySettingsOpen] = useState(false)
  const [query, setQuery] = useState('')

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<CommunityTab>('feed')

  // ── Profile modal state ──
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null)

  const showMessage = useCallback(
    (text: string) => {
      const msg = String(text || '').trim()
      if (!msg) return
      const allowToasts = Boolean(userSettingsApi?.settings?.inAppToasts ?? true)
      if (allowToasts) {
        notify({ text: msg, senderName: 'Comunidade', displayName: 'Comunidade', photoURL: undefined, type: 'info' })
        return
      }
      try { if (typeof window !== 'undefined') window.alert(msg) } catch { }
    },
    [notify, userSettingsApi?.settings?.inAppToasts]
  )

  const communityEnabled = Boolean(userSettingsApi?.settings?.moduleCommunity ?? true)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = Array.isArray(profiles) ? profiles : []
    if (!q) return base
    return base.filter((p: ProfileRow) => { const name = safeString(p.display_name).toLowerCase(); const role = safeString(p.role).toLowerCase(); return name.includes(q) || role.includes(q) })
  }, [profiles, query])

  useEffect(() => {
    if (userId && activeTab === 'feed' && !feedLoadedRef.current) {
      feedLoadedRef.current = true
      loadFeed(true)
    }
  }, [userId, activeTab, loadFeed, feedLoadedRef])


  if (userId && userSettingsApi?.loaded && !communityEnabled) {
    return (
      <div className={embedded ? '' : 'min-h-screen bg-neutral-950 text-white p-4 pt-safe'}>
        <div className={embedded ? 'space-y-4' : 'max-w-3xl mx-auto space-y-4'}>
          {!embedded && (
            <button type="button" onClick={() => router.push('/dashboard')} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-800 active:scale-95 transition-all">
              Voltar ao Dashboard
            </button>
          )}
          <GoldGradientBorder>
            <div className="p-5">
              <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Comunidade</div>
              <div className="text-lg font-black text-white">Módulo desativado</div>
              <div className="text-sm text-neutral-400 mt-1">Ative em Configurações → Módulos opcionais.</div>
            </div>
          </GoldGradientBorder>
        </div>
      </div>
    )
  }

  return (
    <div className={embedded ? '' : 'min-h-screen bg-neutral-950 text-white p-4 pt-safe'}>
      <div className={embedded ? 'space-y-3' : 'max-w-4xl mx-auto space-y-3'}>

        {/* ── Header Card ── */}
        <GoldGradientBorder>
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {!embedded && (
                  <button
                    type="button"
                    onClick={() => { try { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/dashboard') } catch { router.push('/dashboard') } }}
                    className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center transition-all hover:bg-white/5"
                    style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                    aria-label="Voltar"
                  >
                    <ArrowLeft size={18} className="text-neutral-300" />
                  </button>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div
                      className="text-[10px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(234,179,8,0.12)', color: '#f59e0b', border: '1px solid rgba(234,179,8,0.2)' }}
                    >
                      Comunidade
                    </div>
                  </div>
                  <div className="text-white font-black text-xl leading-tight truncate flex items-center gap-2">
                    <Users size={18} className="text-yellow-500 flex-shrink-0" />
                    {activeTab === 'feed' ? 'Atividades' : activeTab === 'ranking' ? 'Ranking' : activeTab === 'challenges' ? 'Desafios' : 'Seguir Amigos'}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {activeTab === 'feed' ? 'Veja o que seus amigos estão fazendo.' : activeTab === 'ranking' ? 'Ranking semanal entre amigos.' : activeTab === 'challenges' ? 'Desafie amigos e veja quem treina mais.' : 'Siga alunos e professores para receber notificações.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCommunitySettingsOpen(true)}
                className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center transition-all hover:bg-white/5"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                aria-label="Configurações da Comunidade"
              >
                <Settings size={17} className="text-neutral-400" />
              </button>
            </div>

            {/* ── Tab Bar ── */}
            <div className="mt-4 flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {[
                { key: 'feed' as CommunityTab, label: 'Feed', icon: <Rss size={13} /> },
                { key: 'follow' as CommunityTab, label: 'Seguir', icon: <UserPlus size={13} /> },
                { key: 'ranking' as CommunityTab, label: 'Ranking', icon: <Trophy size={13} /> },
                { key: 'challenges' as CommunityTab, label: 'Desafios', icon: <Swords size={13} /> },
              ].map((tab) => {
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                      isActive ? 'text-black' : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                    style={isActive ? {
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)',
                      boxShadow: '0 2px 12px rgba(234,179,8,0.3)',
                    } : {}}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.key === 'follow' && followRequests.length > 0 && (
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                        style={isActive ? { background: 'rgba(0,0,0,0.3)', color: '#fff' } : { background: 'rgba(234,179,8,0.8)', color: '#000' }}
                      >
                        {followRequests.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Search bar — only on follow tab */}
            {activeTab === 'follow' && (
              <div
                className="mt-3 flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <Search size={15} className="text-neutral-500 flex-shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="bg-transparent outline-none text-sm text-white flex-1 placeholder-neutral-600"
                  placeholder="Buscar por nome ou tipo (teacher/student)…"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="text-neutral-600 hover:text-neutral-400 transition-colors">
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </GoldGradientBorder>

        {/* ── Settings Modal ── */}
        {communitySettingsOpen && (
          <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-4 pt-safe" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
            <div
              className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: 'rgba(12,12,12,0.98)', border: '1px solid rgba(234,179,8,0.2)', boxShadow: '0 0 60px rgba(234,179,8,0.08), 0 30px 80px rgba(0,0,0,0.6)' }}
            >
              {/* Modal Header */}
              <div className="px-5 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-500 mb-0.5">Comunidade</div>
                  <div className="text-white font-black text-lg flex items-center gap-2">
                    <Bell size={18} className="text-yellow-500" />
                    Configurações
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCommunitySettingsOpen(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Settings body */}
              <div className="px-5 py-3 max-h-[60vh] overflow-y-auto">
                <ToggleButton userSettingsApi={userSettingsApi} settingKey="allowSocialFollows" label="Permitir convites para seguir" description="Se desligar, ninguém consegue solicitar para te seguir." />
                <ToggleButton userSettingsApi={userSettingsApi} settingKey="notifySocialFollows" label="Notificações sociais" description="Solicitações de seguir e confirmações." />
                <ToggleButton userSettingsApi={userSettingsApi} settingKey="notifyFriendOnline" label="Amigo entrou no app" description="Avisos de presença." />
                <ToggleButton userSettingsApi={userSettingsApi} settingKey="notifyFriendWorkoutEvents" label="Atividades de treino do amigo" description="Início/fim/criação/edição de treino." />
                <ToggleButton userSettingsApi={userSettingsApi} settingKey="notifyFriendPRs" label="PRs do amigo" description="Avisos quando bater recorde pessoal." />
                <ToggleButton userSettingsApi={userSettingsApi} settingKey="notifyFriendStreaks" label="Streak do amigo" description="Avisos de sequência de dias treinando." />
                <ToggleButton userSettingsApi={userSettingsApi} settingKey="notifyFriendGoals" label="Metas do amigo" description="Avisos de marcos (ex.: 10, 50 treinos)." />
                <ToggleButton userSettingsApi={userSettingsApi} settingKey="inAppToasts" label="Card flutuante (toasts)" description="Mensagens rápidas no topo da tela." />
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-4 flex gap-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  type="button"
                  onClick={() => setCommunitySettingsOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-neutral-300 transition-all hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={userSettingsApi?.saving}
                  onClick={async () => {
                    try {
                      const res = await userSettingsApi.save()
                      if (!res?.ok) { if (typeof window !== 'undefined') window.alert(String(res?.error || 'Falha ao salvar')); return }
                      setCommunitySettingsOpen(false)
                    } catch (e) { if (typeof window !== 'undefined') window.alert(e instanceof Error ? e.message : String(e)) }
                  }}
                  className="flex-1 py-3 rounded-xl font-black text-sm text-black transition-all disabled:opacity-50 active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)', boxShadow: '0 4px 16px rgba(234,179,8,0.3)' }}
                >
                  {userSettingsApi?.saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading ? (
          <GoldGradientBorder>
            <div className="p-8 flex flex-col items-center gap-3">
              <Loader2 size={28} className="text-yellow-500 animate-spin" />
              <div className="text-sm text-neutral-500">Carregando comunidade…</div>
            </div>
          </GoldGradientBorder>
        ) : !userId ? (
          <GoldGradientBorder>
            <div className="p-6 text-center">
              <Users size={32} className="text-neutral-600 mx-auto mb-3" />
              <div className="text-sm text-neutral-400">Faça login para usar a comunidade.</div>
            </div>
          </GoldGradientBorder>
        ) : (
          <>
            {/* ── FEED TAB ── */}
            {activeTab === 'feed' && (
              <>
                {/* Treinando Agora */}
                {onlineFriends.length > 0 && (
                  <GoldGradientBorder>
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <Radio size={16} className="text-green-400" />
                        <span
                          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                          style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulse 2s infinite' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black uppercase tracking-widest text-green-400">Treinando Agora</div>
                        <div className="text-[11px] text-neutral-400 truncate">
                          {onlineFriendProfiles.slice(0, 3).map((p) => safeString(p.display_name).split(' ')[0]).join(', ')}
                          {onlineFriends.length > 3 && ` +${onlineFriends.length - 3}`}
                        </div>
                      </div>
                      <div className="flex -space-x-2">
                        {onlineFriendProfiles.slice(0, 4).map((p) => (
                          <Avatar key={p.id} photo={p.photo_url} name={safeString(p.display_name)} size={28} />
                        ))}
                      </div>
                    </div>
                  </GoldGradientBorder>
                )}

                {/* Feed items */}
                {feedLoading && feedItems.length === 0 ? (
                  <GoldGradientBorder>
                    <div className="p-8 flex flex-col items-center gap-3">
                      <Loader2 size={28} className="text-yellow-500 animate-spin" />
                      <div className="text-sm text-neutral-500">Carregando feed…</div>
                    </div>
                  </GoldGradientBorder>
                ) : feedItems.length === 0 ? (
                  <GoldGradientBorder>
                    <EmptyState
                      variant="community"
                      title="Nenhuma atividade ainda"
                      description="Siga amigos na aba &quot;Seguir&quot; para ver as atividades deles aqui."
                      action={{ label: 'Encontrar amigos', onClick: () => setActiveTab('follow') }}
                      compact
                    />
                  </GoldGradientBorder>
                ) : (
                  <GoldGradientBorder>
                    <div>
                      {(feedItems as unknown as FeedItem[]).map((item) => (
                        <FeedCard key={item.id} item={item} onProfileClick={(id) => setProfileModalUserId(id)} />
                      ))}
                      {feedHasMore && (
                        <button
                          type="button"
                          onClick={() => loadFeed()}
                          disabled={feedLoading}
                          className="w-full py-3 text-xs font-black text-yellow-500 hover:text-yellow-400 transition-colors disabled:opacity-50"
                        >
                          {feedLoading ? 'Carregando…' : 'Carregar mais'}
                        </button>
                      )}
                    </div>
                  </GoldGradientBorder>
                )}
              </>
            )}

            {/* ── FOLLOW TAB ── */}
            {activeTab === 'follow' && (
              <>
                {/* Pedidos para Seguir */}
                <GoldGradientBorder>
                  <div>
                    <div className="px-4 py-3.5 flex items-center justify-between" style={{ borderBottom: followRequests.length ? '1px solid rgba(255,255,255,0.05)' : undefined }}>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: followRequests.length ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.04)', border: followRequests.length ? '1px solid rgba(234,179,8,0.2)' : '1px solid rgba(255,255,255,0.06)' }}
                        >
                          <UserPlus size={15} className={followRequests.length ? 'text-yellow-500' : 'text-neutral-500'} />
                        </div>
                        <div>
                          <div className="text-xs font-black uppercase tracking-widest" style={{ color: followRequests.length ? '#f59e0b' : 'rgba(255,255,255,0.4)' }}>
                            Pedidos para Seguir
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            {followRequests.length ? `${followRequests.length} pendente(s)` : 'Nenhuma solicitação pendente.'}
                          </div>
                        </div>
                      </div>
                      {followRequests.length > 0 && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-black"
                          style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                        >
                          {followRequests.length}
                        </div>
                      )}
                    </div>
                    {loadError && <div className="px-4 py-2 text-xs text-red-400">{loadError}</div>}
                    {followRequests.length > 0 && (
                      <div>
                        {followRequests.map((r, i) => {
                          const p = r.follower_profile
                          const name = safeString(p?.display_name).trim() || 'Usuário'
                          const role = formatRoleLabel(p?.role)
                          const roleColor = getRoleColor(p?.role)
                          const photo = safeString(p?.photo_url).trim()
                          const busy = busyRequestId === r.follower_id
                          return (
                            <div key={r.follower_id} className={`px-4 py-3.5 flex items-center gap-3 ${i < followRequests.length - 1 ? 'border-b border-white/5' : ''}`}>
                              <Avatar photo={photo} name={name} size={42} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-black text-white truncate">{name}</div>
                                <div className={`text-[11px] font-bold uppercase tracking-wider truncate ${roleColor}`}>{role}</div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {busy ? (
                                  <Loader2 size={18} className="text-yellow-500 animate-spin" />
                                ) : (
                                  <>
                                    <GoldButton onClick={() => respondFollowRequest(r.follower_id, 'accept')} variant="gold">
                                      <Check size={13} /> Aceitar
                                    </GoldButton>
                                    <GoldButton onClick={() => respondFollowRequest(r.follower_id, 'deny')} variant="ghost">
                                      <X size={13} />
                                    </GoldButton>
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </GoldGradientBorder>

                {/* Lista de Usuários */}
                {filtered.length === 0 ? (
                  <GoldGradientBorder>
                    <EmptyState
                      variant="community"
                      title="Nenhum usuário encontrado"
                      description="Tente buscar com outro nome ou tipo."
                      compact
                    />
                  </GoldGradientBorder>
                ) : (
                  <GoldGradientBorder>
                    <div>
                      <div
                        className="px-4 py-2.5 flex items-center gap-2"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}
                      >
                        <Bell size={12} className="text-neutral-600 flex-shrink-0" />
                        <span className="text-[11px] text-neutral-600">Notificações aparecem somente após o usuário aceitar seu pedido.</span>
                      </div>
                      <div>
                        {filtered.map((p, i) => {
                          const followRow = follows.get(p.id) || null
                          const status = followRow?.status || null
                          const busy = busyId === p.id
                          const name = safeString(p.display_name).trim() || 'Usuário'
                          const role = formatRoleLabel(p.role)
                          const roleColor = getRoleColor(p.role)
                          const photo = safeString(p.photo_url).trim()
                          return (
                            <div
                              key={p.id}
                              className={`px-4 py-3.5 flex items-center gap-3 transition-colors hover:bg-white/[0.02] ${i < filtered.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
                            >
                              <div className="relative flex-shrink-0">
                                <Avatar photo={photo} name={name} size={44} />
                                {status === 'accepted' && (
                                  <div
                                    className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                                    style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: '1.5px solid #0a0a0a' }}
                                  >
                                    <Check size={9} strokeWidth={3} className="text-white" />
                                  </div>
                                )}
                                {status === 'pending' && (
                                  <div
                                    className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(234,179,8,0.9)', border: '1.5px solid #0a0a0a' }}
                                  >
                                    <Clock size={9} strokeWidth={3} className="text-black" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-black text-white truncate">{name}</div>
                                <div className={`text-[11px] font-bold uppercase tracking-wider truncate ${roleColor}`}>{role}</div>
                              </div>
                              <div className="flex-shrink-0">
                                {busy ? (
                                  <Loader2 size={18} className="text-yellow-500 animate-spin" />
                                ) : status === 'accepted' ? (
                                  <GoldButton onClick={() => unfollow(p.id)} variant="danger">
                                    <UserMinus size={13} /> Seguindo
                                  </GoldButton>
                                ) : status === 'pending' ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <div className="text-[10px] uppercase tracking-widest font-black text-yellow-600/70 flex items-center gap-1">
                                      <Clock size={9} /> Aguardando
                                    </div>
                                    <GoldButton onClick={() => cancelFollowRequest(p.id)} variant="ghost" className="text-[11px]">
                                      Cancelar
                                    </GoldButton>
                                  </div>
                                ) : (
                                  <GoldButton onClick={() => follow(p.id, showMessage)} variant="gold">
                                    <UserPlus size={13} /> Seguir
                                  </GoldButton>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </GoldGradientBorder>
                )}
              </>
            )}

            {/* ── RANKING TAB ── */}
            {activeTab === 'ranking' && (
              <GoldGradientBorder>
                <LeaderboardPanel userId={userId} />
              </GoldGradientBorder>
            )}

            {/* ── CHALLENGES TAB ── */}
            {activeTab === 'challenges' && (
              <GoldGradientBorder>
                <ChallengesPanel userId={userId} />
              </GoldGradientBorder>
            )}

            {/* ── User Profile Modal ── */}
            {profileModalUserId && (
              <UserProfileModal
                userId={profileModalUserId}
                onClose={() => setProfileModalUserId(null)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
