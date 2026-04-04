'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  X, Save, Download, Trash2, RotateCcw, LogOut, ShieldAlert,
  Layers, Mail, MessageCircle, ChevronRight, ExternalLink,
  HelpCircle, Database, Smartphone,
} from 'lucide-react'
import { logError } from '@/lib/logger'
import { useDialog } from '@/contexts/DialogContext'
import { DEFAULT_SETTINGS } from '@/hooks/useUserSettings'
import { createClient } from '@/utils/supabase/client'
import { getErrorMessage } from '@/utils/errorMessage'
import { isIosNative } from '@/utils/platform'
import { useIsIosNative } from '@/hooks/useIsIosNative'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import {
  checkBiometricsAvailable,
  checkNativeNotificationPermission,
  endRestLiveActivity,
  isHealthKitAvailable,
  openAppSettings,
  requestHealthKitPermission,
  requestNativeNotifications,
  startRestLiveActivity,
  triggerHaptic,
  authenticateWithBiometrics,
} from '@/utils/native/irontracksNative'
import { isObject } from '@/components/settings/settingsShared'
import {
  SettingsProfileSection,
  SettingsAppearanceSection,
  SettingsWorkoutNamesSection,
  SettingsAppModeSection,
  SettingsToolsSection,
  SettingsWorkoutSection,
  SettingsSoundSection,
  SettingsNotificationsSection,
  SettingsTimerSection,
  SettingsPrivacySection,
  SettingsSecuritySection,
  SettingsHealthKitSection,
  SettingsModulesModal,
} from '@/components/settings/SettingsSections'
import ChangePasswordModal from '@/components/settings/ChangePasswordModal'
import AvatarUploadModal from '@/components/settings/AvatarUploadModal'

interface SettingsModalProps {
  isOpen?: boolean
  saving?: boolean
  settings?: unknown
  userRole?: string
  onClose?: () => void
  onSave?: (settings: unknown) => Promise<boolean | void>
  onOpenWhatsNew?: () => void
  onOpenProgressPhotos?: () => void
}

export default function SettingsModal(props: SettingsModalProps) {
  const { alert } = useDialog()
  const iosNative = useIsIosNative()
  const isOpen = !!props?.isOpen
  const saving = !!props?.saving
  const rawSettings = props?.settings
  const base = useMemo(() => (isObject(rawSettings) ? rawSettings : {}), [rawSettings])
  const [draft, setDraft] = useState<Record<string, unknown>>(() => base)
  const [modulesModalOpen, setModulesModalOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [avatarUploadOpen, setAvatarUploadOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null)
  const [iosNotifStatus, setIosNotifStatus] = useState<string>('unknown')
  const [iosNotifBusy, setIosNotifBusy] = useState(false)
  const [iosDiag, setIosDiag] = useState<Record<string, unknown> | null>(null)
  const [iosDiagBusy, setIosDiagBusy] = useState(false)
  const [iosLiveTestId, setIosLiveTestId] = useState<string>('')
  const [healthKitGranted, setHealthKitGranted] = useState(false)
  const [healthKitBusy, setHealthKitBusy] = useState(false)
  const [exportingData, setExportingData] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  const setValue = (key: string, value: unknown) => {
    if (!key) return
    setDraft((prev) => ({ ...(isObject(prev) ? prev : {}), [key]: value }))
  }

  const userRole = String(props?.userRole || '')
  const canSeeExperimental = userRole === 'admin' || userRole === 'teacher'
  const canSave = isOpen && !saving
  const focusTrapRef = useFocusTrap(isOpen, props?.onClose)

  // ── Keyboard ESC ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; e.preventDefault(); props?.onClose?.() }
    try { window.addEventListener('keydown', onKeyDown) } catch { }
    return () => { try { window.removeEventListener('keydown', onKeyDown) } catch { } }
  }, [isOpen, props])

  // ── iOS notification permission check ───────────────────────────────────
  useEffect(() => {
    if (!isOpen || !isIosNative()) return
    let alive = true
      ; (async () => {
        try {
          const res = await checkNativeNotificationPermission()
          if (!alive) return
          setIosNotifStatus(String((res as Record<string, unknown>)?.status ?? 'unknown'))
        } catch (e) { logError('component:SettingsModal.checkNotifPermission', e); if (!alive) return; setIosNotifStatus('unknown') }
      })()
    return () => { alive = false }
  }, [isOpen])

  // ── iOS diagnostics ──────────────────────────────────────────────────────
  const loadIosDiag = async () => {
    try {
      setIosDiagBusy(true)
      const capCore = require('@capacitor/core')
      const appMod = require('@capacitor/app')
      const pushMod = require('@capacitor/push-notifications')
      const deviceMod = require('@capacitor/device')
      const Capacitor = capCore?.Capacitor
      const capacitorPresent = !!Capacitor
      const platform = String(Capacitor?.getPlatform?.() || 'unknown')
      const pluginNames = Capacitor?.Plugins ? Object.keys(Capacitor.Plugins) : []
      const appInfo = await appMod?.App?.getInfo?.().catch(() => null)
      const deviceInfo = await deviceMod?.Device?.getInfo?.().catch(() => null)
      const pushPerm = await pushMod?.PushNotifications?.checkPermissions?.().catch(() => null)
      const biom = await checkBiometricsAvailable()
      const healthAvailable = await isHealthKitAvailable()
      const notif = await checkNativeNotificationPermission()
      setIosDiag({ capacitorPresent, platform, pluginNames, app: appInfo || null, device: deviceInfo || null, push: pushPerm || null, biometrics: biom || null, notifications: notif || null, healthKitAvailable: healthAvailable })
    } catch (e) { logError('component:SettingsModal.loadIosDiag', e); setIosDiag(null) } finally { setIosDiagBusy(false) }
  }
  useEffect(() => { if (isOpen && isIosNative()) { loadIosDiag() } }, [isOpen])

  // Fetch user identity when modal opens (for password change + avatar)
  useEffect(() => {
    if (!isOpen) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const uid = String(data?.user?.id || '')
      setUserEmail(String(data?.user?.email || ''))
      setUserId(uid)
      if (uid) {
        supabase.from('profiles').select('photo_url').eq('id', uid).maybeSingle()
          .then(({ data: profile }) => {
            setUserPhotoURL(String(profile?.photo_url || data?.user?.user_metadata?.avatar_url || '') || null)
          })
      }
    })
  }, [isOpen])

  const iosDiagObj = isObject(iosDiag) ? (iosDiag as Record<string, unknown>) : null
  const iosDiagApp = iosDiagObj && isObject(iosDiagObj.app) ? (iosDiagObj.app as Record<string, unknown>) : null
  const iosDiagDevice = iosDiagObj && isObject(iosDiagObj.device) ? (iosDiagObj.device as Record<string, unknown>) : null
  const iosDiagPush = iosDiagObj && isObject(iosDiagObj.push) ? (iosDiagObj.push as Record<string, unknown>) : null
  const iosDiagNotif = iosDiagObj && isObject(iosDiagObj.notifications) ? (iosDiagObj.notifications as Record<string, unknown>) : null
  const iosDiagBiom = iosDiagObj && isObject(iosDiagObj.biometrics) ? (iosDiagObj.biometrics as Record<string, unknown>) : null
  const iosDiagPlugins = iosDiagObj && Array.isArray(iosDiagObj.pluginNames) ? (iosDiagObj.pluginNames as unknown[]) : []

  const handleRequestIosNotifPermission = async () => {
    try {
      setIosNotifBusy(true)
      await requestNativeNotifications()
      const res = await checkNativeNotificationPermission()
      setIosNotifStatus(String((res as Record<string, unknown>)?.status ?? 'unknown'))
    } catch (e) { logError('component:SettingsModal.requestNotifPermission', e); setIosNotifStatus('unknown') } finally { setIosNotifBusy(false) }
  }

  const handleRequestHealthKitPermission = async () => {
    try {
      setHealthKitBusy(true)
      const res = await requestHealthKitPermission()
      setHealthKitGranted(!!res?.granted)
    } catch (e) { logError('component:SettingsModal.requestHealthKit', e); setHealthKitGranted(false) } finally { setHealthKitBusy(false) }
  }

  const handleOpenAppSettings = async () => {
    try { setIosNotifBusy(true); await openAppSettings() } catch { } finally { setIosNotifBusy(false) }
  }

  if (!isOpen) return null

  return (
    <div role="dialog" aria-modal="true" aria-label="Configurações" ref={focusTrapRef} className="fixed inset-0 z-[1300] flex items-center justify-center p-4 pt-safe" style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'rgba(12,12,12,0.99)', border: '1px solid rgba(234,179,8,0.22)', boxShadow: '0 0 40px rgba(234,179,8,0.10), 0 30px 80px rgba(0,0,0,0.65)' }}>

        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)' }}>
              <Layers size={20} className="text-yellow-500" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] mb-0.5" style={{ color: '#f59e0b' }}>Personalização</div>
              <div className="text-white font-black text-lg truncate">Configurações</div>
            </div>
          </div>
          <button type="button" onClick={() => props?.onClose?.()} className="w-10 h-10 rounded-xl text-neutral-400 hover:text-white inline-flex items-center justify-center transition-colors" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Sections */}
        <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto custom-scrollbar">
          <SettingsProfileSection
            draft={draft}
            setValue={setValue}
            userEmail={userEmail}
            userId={userId}
            userPhotoURL={userPhotoURL}
            onOpenChangePassword={() => setChangePasswordOpen(true)}
            onOpenAvatarUpload={() => setAvatarUploadOpen(true)}
          />
          <SettingsAppearanceSection draft={draft} setValue={setValue} />
          <SettingsWorkoutNamesSection draft={draft} setValue={setValue} />
          <SettingsAppModeSection draft={draft} setValue={setValue} setModulesModalOpen={setModulesModalOpen} />
          <SettingsToolsSection draft={draft} setValue={setValue} onOpenWhatsNew={props?.onOpenWhatsNew} onOpenProgressPhotos={props?.onOpenProgressPhotos} />
          <SettingsWorkoutSection draft={draft} setValue={setValue} />
          <SettingsSoundSection draft={draft} setValue={setValue} canSeeExperimental={canSeeExperimental} />
          <SettingsNotificationsSection
            draft={draft} setValue={setValue}
            iosNotifStatus={iosNotifStatus} iosNotifBusy={iosNotifBusy}
            isIosNative={iosNative}
            onRequestIosNotifPermission={handleRequestIosNotifPermission}
            onOpenAppSettings={handleOpenAppSettings}
          />
          {iosNative && (
            <SettingsHealthKitSection
              isHealthKitAvailable={Boolean(iosDiagObj?.healthKitAvailable)}
              healthKitGranted={healthKitGranted}
              healthKitBusy={healthKitBusy}
              onRequestPermission={handleRequestHealthKitPermission}
              onOpenAppSettings={handleOpenAppSettings}
            />
          )}
          {iosNative && <SettingsSecuritySection draft={draft} setValue={setValue} />}

          {/* iOS Diagnostics */}
          {iosNative && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2"><Smartphone size={14} className="text-yellow-500" /><div className="text-xs font-black uppercase tracking-widest text-neutral-400">Diagnóstico iOS</div></div>
                  <div className="text-xs text-neutral-500 mt-0.5">Capacitor, plugins e permissões no device.</div>
                </div>
                <button type="button" disabled={iosDiagBusy} onClick={loadIosDiag} className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black disabled:opacity-60">Atualizar</button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Runtime</div>
                  <div className="text-xs text-neutral-200 mt-1">{String(iosDiagObj?.platform ?? 'unknown')} · Capacitor: {Boolean(iosDiagObj?.capacitorPresent) ? 'ok' : 'não'}</div>
                  <div className="text-[11px] text-neutral-500 mt-1">App: {String(iosDiagApp?.name ?? '') || '—'} · v{String(iosDiagApp?.version ?? '') || '—'} ({String(iosDiagApp?.build ?? '') || '—'})</div>
                  <div className="text-[11px] text-neutral-500 mt-1">iOS: {String(iosDiagDevice?.osVersion ?? '') || '—'} · Model: {String(iosDiagDevice?.model ?? '') || '—'}</div>
                </div>
                <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Permissões</div>
                  <div className="text-[11px] text-neutral-300 mt-1">Notificações: {String(iosDiagNotif?.status ?? '') || 'unknown'}</div>
                  <div className="text-[11px] text-neutral-300 mt-1">Push: {String(iosDiagPush?.receive ?? '') || 'unknown'}</div>
                  <div className="text-[11px] text-neutral-300 mt-1">Biometria: {Boolean(iosDiagBiom?.available) ? String(iosDiagBiom?.biometryType || 'ok') : 'não'}</div>
                  <div className="text-[11px] text-neutral-300 mt-1">HealthKit: {Boolean(iosDiagObj?.healthKitAvailable) ? 'disponível' : 'não'}</div>
                </div>
                <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Plugins</div>
                  <div className="text-[11px] text-neutral-400 mt-1 break-words">{iosDiagPlugins.length ? iosDiagPlugins.slice(0, 18).map((v) => String(v || '').trim()).filter(Boolean).join(', ') : '—'}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={async () => { try { await triggerHaptic('success'); alert('Ok', 'Haptic') } catch { alert('Falhou', 'Haptic') } }} className="px-3 py-2 rounded-xl bg-yellow-500 text-black font-black">Testar Haptic</button>
                <button type="button" onClick={async () => { try { const res = await authenticateWithBiometrics('Confirmar Face ID / Touch ID'); alert(res?.success ? 'Ok' : String(res?.error || 'Falhou'), 'Biometria') } catch { alert('Falhou', 'Biometria') } }} className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black">Testar Biometria</button>
                <button type="button" onClick={async () => { try { const res = await requestHealthKitPermission(); setHealthKitGranted(!!res?.granted); alert(res?.granted ? 'Permissão ok' : String(res?.error || 'Negado'), 'HealthKit') } catch { alert('Falhou', 'HealthKit') } }} className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black">HK (debug)</button>
                <button type="button" onClick={async () => { try { const id = iosLiveTestId || `diagnostic-${Date.now()}`; await startRestLiveActivity(id, 60, 'Diagnóstico'); setIosLiveTestId(id); alert('Iniciada (60s)', 'Live Activity') } catch { alert('Falhou', 'Live Activity') } }} className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black">Testar Live Activity</button>
                <button type="button" disabled={!iosLiveTestId} onClick={async () => { try { await endRestLiveActivity(iosLiveTestId); setIosLiveTestId(''); alert('Encerrada', 'Live Activity') } catch { alert('Falhou', 'Live Activity') } }} className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black disabled:opacity-60">Encerrar Live Activity</button>
              </div>
            </div>
          )}

          <SettingsPrivacySection draft={draft} setValue={setValue} />
          <SettingsTimerSection draft={draft} setValue={setValue} />

          {/* Ajuda e Suporte */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)' }}><HelpCircle size={13} className="text-yellow-500" /></div>
              <div className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: '#f59e0b' }}>Ajuda e Suporte</div>
            </div>
            <div className="space-y-2">
              <button type="button" onClick={() => { try { const s = encodeURIComponent('Suporte IronTracks'); const b = encodeURIComponent('Olá equipe IronTracks,\n\nPreciso de ajuda com:\n\n'); window.location.href = `mailto:irontrackscompany@gmail.com?subject=${s}&body=${b}` } catch { } }} className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-yellow-500/20 transition-all group" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 inline-flex items-center justify-center shrink-0"><Mail size={18} className="text-yellow-500" /></div>
                <div className="flex-1 text-left min-w-0"><div className="text-sm font-bold text-white">Suporte por E-mail</div><div className="text-xs text-neutral-400 truncate">irontrackscompany@gmail.com</div></div>
                <ExternalLink size={14} className="text-neutral-500 group-hover:text-yellow-500 transition-colors shrink-0" />
              </button>
              <button type="button" onClick={() => { try { const a = document.createElement('a'); a.href = 'https://tawk.to/chat/irontracks'; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); document.body.removeChild(a) } catch { } }} className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-green-500/20 transition-all group" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 inline-flex items-center justify-center shrink-0"><MessageCircle size={18} className="text-green-500" /></div>
                <div className="flex-1 text-left min-w-0"><div className="text-sm font-bold text-white">Chat em Tempo Real</div><div className="text-xs text-neutral-400">Converse com a equipe agora</div></div>
                <ChevronRight size={14} className="text-neutral-500 group-hover:text-green-500 transition-colors shrink-0" />
              </button>
            </div>
            <div className="mt-3 text-[11px] text-neutral-500 text-center">Estamos aqui para ajudar! Resposta em até 24h por e-mail.</div>
          </div>

          {/* Dados e Dispositivo */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)' }}><Database size={13} className="text-yellow-500" /></div>
              <div className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: '#f59e0b' }}>Dados e Dispositivo</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button type="button" onClick={async () => { try { const payload = JSON.stringify(draft && typeof draft === 'object' ? draft : {}, null, 2); const blob = new Blob([payload], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `irontracks-settings-${new Date().toISOString()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url) } catch (e: unknown) { await alert('Falha ao exportar: ' + (getErrorMessage(e) ?? String(e))) } }} className="min-h-[44px] px-4 py-3 rounded-xl border text-neutral-200 font-black hover:border-yellow-500/30 hover:text-yellow-400 transition-all inline-flex items-center justify-center gap-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <Download size={16} className="text-yellow-500" /> Exportar
              </button>
              <button type="button" onClick={async () => { try { setDraft(DEFAULT_SETTINGS); await alert('Preferências resetadas. Clique em Salvar para aplicar.') } catch (e: unknown) { await alert('Falha ao resetar: ' + (getErrorMessage(e) ?? String(e))) } }} className="min-h-[44px] px-4 py-3 rounded-xl border text-neutral-200 font-black hover:border-yellow-500/30 hover:text-yellow-400 transition-all inline-flex items-center justify-center gap-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <RotateCcw size={16} className="text-yellow-500" /> Resetar
              </button>
              <button type="button" onClick={async () => { try { if (typeof window === 'undefined') return; const keys: string[] = []; for (let i = 0; i < window.localStorage.length; i += 1) { const k = window.localStorage.key(i); if (k) keys.push(k) } keys.forEach((k) => { if (k.startsWith('irontracks.')) { try { window.localStorage.removeItem(k) } catch { } } }); try { window.location.reload() } catch { } } catch (e: unknown) { await alert('Falha ao limpar cache: ' + (getErrorMessage(e) ?? String(e))) } }} className="min-h-[44px] px-4 py-3 rounded-xl border text-neutral-200 font-black hover:border-yellow-500/30 hover:text-yellow-400 transition-all inline-flex items-center justify-center gap-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <Trash2 size={16} className="text-yellow-500" /> Limpar cache
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" disabled={exportingData} onClick={async () => { setExportingData(true); try { const res = await fetch('/api/account/export', { method: 'GET' }); const data = await res.json().catch((): null => null); if (!data || !data.ok) { await alert('Falha ao exportar dados: ' + (data?.error || '')); return } const payload = JSON.stringify(data, null, 2); const blob = new Blob([payload], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `irontracks-account-export-${new Date().toISOString()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url) } catch (e: unknown) { await alert('Falha ao exportar dados: ' + (getErrorMessage(e) ?? String(e))) } finally { setExportingData(false) } }} className="min-h-[44px] px-4 py-3 rounded-xl border text-neutral-200 font-black hover:border-yellow-500/30 hover:text-yellow-400 transition-all inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <Download size={16} className="text-yellow-500" /> Exportar meus dados
              </button>
              <button type="button" onClick={async () => { try { let supa; try { supa = createClient() } catch { await alert('Falha ao sair: configuração ausente'); return } await supa.auth.signOut({ scope: 'global' }); try { window.location.href = '/auth/signin' } catch { } } catch (e: unknown) { await alert('Falha ao sair: ' + (getErrorMessage(e) ?? String(e))) } }} className="min-h-[44px] px-4 py-3 rounded-xl border text-neutral-200 font-black hover:border-yellow-500/30 hover:text-yellow-400 transition-all inline-flex items-center justify-center gap-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <LogOut size={16} className="text-yellow-500" /> Sair de todos
              </button>
            </div>
            <div className="mt-3">
              <button type="button" disabled={deletingAccount} onClick={async () => { const typed = typeof window !== 'undefined' ? window.prompt('Digite EXCLUIR para confirmar a exclusão da conta:') : null; if (String(typed || '').trim().toUpperCase() !== 'EXCLUIR') return; setDeletingAccount(true); try { const res = await fetch('/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'EXCLUIR' }) }); const data = await res.json().catch((): null => null); if (!data || !data.ok) { await alert('Falha ao excluir conta: ' + (data?.error || '')); return } try { let supa; try { supa = createClient() } catch { supa = null } if (supa) await supa.auth.signOut({ scope: 'global' }) } catch { } try { window.location.href = '/auth/signin' } catch { } } catch (e: unknown) { await alert('Falha ao excluir conta: ' + (getErrorMessage(e) ?? String(e))) } finally { setDeletingAccount(false) } }} className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-red-600/15 border border-red-500/40 text-red-200 font-black hover:bg-red-600/25 inline-flex items-center justify-center gap-2 disabled:opacity-60">
                <ShieldAlert size={16} className="text-red-300" /> Excluir minha conta
              </button>
              <div className="mt-2 text-[11px] text-neutral-400">Remove seus dados do app e encerra acesso. Ação irreversível.</div>
            </div>
          </div>
        </div>

        {/* Modules modal */}
        <SettingsModulesModal draft={draft} setValue={setValue} isOpen={modulesModalOpen} onClose={() => setModulesModalOpen(false)} />

        {/* Change password modal */}
        <ChangePasswordModal isOpen={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} userEmail={userEmail} />

        {/* Avatar upload modal */}
        <AvatarUploadModal
          isOpen={avatarUploadOpen}
          onClose={() => setAvatarUploadOpen(false)}
          currentPhotoURL={userPhotoURL}
          userId={userId}
          onPhotoUpdated={(url) => { setUserPhotoURL(url); setAvatarUploadOpen(false) }}
        />

        {/* Footer */}
        <div className="p-4 flex items-center justify-between gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-[10px] text-neutral-600 font-mono">IronTracks</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => props?.onClose?.()} className="px-4 py-3 rounded-xl border text-neutral-300 font-bold hover:text-white hover:border-yellow-500/30 transition-all" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>Fechar</button>
            <button type="button" disabled={!canSave} onClick={async () => { try { const ok = await props?.onSave?.(draft); if (ok === false) return; props?.onClose?.() } catch (e: unknown) { await alert('Falha ao salvar: ' + (getErrorMessage(e) ?? String(e))) } }} className={canSave ? 'px-4 py-3 rounded-xl font-black hover:shadow-yellow-500/30 inline-flex items-center gap-2 transition-all btn-gold-animated' : 'px-4 py-3 rounded-xl bg-yellow-500/70 text-black font-black cursor-wait inline-flex items-center gap-2'}>
              <Save size={16} />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
