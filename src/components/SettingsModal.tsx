'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  X, Save, Download, Trash2, RotateCcw, LogOut, ShieldAlert,
  Palette, CalendarDays, Layers, Wrench, Dumbbell, Volume2,
  Bell, Timer, Lock, Smartphone, HelpCircle, Database,
  Mail, MessageCircle, ChevronRight, ExternalLink
} from 'lucide-react'
import { useDialog } from '@/contexts/DialogContext'
import { DEFAULT_SETTINGS } from '@/hooks/useUserSettings'
import { createClient } from '@/utils/supabase/client'
import { getErrorMessage } from '@/utils/errorMessage'
import { isIosNative } from '@/utils/platform'
import {
  authenticateWithBiometrics,
  checkBiometricsAvailable,
  checkNativeNotificationPermission,
  endRestLiveActivity,
  isHealthKitAvailable,
  openAppSettings,
  requestHealthKitPermission,
  requestNativeNotifications,
  startRestLiveActivity,
  triggerHaptic,
} from '@/utils/native/irontracksNative'

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

const ToggleSwitch = ({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={onChange}
    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-yellow-500' : 'bg-neutral-700'}`}
  >
    <span className={`pointer-events-none inline-block h-[22px] w-[22px] transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
)

const SectionHeader = ({ icon: Icon, label }: { icon: React.FC<{ size?: number; className?: string }>; label: string }) => (
  <div className="flex items-center gap-2 mb-3">
    <Icon size={14} className="text-yellow-500" />
    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">{label}</div>
  </div>
)

interface SettingsModalProps {
  isOpen?: boolean
  saving?: boolean
  settings?: unknown
  userRole?: string
  onClose?: () => void
  onSave?: (settings: unknown) => Promise<boolean | void>
  onOpenWhatsNew?: () => void
}

export default function SettingsModal(props: SettingsModalProps) {
  const { alert } = useDialog()
  const isOpen = !!props?.isOpen
  const saving = !!props?.saving
  const rawSettings = props?.settings
  const base = useMemo(() => (isObject(rawSettings) ? rawSettings : {}), [rawSettings])
  const [draft, setDraft] = useState<Record<string, unknown>>(() => base)
  const [modulesModalOpen, setModulesModalOpen] = useState(false)
  const [iosNotifStatus, setIosNotifStatus] = useState<string>('unknown')
  const [iosNotifBusy, setIosNotifBusy] = useState(false)
  const [iosDiag, setIosDiag] = useState<Record<string, unknown> | null>(null)
  const [iosDiagBusy, setIosDiagBusy] = useState(false)
  const [iosLiveTestId, setIosLiveTestId] = useState<string>('')

  const setValue = (key: string, value: unknown) => {
    if (!key) return
    setDraft((prev) => ({ ...(isObject(prev) ? prev : {}), [key]: value }))
  }

  const density = String(draft?.dashboardDensity || 'comfortable')
  const units = String(draft?.units || 'kg')
  const showStoriesBar = Boolean(draft?.showStoriesBar ?? true)
  const showNewRecordsCard = Boolean(draft?.showNewRecordsCard ?? true)
  const showIronRank = Boolean(draft?.showIronRank ?? true)
  const showBadges = Boolean(draft?.showBadges ?? true)
  const whatsNewAutoOpen = Boolean(draft?.whatsNewAutoOpen ?? true)
  const whatsNewRemind24h = Boolean(draft?.whatsNewRemind24h ?? true)
  const enableSounds = Boolean(draft?.enableSounds ?? true)
  const allowTeamInvites = Boolean(draft?.allowTeamInvites ?? true)
  const featuresKillSwitch = Boolean(draft?.featuresKillSwitch ?? false)
  const featureTeamworkV2 = Boolean(draft?.featureTeamworkV2 ?? false)
  const featureStoriesV2 = Boolean(draft?.featureStoriesV2 ?? false)
  const featureOfflineSyncV2 = Boolean(draft?.featureOfflineSyncV2 ?? false)
  const allowDirectMessages = Boolean(draft?.allowDirectMessages ?? true)
  const notifyDirectMessages = Boolean(draft?.notifyDirectMessages ?? true)
  const notifyAppointments = Boolean(draft?.notifyAppointments ?? true)
  const soundVolume = Math.max(0, Math.min(100, Number(draft?.soundVolume ?? 100) || 0))
  const inAppToasts = Boolean(draft?.inAppToasts ?? true)
  const notificationPermissionPrompt = Boolean(draft?.notificationPermissionPrompt ?? true)
  const restTimerNotify = Boolean(draft?.restTimerNotify ?? true)
  const restTimerVibrate = Boolean(draft?.restTimerVibrate ?? true)
  const restTimerRepeatAlarm = Boolean(draft?.restTimerRepeatAlarm ?? true)
  const restTimerRepeatIntervalMs = Math.max(600, Math.min(6000, Number(draft?.restTimerRepeatIntervalMs ?? 1500) || 1500))
  const restTimerRepeatMaxSeconds = Math.max(10, Math.min(900, Number(draft?.restTimerRepeatMaxSeconds ?? 180) || 180))
  const restTimerRepeatMaxCount = Math.max(1, Math.min(120, Number(draft?.restTimerRepeatMaxCount ?? 60) || 60))
  const restTimerContinuousAlarm = Boolean(draft?.restTimerContinuousAlarm ?? false)
  const restTimerTickCountdown = Boolean(draft?.restTimerTickCountdown ?? true)
  const restTimerDefaultSeconds = Math.max(15, Math.min(600, Number(draft?.restTimerDefaultSeconds ?? 90) || 90))
  const autoRestTimerWhenMissing = Boolean(draft?.autoRestTimerWhenMissing ?? false)
  const programTitleStartDay = String(draft?.programTitleStartDay || 'monday')
  const uiMode = String(draft?.uiMode || 'beginner')
  const moduleSocial = Boolean(draft?.moduleSocial ?? true)
  const moduleCommunity = Boolean(draft?.moduleCommunity ?? true)
  const moduleMarketplace = Boolean(draft?.moduleMarketplace ?? true)
  const promptPreWorkoutCheckin = Boolean(draft?.promptPreWorkoutCheckin ?? true)
  const promptPostWorkoutCheckin = Boolean(draft?.promptPostWorkoutCheckin ?? true)
  const userRole = String(props?.userRole || '')
  const canSeeExperimental = userRole === 'admin' || userRole === 'teacher'

  const canSave = isOpen && !saving

  const title = useMemo(() => 'Configurações', [])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      props?.onClose?.()
    }
    try {
      window.addEventListener('keydown', onKeyDown)
    } catch { }
    return () => {
      try {
        window.removeEventListener('keydown', onKeyDown)
      } catch { }
    }
  }, [isOpen, props])

  useEffect(() => {
    if (!isOpen) return
    if (!isIosNative()) return
    let alive = true
    ;(async () => {
      try {
        const res = await checkNativeNotificationPermission()
        if (!alive) return
        const status = String((res as Record<string, unknown>)?.status ?? 'unknown')
        setIosNotifStatus(status)
      } catch {
        if (!alive) return
        setIosNotifStatus('unknown')
      }
    })()
    return () => {
      alive = false
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (!isIosNative()) return
    let alive = true
    ;(async () => {
      try {
        setIosDiagBusy(true)
        const capCore = require('@capacitor/core')
        const appMod = require('@capacitor/app')
        const pushMod = require('@capacitor/push-notifications')
        const deviceMod = require('@capacitor/device')

        const Capacitor = capCore?.Capacitor
        const App = appMod?.App
        const PushNotifications = pushMod?.PushNotifications
        const Device = deviceMod?.Device

        const capacitorPresent = !!Capacitor
        const platform = String(Capacitor?.getPlatform?.() || 'unknown')
        const pluginNames = Capacitor?.Plugins ? Object.keys(Capacitor.Plugins) : []

        const appInfo = await App?.getInfo?.().catch(() => null)
        const deviceInfo = await Device?.getInfo?.().catch(() => null)
        const pushPerm = await PushNotifications?.checkPermissions?.().catch(() => null)

        const biom = await checkBiometricsAvailable()
        const healthAvailable = await isHealthKitAvailable()
        const notif = await checkNativeNotificationPermission()

        if (!alive) return
        setIosDiag({
          capacitorPresent,
          platform,
          pluginNames,
          app: appInfo || null,
          device: deviceInfo || null,
          push: pushPerm || null,
          biometrics: biom || null,
          notifications: notif || null,
          healthKitAvailable: healthAvailable,
        })
      } catch {
        if (!alive) return
        setIosDiag(null)
      } finally {
        if (!alive) return
        setIosDiagBusy(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [isOpen])

  const iosDiagObj = isObject(iosDiag) ? (iosDiag as Record<string, unknown>) : null
  const iosDiagApp = iosDiagObj && isObject(iosDiagObj.app) ? (iosDiagObj.app as Record<string, unknown>) : null
  const iosDiagDevice = iosDiagObj && isObject(iosDiagObj.device) ? (iosDiagObj.device as Record<string, unknown>) : null
  const iosDiagPush = iosDiagObj && isObject(iosDiagObj.push) ? (iosDiagObj.push as Record<string, unknown>) : null
  const iosDiagNotif = iosDiagObj && isObject(iosDiagObj.notifications) ? (iosDiagObj.notifications as Record<string, unknown>) : null
  const iosDiagBiom = iosDiagObj && isObject(iosDiagObj.biometrics) ? (iosDiagObj.biometrics as Record<string, unknown>) : null
  const iosDiagPlugins = iosDiagObj && Array.isArray(iosDiagObj.pluginNames) ? (iosDiagObj.pluginNames as unknown[]) : []

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-gradient-to-r from-neutral-900 to-neutral-900/80">
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 inline-flex items-center justify-center">
              <Layers size={20} className="text-yellow-500" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Personalização</div>
              <div className="text-white font-black text-lg truncate">{title}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => props?.onClose?.()}
            className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={Palette} label="Aparência" />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Densidade do Dashboard</div>
                  <div className="text-xs text-neutral-400">Ajusta espaçamento e tamanho dos cards.</div>
                </div>
                <select
                  value={density}
                  onChange={(e) => setValue('dashboardDensity', e.target.value)}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="comfortable">Confortável</option>
                  <option value="compact">Compacto</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={CalendarDays} label="Nomes de treinos" />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Dia inicial do programa</div>
                  <div className="text-xs text-neutral-400">Define como “A - ... (SEGUNDA)” começa no Wizard.</div>
                </div>
                <select
                  value={programTitleStartDay}
                  onChange={(e) => setValue('programTitleStartDay', e.target.value)}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="monday">Segunda</option>
                  <option value="tuesday">Terça</option>
                  <option value="wednesday">Quarta</option>
                  <option value="thursday">Quinta</option>
                  <option value="friday">Sexta</option>
                  <option value="saturday">Sábado</option>
                  <option value="sunday">Domingo</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={Layers} label="Modo do App" />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Experiência</div>
                  <div className="text-xs text-neutral-400">Ajusta o quanto de recurso aparece por padrão.</div>
                </div>
                <select
                  value={uiMode}
                  onChange={(e) => {
                    const next = String(e.target.value || 'beginner')
                    setValue('uiMode', next)
                    if (next === 'beginner') {
                      setValue('moduleSocial', true)
                      setValue('moduleCommunity', true)
                      setValue('moduleMarketplace', true)
                    } else if (next === 'intermediate') {
                      setValue('moduleSocial', true)
                      setValue('moduleCommunity', false)
                      setValue('moduleMarketplace', false)
                    }
                  }}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="beginner">Iniciante</option>
                  <option value="intermediate">Intermediário</option>
                  <option value="advanced">Avançado</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Módulos opcionais</div>
                  <div className="text-xs text-neutral-400">Ative/desative Social, Comunidade e Marketplace.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setModulesModalOpen(true)}
                  className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800"
                >
                  Gerenciar
                </button>
              </div>

              <div className="pt-3 border-t border-neutral-700/60 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Check-in pré-treino</div>
                    <div className="text-xs text-neutral-400">Pergunta energia/dor/tempo antes de iniciar.</div>
                  </div>
                  <ToggleSwitch checked={promptPreWorkoutCheckin} onChange={() => setValue('promptPreWorkoutCheckin', !promptPreWorkoutCheckin)} />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Check-in pós-treino</div>
                    <div className="text-xs text-neutral-400">Pergunta RPE/satisfação ao finalizar.</div>
                  </div>
                  <ToggleSwitch checked={promptPostWorkoutCheckin} onChange={() => setValue('promptPostWorkoutCheckin', !promptPostWorkoutCheckin)} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={Wrench} label="Ferramentas" />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Novos Recordes</div>
                  <div className="text-xs text-neutral-400">Mostra o card de PRs recentes no dashboard.</div>
                </div>
                <ToggleSwitch checked={showNewRecordsCard} onChange={() => setValue('showNewRecordsCard', !showNewRecordsCard)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Iron Rank</div>
                  <div className="text-xs text-neutral-400">Mostra o card de nível e ranking global.</div>
                </div>
                <ToggleSwitch checked={showIronRank} onChange={() => setValue('showIronRank', !showIronRank)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Conquistas</div>
                  <div className="text-xs text-neutral-400">Mostra os badges de progresso (streak/volume).</div>
                </div>
                <ToggleSwitch checked={showBadges} onChange={() => setValue('showBadges', !showBadges)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Stories no Dashboard</div>
                  <div className="text-xs text-neutral-400">Mostra a barra de stories no topo do dashboard.</div>
                </div>
                <ToggleSwitch checked={showStoriesBar} onChange={() => setValue('showStoriesBar', !showStoriesBar)} />
              </div>

              {props?.onOpenWhatsNew ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Últimas atualizações</div>
                    <div className="text-xs text-neutral-400">Veja o que mudou na versão mais recente.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => props?.onOpenWhatsNew?.()}
                    className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800"
                  >
                    Abrir
                  </button>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Abrir novidades automaticamente</div>
                  <div className="text-xs text-neutral-400">Mostra o aviso quando existirem novas atualizações.</div>
                </div>
                <ToggleSwitch checked={whatsNewAutoOpen} onChange={() => setValue('whatsNewAutoOpen', !whatsNewAutoOpen)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Repetir por 24h</div>
                  <div className="text-xs text-neutral-400">Mesmo após fechar, volta a aparecer por 24h.</div>
                </div>
                <ToggleSwitch checked={whatsNewRemind24h} onChange={() => setValue('whatsNewRemind24h', !whatsNewRemind24h)} />
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={Dumbbell} label="Treino" />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Unidades</div>
                  <div className="text-xs text-neutral-400">Peso padrão para cargas.</div>
                </div>
                <select
                  value={units}
                  onChange={(e) => setValue('units', e.target.value)}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Descanso padrão</div>
                  <div className="text-xs text-neutral-400">Usado quando o exercício não tem descanso definido.</div>
                </div>
                <select
                  value={String(restTimerDefaultSeconds)}
                  onChange={(e) => setValue('restTimerDefaultSeconds', Number(e.target.value))}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  {[30, 45, 60, 90, 120, 150, 180].map((v) => (
                    <option key={v} value={String(v)}>{v}s</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Auto iniciar descanso padrão</div>
                  <div className="text-xs text-neutral-400">Ao concluir série sem descanso, inicia o padrão.</div>
                </div>
                <ToggleSwitch checked={autoRestTimerWhenMissing} onChange={() => setValue('autoRestTimerWhenMissing', !autoRestTimerWhenMissing)} />
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={Volume2} label="Som e Convites" />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Sons do App</div>
                  <div className="text-xs text-neutral-400">Notificações e feedback sonoro.</div>
                </div>
                <ToggleSwitch checked={enableSounds} onChange={() => setValue('enableSounds', !enableSounds)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Volume</div>
                  <div className="text-xs text-neutral-400">Controla intensidade dos sons.</div>
                </div>
                <div className="w-40 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={soundVolume}
                    onChange={(e) => setValue('soundVolume', Number(e.target.value))}
                    className="w-full accent-yellow-500"
                  />
                  <div className="font-mono text-xs font-bold text-neutral-200 w-10 text-right">{soundVolume}%</div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Convites de Treino em Equipe</div>
                  <div className="text-xs text-neutral-400">Permite receber convites no modal “BORA!”.</div>
                </div>
                <ToggleSwitch checked={allowTeamInvites} onChange={() => setValue('allowTeamInvites', !allowTeamInvites)} />
              </div>

              {canSeeExperimental ? (
                <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Experimentais</div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-white">Kill Switch</div>
                      <div className="text-xs text-neutral-400">Desativa recursos em teste neste usuário.</div>
                    </div>
                    <ToggleSwitch checked={featuresKillSwitch} onChange={() => setValue('featuresKillSwitch', !featuresKillSwitch)} />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-white">Treino em Equipe V2</div>
                      <div className="text-xs text-neutral-400">Link/QR, presença e saída segura da sessão.</div>
                    </div>
                    <ToggleSwitch checked={featureTeamworkV2} onChange={() => setValue('featureTeamworkV2', !featureTeamworkV2)} disabled={featuresKillSwitch} />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-white">Stories/Relatórios V2</div>
                      <div className="text-xs text-neutral-400">CTA pós-treino e melhorias de compartilhamento.</div>
                    </div>
                    <ToggleSwitch checked={featureStoriesV2} onChange={() => setValue('featureStoriesV2', !featureStoriesV2)} disabled={featuresKillSwitch} />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-white">Offline Sync V2</div>
                      <div className="text-xs text-neutral-400">Fila com backoff, limites e central de pendências.</div>
                    </div>
                    <ToggleSwitch checked={featureOfflineSyncV2} onChange={() => setValue('featureOfflineSyncV2', !featureOfflineSyncV2)} disabled={featuresKillSwitch} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={Bell} label="Notificações" />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Toasts no app</div>
                  <div className="text-xs text-neutral-400">Mensagens rápidas no topo da tela.</div>
                </div>
                <ToggleSwitch checked={inAppToasts} onChange={() => setValue('inAppToasts', !inAppToasts)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Pedir permissão automaticamente</div>
                  <div className="text-xs text-neutral-400">Evita prompt do navegador ao iniciar treino.</div>
                </div>
                <ToggleSwitch checked={notificationPermissionPrompt} onChange={() => setValue('notificationPermissionPrompt', !notificationPermissionPrompt)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Notificação de mensagem direta</div>
                  <div className="text-xs text-neutral-400">Aparece no centro de notificações.</div>
                </div>
                <ToggleSwitch checked={notifyDirectMessages} onChange={() => setValue('notifyDirectMessages', !notifyDirectMessages)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Notificação de agenda</div>
                  <div className="text-xs text-neutral-400">Lembretes e eventos criados pelo coach.</div>
                </div>
                <ToggleSwitch checked={notifyAppointments} onChange={() => setValue('notifyAppointments', !notifyAppointments)} />
              </div>

              {isIosNative() ? (
                <div className="mt-2 rounded-xl bg-neutral-900 border border-neutral-700 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-white">Notificações do iOS</div>
                      <div className="text-xs text-neutral-400">Status: {iosNotifStatus}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={iosNotifBusy}
                        onClick={async () => {
                          try {
                            setIosNotifBusy(true)
                            await requestNativeNotifications()
                            const res = await checkNativeNotificationPermission()
                            setIosNotifStatus(String((res as Record<string, unknown>)?.status ?? 'unknown'))
                          } catch {
                            setIosNotifStatus('unknown')
                          } finally {
                            setIosNotifBusy(false)
                          }
                        }}
                        className="px-3 py-2 rounded-xl bg-yellow-500 text-black font-black disabled:opacity-60"
                      >
                        Solicitar
                      </button>
                      <button
                        type="button"
                        disabled={iosNotifBusy}
                        onClick={async () => {
                          try {
                            setIosNotifBusy(true)
                            await openAppSettings()
                          } catch {
                          } finally {
                            setIosNotifBusy(false)
                          }
                        }}
                        className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black disabled:opacity-60"
                      >
                        Abrir Ajustes
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {isIosNative() ? (
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Smartphone size={14} className="text-yellow-500" />
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Diagnóstico iOS</div>
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">Capacitor, plugins e permissões no device.</div>
                </div>
                <button
                  type="button"
                  disabled={iosDiagBusy}
                  onClick={async () => {
                    try {
                      setIosDiagBusy(true)
                      const capCore = require('@capacitor/core')
                      const appMod = require('@capacitor/app')
                      const pushMod = require('@capacitor/push-notifications')
                      const deviceMod = require('@capacitor/device')

                      const Capacitor = capCore?.Capacitor
                      const App = appMod?.App
                      const PushNotifications = pushMod?.PushNotifications
                      const Device = deviceMod?.Device

                      const capacitorPresent = !!Capacitor
                      const platform = String(Capacitor?.getPlatform?.() || 'unknown')
                      const pluginNames = Capacitor?.Plugins ? Object.keys(Capacitor.Plugins) : []

                      const appInfo = await App?.getInfo?.().catch(() => null)
                      const deviceInfo = await Device?.getInfo?.().catch(() => null)
                      const pushPerm = await PushNotifications?.checkPermissions?.().catch(() => null)

                      const biom = await checkBiometricsAvailable()
                      const healthAvailable = await isHealthKitAvailable()
                      const notif = await checkNativeNotificationPermission()

                      setIosDiag({
                        capacitorPresent,
                        platform,
                        pluginNames,
                        app: appInfo || null,
                        device: deviceInfo || null,
                        push: pushPerm || null,
                        biometrics: biom || null,
                        notifications: notif || null,
                        healthKitAvailable: healthAvailable,
                      })
                    } catch {
                      setIosDiag(null)
                    } finally {
                      setIosDiagBusy(false)
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black disabled:opacity-60"
                >
                  Atualizar
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Runtime</div>
                  <div className="text-xs text-neutral-200 mt-1">
                    {String(iosDiagObj?.platform ?? 'unknown')} · Capacitor:{' '}
                    {Boolean(iosDiagObj?.capacitorPresent) ? 'ok' : 'não'}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">
                    App:{' '}
                    {String(iosDiagApp?.name ?? '') || '—'} · v{String(iosDiagApp?.version ?? '') || '—'} ({String(iosDiagApp?.build ?? '') || '—'})
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">
                    iOS:{' '}
                    {String(iosDiagDevice?.osVersion ?? '') || '—'} · Model: {String(iosDiagDevice?.model ?? '') || '—'}
                  </div>
                </div>

                <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Permissões</div>
                  <div className="text-[11px] text-neutral-300 mt-1">
                    Notificações: {String(iosDiagNotif?.status ?? '') || 'unknown'}
                  </div>
                  <div className="text-[11px] text-neutral-300 mt-1">
                    Push: {String(iosDiagPush?.receive ?? '') || 'unknown'}
                  </div>
                  <div className="text-[11px] text-neutral-300 mt-1">
                    Biometria:{' '}
                    {Boolean(iosDiagBiom?.available) ? String(iosDiagBiom?.biometryType || 'ok') : 'não'}
                  </div>
                  <div className="text-[11px] text-neutral-300 mt-1">
                    HealthKit: {Boolean(iosDiagObj?.healthKitAvailable) ? 'disponível' : 'não'}
                  </div>
                </div>

                <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Plugins</div>
                  <div className="text-[11px] text-neutral-400 mt-1 break-words">
                    {iosDiagPlugins.length
                      ? iosDiagPlugins.slice(0, 18).map((v) => String(v || '').trim()).filter(Boolean).join(', ')
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await triggerHaptic('success')
                      alert('Ok', 'Haptic')
                    } catch {
                      alert('Falhou', 'Haptic')
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-yellow-500 text-black font-black"
                >
                  Testar Haptic
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await authenticateWithBiometrics('Confirmar Face ID / Touch ID')
                      alert(res?.success ? 'Ok' : String(res?.error || 'Falhou'), 'Biometria')
                    } catch {
                      alert('Falhou', 'Biometria')
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black"
                >
                  Testar Biometria
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await requestHealthKitPermission()
                      alert(res?.granted ? 'Permissão ok' : String(res?.error || 'Negado'), 'HealthKit')
                    } catch {
                      alert('Falhou', 'HealthKit')
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black"
                >
                  Pedir HealthKit
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const pushMod = require('@capacitor/push-notifications')
                      const PushNotifications = pushMod?.PushNotifications
                      if (!PushNotifications) {
                        alert('Plugin indisponível', 'Push')
                        return
                      }
                      const res = await PushNotifications.requestPermissions().catch(() => ({ receive: 'denied' }))
                      alert(String(res?.receive || 'unknown'), 'Push')
                    } catch {
                      alert('Falhou', 'Push')
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black"
                >
                  Pedir Push
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const id = iosLiveTestId || `diagnostic-${Date.now()}`
                      await startRestLiveActivity(id, 60, 'Diagnóstico')
                      setIosLiveTestId(id)
                      alert('Iniciada (60s)', 'Live Activity')
                    } catch {
                      alert('Falhou', 'Live Activity')
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black"
                >
                  Testar Live Activity
                </button>

                <button
                  type="button"
                  disabled={!iosLiveTestId}
                  onClick={async () => {
                    try {
                      if (!iosLiveTestId) return
                      await endRestLiveActivity(iosLiveTestId)
                      setIosLiveTestId('')
                      alert('Encerrada', 'Live Activity')
                    } catch {
                      alert('Falhou', 'Live Activity')
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black disabled:opacity-60"
                >
                  Encerrar Live Activity
                </button>
              </div>
            </div>
          ) : null}

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={Lock} label="Privacidade" />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Mensagens diretas</div>
                  <div className="text-xs text-neutral-400">Permite iniciar e receber conversas diretas.</div>
                </div>
                <ToggleSwitch checked={allowDirectMessages} onChange={() => setValue('allowDirectMessages', !allowDirectMessages)} />
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={Timer} label="Timer" />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Notificar ao terminar</div>
                  <div className="text-xs text-neutral-400">Mostra notificação do navegador (se permitido).</div>
                </div>
                <ToggleSwitch checked={restTimerNotify} onChange={() => setValue('restTimerNotify', !restTimerNotify)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Vibração</div>
                  <div className="text-xs text-neutral-400">Apenas em celulares compatíveis.</div>
                </div>
                <ToggleSwitch checked={restTimerVibrate} onChange={() => setValue('restTimerVibrate', !restTimerVibrate)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Repetir alarme</div>
                  <div className="text-xs text-neutral-400">Toca e vibra até você fechar.</div>
                </div>
                <ToggleSwitch checked={restTimerRepeatAlarm} onChange={() => setValue('restTimerRepeatAlarm', !restTimerRepeatAlarm)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Alarme contínuo</div>
                  <div className="text-xs text-neutral-400">Mantém tocando até abrir o app.</div>
                </div>
                <ToggleSwitch checked={restTimerContinuousAlarm} onChange={() => setValue('restTimerContinuousAlarm', !restTimerContinuousAlarm)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Intervalo do alarme</div>
                  <div className="text-xs text-neutral-400">Quanto tempo entre repetições.</div>
                </div>
                <select
                  value={String(restTimerRepeatIntervalMs)}
                  onChange={(e) => setValue('restTimerRepeatIntervalMs', Number(e.target.value))}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  {[1000, 1500, 2000, 2500, 3000].map((v) => (
                    <option key={v} value={String(v)}>{(v / 1000).toFixed(1)}s</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Duração do alarme</div>
                  <div className="text-xs text-neutral-400">Tempo total tocando até abrir o app.</div>
                </div>
                <select
                  value={String(restTimerRepeatMaxSeconds)}
                  onChange={(e) => setValue('restTimerRepeatMaxSeconds', Number(e.target.value))}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  {[30, 60, 90, 120, 180, 240, 300, 420, 600].map((v) => (
                    <option key={v} value={String(v)}>{v}s</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Quantidade máxima</div>
                  <div className="text-xs text-neutral-400">Limite de repetições do aviso.</div>
                </div>
                <select
                  value={String(restTimerRepeatMaxCount)}
                  onChange={(e) => setValue('restTimerRepeatMaxCount', Number(e.target.value))}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  {[3, 5, 10, 15, 20, 30, 45, 60, 90, 120].map((v) => (
                    <option key={v} value={String(v)}>{v}x</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Tick nos últimos 5s</div>
                  <div className="text-xs text-neutral-400">Ajuda no ritmo em cluster.</div>
                </div>
                <ToggleSwitch checked={restTimerTickCountdown} onChange={() => setValue('restTimerTickCountdown', !restTimerTickCountdown)} />
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={HelpCircle} label="Ajuda e Suporte" />
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    const subject = encodeURIComponent('Suporte IronTracks')
                    const body = encodeURIComponent('Olá equipe IronTracks,\n\nPreciso de ajuda com:\n\n')
                    window.open(`mailto:irontrackscompany@gmail.com?subject=${subject}&body=${body}`, '_blank')
                  } catch { }
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 inline-flex items-center justify-center shrink-0">
                  <Mail size={18} className="text-yellow-500" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-bold text-white">Suporte por E-mail</div>
                  <div className="text-xs text-neutral-400 truncate">irontrackscompany@gmail.com</div>
                </div>
                <ExternalLink size={14} className="text-neutral-500 group-hover:text-yellow-500 transition-colors shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    window.open('https://tawk.to/chat/irontracks', '_blank')
                  } catch { }
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 inline-flex items-center justify-center shrink-0">
                  <MessageCircle size={18} className="text-green-500" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-bold text-white">Chat em Tempo Real</div>
                  <div className="text-xs text-neutral-400">Converse com a equipe agora</div>
                </div>
                <ChevronRight size={14} className="text-neutral-500 group-hover:text-green-500 transition-colors shrink-0" />
              </button>
            </div>
            <div className="mt-3 text-[11px] text-neutral-500 text-center">
              Estamos aqui para ajudar! Resposta em até 24h por e-mail.
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <SectionHeader icon={Database} label="Dados e Dispositivo" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const payload = JSON.stringify(draft && typeof draft === 'object' ? draft : {}, null, 2)
                    const blob = new Blob([payload], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `irontracks-settings-${new Date().toISOString()}.json`
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    URL.revokeObjectURL(url)
                  } catch (e: unknown) {
                    await alert('Falha ao exportar: ' + (getErrorMessage(e) ?? String(e)))
                  }
                }}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 inline-flex items-center justify-center gap-2"
              >
                <Download size={16} className="text-yellow-500" />
                Exportar
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    setDraft(DEFAULT_SETTINGS)
                    await alert('Preferências resetadas. Clique em Salvar para aplicar.')
                  } catch (e: unknown) {
                    await alert('Falha ao resetar: ' + (getErrorMessage(e) ?? String(e)))
                  }
                }}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 inline-flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} className="text-yellow-500" />
                Resetar
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    if (typeof window === 'undefined') return
                    const keys: string[] = [];
                    for (let i = 0; i < window.localStorage.length; i += 1) {
                      const k = window.localStorage.key(i)
                      if (k) keys.push(k)
                    }
                    keys.forEach((k) => {
                      if (k.startsWith('irontracks.')) {
                        try { window.localStorage.removeItem(k) } catch { }
                      }
                    })
                    try { window.location.reload() } catch { }
                  } catch (e: unknown) {
                    await alert('Falha ao limpar cache: ' + (getErrorMessage(e) ?? String(e)))
                  }
                }}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 inline-flex items-center justify-center gap-2"
              >
                <Trash2 size={16} className="text-yellow-500" />
                Limpar cache
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/account/export', { method: 'GET' })
                    const data = await res.json().catch((): null => null)
                    if (!data || !data.ok) {
                      await alert('Falha ao exportar dados: ' + (data?.error || ''))
                      return
                    }
                    const payload = JSON.stringify(data, null, 2)
                    const blob = new Blob([payload], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `irontracks-account-export-${new Date().toISOString()}.json`
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    URL.revokeObjectURL(url)
                  } catch (e: unknown) {
                    await alert('Falha ao exportar dados: ' + (getErrorMessage(e) ?? String(e)))
                  }
                }}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 inline-flex items-center justify-center gap-2"
              >
                <Download size={16} className="text-yellow-500" />
                Exportar meus dados
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    let supabase
                    try {
                      supabase = createClient()
                    } catch {
                      await alert('Falha ao sair: configuração ausente')
                      return
                    }
                    await supabase.auth.signOut({ scope: 'global' })
                    try { window.location.href = '/auth/login' } catch { }
                  } catch (e: unknown) {
                    await alert('Falha ao sair: ' + (getErrorMessage(e) ?? String(e)))
                  }
                }}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 inline-flex items-center justify-center gap-2"
              >
                <LogOut size={16} className="text-yellow-500" />
                Sair de todos
              </button>
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const typed = typeof window !== 'undefined' ? window.prompt('Digite EXCLUIR para confirmar a exclusão da conta:') : null
                    if (String(typed || '').trim().toUpperCase() !== 'EXCLUIR') return
                    const res = await fetch('/api/account/delete', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ confirm: 'EXCLUIR' }),
                    })
                    const data = await res.json().catch((): null => null)
                    if (!data || !data.ok) {
                      await alert('Falha ao excluir conta: ' + (data?.error || ''))
                      return
                    }
                    try {
                      let supabase
                      try {
                        supabase = createClient()
                      } catch {
                        supabase = null
                      }
                      if (supabase) await supabase.auth.signOut({ scope: 'global' })
                    } catch { }
                    try { window.location.href = '/auth/login' } catch { }
                  } catch (e: unknown) {
                    await alert('Falha ao excluir conta: ' + (getErrorMessage(e) ?? String(e)))
                  }
                }}
                className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-red-600/15 border border-red-500/40 text-red-200 font-black hover:bg-red-600/25 inline-flex items-center justify-center gap-2"
              >
                <ShieldAlert size={16} className="text-red-300" />
                Excluir minha conta
              </button>
              <div className="mt-2 text-[11px] text-neutral-400">
                Remove seus dados do app e encerra acesso. Ação irreversível.
              </div>
            </div>
          </div>
        </div>

        {modulesModalOpen && (
          <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setModulesModalOpen(false)}>
            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Módulos</div>
                  <div className="text-white font-black text-lg truncate">Personalizar</div>
                </div>
                <button
                  type="button"
                  onClick={() => setModulesModalOpen(false)}
                  className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Social</div>
                    <div className="text-xs text-neutral-400">Stories e recursos sociais.</div>
                  </div>
                  <ToggleSwitch checked={moduleSocial} onChange={() => setValue('moduleSocial', !moduleSocial)} />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Comunidade</div>
                    <div className="text-xs text-neutral-400">Lista e interações de comunidade.</div>
                  </div>
                  <ToggleSwitch checked={moduleCommunity} onChange={() => setValue('moduleCommunity', !moduleCommunity)} />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Marketplace</div>
                    <div className="text-xs text-neutral-400">Planos e assinaturas de professores.</div>
                  </div>
                  <ToggleSwitch checked={moduleMarketplace} onChange={() => setValue('moduleMarketplace', !moduleMarketplace)} />
                </div>
              </div>
              <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setValue('moduleSocial', true)
                    setValue('moduleCommunity', true)
                    setValue('moduleMarketplace', true)
                  }}
                  className="px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 inline-flex items-center gap-2"
                >
                  <RotateCcw size={16} className="text-yellow-500" />
                  Restaurar
                </button>
                <button
                  type="button"
                  onClick={() => setModulesModalOpen(false)}
                  className="px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 inline-flex items-center gap-2"
                >
                  Ok
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 flex items-center justify-between gap-2">
          <div className="text-[10px] text-neutral-600 font-mono">IronTracks</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => props?.onClose?.()}
              className="px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 transition-colors"
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={async () => {
                try {
                  const ok = await props?.onSave?.(draft)
                  if (ok === false) return
                  props?.onClose?.()
                } catch (e: unknown) {
                  await alert('Falha ao salvar: ' + (getErrorMessage(e) ?? String(e)))
                }
              }}
              className={
                canSave
                  ? 'px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 inline-flex items-center gap-2 transition-colors'
                  : 'px-4 py-3 rounded-xl bg-yellow-500/70 text-black font-black cursor-wait inline-flex items-center gap-2'
              }
            >
              <Save size={16} />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
