'use client'
import React from 'react'
import { Palette, CalendarDays, Layers, Wrench, Dumbbell, Volume2, Bell, Timer, Lock, RotateCcw } from 'lucide-react'
import { SectionCard, SectionHeader, ToggleSwitch, type SettingsSectionProps } from './settingsShared'

// ── Aparência ────────────────────────────────────────────────────────────────
export function SettingsAppearanceSection({ draft, setValue }: SettingsSectionProps) {
    const density = String(draft?.dashboardDensity || 'comfortable')
    return (
        <SectionCard>
            <SectionHeader icon={Palette} label="Aparência" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-white">Densidade do Dashboard</div>
                        <div className="text-xs text-neutral-400">Ajusta espaçamento e tamanho dos cards.</div>
                    </div>
                    <select value={density} onChange={(e) => setValue('dashboardDensity', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white">
                        <option value="comfortable">Confortável</option>
                        <option value="compact">Compacto</option>
                    </select>
                </div>
            </div>
        </SectionCard>
    )
}

// ── Nomes de treinos ─────────────────────────────────────────────────────────
export function SettingsWorkoutNamesSection({ draft, setValue }: SettingsSectionProps) {
    const programTitleStartDay = String(draft?.programTitleStartDay || 'monday')
    return (
        <SectionCard>
            <SectionHeader icon={CalendarDays} label="Nomes de treinos" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-white">Dia inicial do programa</div>
                        <div className="text-xs text-neutral-400">Define como &quot;A - ... (SEGUNDA)&quot; começa no Wizard.</div>

                    </div>
                    <select value={programTitleStartDay} onChange={(e) => setValue('programTitleStartDay', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white">
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
        </SectionCard>
    )
}

// ── Modo do App ──────────────────────────────────────────────────────────────
interface SettingsAppModeSectionProps extends SettingsSectionProps {
    setModulesModalOpen: (v: boolean) => void
}
export function SettingsAppModeSection({ draft, setValue, setModulesModalOpen }: SettingsAppModeSectionProps) {
    const uiMode = String(draft?.uiMode || 'beginner')
    const promptPreWorkoutCheckin = Boolean(draft?.promptPreWorkoutCheckin ?? true)
    const promptPostWorkoutCheckin = Boolean(draft?.promptPostWorkoutCheckin ?? true)
    return (
        <SectionCard>
            <SectionHeader icon={Layers} label="Modo do App" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-white">Experiência</div>
                        <div className="text-xs text-neutral-400">Ajusta o quanto de recurso aparece por padrão.</div>
                    </div>
                    <select value={uiMode} onChange={(e) => {
                        const next = String(e.target.value || 'beginner')
                        setValue('uiMode', next)
                        if (next === 'beginner') { setValue('moduleSocial', true); setValue('moduleCommunity', true); setValue('moduleMarketplace', true) }
                        else if (next === 'intermediate') { setValue('moduleSocial', true); setValue('moduleCommunity', false); setValue('moduleMarketplace', false) }
                    }} className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white">
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
                    <button type="button" onClick={() => setModulesModalOpen(true)} className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800">Gerenciar</button>
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
        </SectionCard>
    )
}

// ── Ferramentas ──────────────────────────────────────────────────────────────
interface SettingsToolsSectionProps extends SettingsSectionProps {
    onOpenWhatsNew?: () => void
}
export function SettingsToolsSection({ draft, setValue, onOpenWhatsNew }: SettingsToolsSectionProps) {
    const showNewRecordsCard = Boolean(draft?.showNewRecordsCard ?? true)
    const showIronRank = Boolean(draft?.showIronRank ?? true)
    const showBadges = Boolean(draft?.showBadges ?? true)
    const showStoriesBar = Boolean(draft?.showStoriesBar ?? true)
    const whatsNewAutoOpen = Boolean(draft?.whatsNewAutoOpen ?? true)
    const whatsNewRemind24h = Boolean(draft?.whatsNewRemind24h ?? true)
    return (
        <SectionCard>
            <SectionHeader icon={Wrench} label="Ferramentas" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Novos Recordes</div><div className="text-xs text-neutral-400">Mostra o card de PRs recentes no dashboard.</div></div>
                    <ToggleSwitch checked={showNewRecordsCard} onChange={() => setValue('showNewRecordsCard', !showNewRecordsCard)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Iron Rank</div><div className="text-xs text-neutral-400">Mostra o card de nível e ranking global.</div></div>
                    <ToggleSwitch checked={showIronRank} onChange={() => setValue('showIronRank', !showIronRank)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Conquistas</div><div className="text-xs text-neutral-400">Mostra os badges de progresso (streak/volume).</div></div>
                    <ToggleSwitch checked={showBadges} onChange={() => setValue('showBadges', !showBadges)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Stories no Dashboard</div><div className="text-xs text-neutral-400">Mostra a barra de stories no topo do dashboard.</div></div>
                    <ToggleSwitch checked={showStoriesBar} onChange={() => setValue('showStoriesBar', !showStoriesBar)} />
                </div>
                {onOpenWhatsNew && (
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Últimas atualizações</div><div className="text-xs text-neutral-400">Veja o que mudou na versão mais recente.</div></div>
                        <button type="button" onClick={onOpenWhatsNew} className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800">Abrir</button>
                    </div>
                )}
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Abrir novidades automaticamente</div><div className="text-xs text-neutral-400">Mostra o aviso quando existirem novas atualizações.</div></div>
                    <ToggleSwitch checked={whatsNewAutoOpen} onChange={() => setValue('whatsNewAutoOpen', !whatsNewAutoOpen)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Repetir por 24h</div><div className="text-xs text-neutral-400">Mesmo após fechar, volta a aparecer por 24h.</div></div>
                    <ToggleSwitch checked={whatsNewRemind24h} onChange={() => setValue('whatsNewRemind24h', !whatsNewRemind24h)} />
                </div>
            </div>
        </SectionCard>
    )
}

// ── Treino ───────────────────────────────────────────────────────────────────
export function SettingsWorkoutSection({ draft, setValue }: SettingsSectionProps) {
    const units = String(draft?.units || 'kg')
    const restTimerDefaultSeconds = Math.max(15, Math.min(600, Number(draft?.restTimerDefaultSeconds ?? 90) || 90))
    const autoRestTimerWhenMissing = Boolean(draft?.autoRestTimerWhenMissing ?? false)
    return (
        <SectionCard>
            <SectionHeader icon={Dumbbell} label="Treino" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Unidades</div><div className="text-xs text-neutral-400">Peso padrão para cargas.</div></div>
                    <select value={units} onChange={(e) => setValue('units', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white">
                        <option value="kg">kg</option>
                        <option value="lb">lb</option>
                    </select>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Descanso padrão</div><div className="text-xs text-neutral-400">Usado quando o exercício não tem descanso definido.</div></div>
                    <select value={String(restTimerDefaultSeconds)} onChange={(e) => setValue('restTimerDefaultSeconds', Number(e.target.value))} className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white">
                        {[30, 45, 60, 90, 120, 150, 180].map((v) => <option key={v} value={String(v)}>{v}s</option>)}
                    </select>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Auto iniciar descanso padrão</div><div className="text-xs text-neutral-400">Ao concluir série sem descanso, inicia o padrão.</div></div>
                    <ToggleSwitch checked={autoRestTimerWhenMissing} onChange={() => setValue('autoRestTimerWhenMissing', !autoRestTimerWhenMissing)} />
                </div>
            </div>
        </SectionCard>
    )
}

// ── Som e Convites ───────────────────────────────────────────────────────────
interface SettingsSoundSectionProps extends SettingsSectionProps {
    canSeeExperimental: boolean
}
export function SettingsSoundSection({ draft, setValue, canSeeExperimental }: SettingsSoundSectionProps) {
    const enableSounds = Boolean(draft?.enableSounds ?? true)
    const soundVolume = Math.max(0, Math.min(100, Number(draft?.soundVolume ?? 100) || 0))
    const allowTeamInvites = Boolean(draft?.allowTeamInvites ?? true)
    const featuresKillSwitch = Boolean(draft?.featuresKillSwitch ?? false)
    const featureTeamworkV2 = Boolean(draft?.featureTeamworkV2 ?? false)
    const featureStoriesV2 = Boolean(draft?.featureStoriesV2 ?? false)
    const featureOfflineSyncV2 = Boolean(draft?.featureOfflineSyncV2 ?? false)
    return (
        <SectionCard>
            <SectionHeader icon={Volume2} label="Som e Convites" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Sons do App</div><div className="text-xs text-neutral-400">Notificações e feedback sonoro.</div></div>
                    <ToggleSwitch checked={enableSounds} onChange={() => setValue('enableSounds', !enableSounds)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Volume</div><div className="text-xs text-neutral-400">Controla intensidade dos sons.</div></div>
                    <div className="w-40 flex items-center gap-3">
                        <input type="range" min={0} max={100} step={5} value={soundVolume} onChange={(e) => setValue('soundVolume', Number(e.target.value))} className="w-full accent-yellow-500" />
                        <div className="font-mono text-xs font-bold text-neutral-200 w-10 text-right">{soundVolume}%</div>
                    </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Convites de Treino em Equipe</div><div className="text-xs text-neutral-400">Permite receber convites no modal &quot;BORA!&quot;.</div></div>
                    <ToggleSwitch checked={allowTeamInvites} onChange={() => setValue('allowTeamInvites', !allowTeamInvites)} />
                </div>
                {canSeeExperimental && (
                    <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Experimentais</div>
                        <div className="flex items-center justify-between gap-3">
                            <div><div className="text-sm font-bold text-white">Kill Switch</div><div className="text-xs text-neutral-400">Desativa recursos em teste neste usuário.</div></div>
                            <ToggleSwitch checked={featuresKillSwitch} onChange={() => setValue('featuresKillSwitch', !featuresKillSwitch)} />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <div><div className="text-sm font-bold text-white">Treino em Equipe V2</div><div className="text-xs text-neutral-400">Link/QR, presença e saída segura da sessão.</div></div>
                            <ToggleSwitch checked={featureTeamworkV2} onChange={() => setValue('featureTeamworkV2', !featureTeamworkV2)} disabled={featuresKillSwitch} />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <div><div className="text-sm font-bold text-white">Stories/Relatórios V2</div><div className="text-xs text-neutral-400">CTA pós-treino e melhorias de compartilhamento.</div></div>
                            <ToggleSwitch checked={featureStoriesV2} onChange={() => setValue('featureStoriesV2', !featureStoriesV2)} disabled={featuresKillSwitch} />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <div><div className="text-sm font-bold text-white">Offline Sync V2</div><div className="text-xs text-neutral-400">Fila com backoff, limites e central de pendências.</div></div>
                            <ToggleSwitch checked={featureOfflineSyncV2} onChange={() => setValue('featureOfflineSyncV2', !featureOfflineSyncV2)} disabled={featuresKillSwitch} />
                        </div>
                    </div>
                )}
            </div>
        </SectionCard>
    )
}

// ── Timer ────────────────────────────────────────────────────────────────────
export function SettingsTimerSection({ draft, setValue }: SettingsSectionProps) {
    const restTimerNotify = Boolean(draft?.restTimerNotify ?? true)
    const restTimerVibrate = Boolean(draft?.restTimerVibrate ?? true)
    const restTimerRepeatAlarm = Boolean(draft?.restTimerRepeatAlarm ?? true)
    const restTimerContinuousAlarm = Boolean(draft?.restTimerContinuousAlarm ?? false)
    const restTimerTickCountdown = Boolean(draft?.restTimerTickCountdown ?? true)
    const restTimerRepeatIntervalMs = Math.max(600, Math.min(6000, Number(draft?.restTimerRepeatIntervalMs ?? 1500) || 1500))
    const restTimerRepeatMaxSeconds = Math.max(10, Math.min(900, Number(draft?.restTimerRepeatMaxSeconds ?? 180) || 180))
    const restTimerRepeatMaxCount = Math.max(1, Math.min(120, Number(draft?.restTimerRepeatMaxCount ?? 60) || 60))
    return (
        <SectionCard>
            <SectionHeader icon={Timer} label="Timer" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Notificar ao terminar</div><div className="text-xs text-neutral-400">Mostra notificação do navegador (se permitido).</div></div>
                    <ToggleSwitch checked={restTimerNotify} onChange={() => setValue('restTimerNotify', !restTimerNotify)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Vibração</div><div className="text-xs text-neutral-400">Apenas em celulares compatíveis.</div></div>
                    <ToggleSwitch checked={restTimerVibrate} onChange={() => setValue('restTimerVibrate', !restTimerVibrate)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Repetir alarme</div><div className="text-xs text-neutral-400">Toca e vibra até você fechar.</div></div>
                    <ToggleSwitch checked={restTimerRepeatAlarm} onChange={() => setValue('restTimerRepeatAlarm', !restTimerRepeatAlarm)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Alarme contínuo</div><div className="text-xs text-neutral-400">Mantém tocando até abrir o app.</div></div>
                    <ToggleSwitch checked={restTimerContinuousAlarm} onChange={() => setValue('restTimerContinuousAlarm', !restTimerContinuousAlarm)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Intervalo do alarme</div><div className="text-xs text-neutral-400">Quanto tempo entre repetições.</div></div>
                    <select value={String(restTimerRepeatIntervalMs)} onChange={(e) => setValue('restTimerRepeatIntervalMs', Number(e.target.value))} className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white">
                        {[1000, 1500, 2000, 2500, 3000].map((v) => <option key={v} value={String(v)}>{(v / 1000).toFixed(1)}s</option>)}
                    </select>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Duração do alarme</div><div className="text-xs text-neutral-400">Tempo total tocando até abrir o app.</div></div>
                    <select value={String(restTimerRepeatMaxSeconds)} onChange={(e) => setValue('restTimerRepeatMaxSeconds', Number(e.target.value))} className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white">
                        {[30, 60, 90, 120, 180, 240, 300, 420, 600].map((v) => <option key={v} value={String(v)}>{v}s</option>)}
                    </select>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Quantidade máxima</div><div className="text-xs text-neutral-400">Limite de repetições do aviso.</div></div>
                    <select value={String(restTimerRepeatMaxCount)} onChange={(e) => setValue('restTimerRepeatMaxCount', Number(e.target.value))} className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white">
                        {[3, 5, 10, 15, 20, 30, 45, 60, 90, 120].map((v) => <option key={v} value={String(v)}>{v}x</option>)}
                    </select>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Tick nos últimos 5s</div><div className="text-xs text-neutral-400">Ajuda no ritmo em cluster.</div></div>
                    <ToggleSwitch checked={restTimerTickCountdown} onChange={() => setValue('restTimerTickCountdown', !restTimerTickCountdown)} />
                </div>
            </div>
        </SectionCard>
    )
}

// ── Privacidade ──────────────────────────────────────────────────────────────
export function SettingsPrivacySection({ draft, setValue }: SettingsSectionProps) {
    const allowDirectMessages = Boolean(draft?.allowDirectMessages ?? true)
    return (
        <SectionCard>
            <SectionHeader icon={Lock} label="Privacidade" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Mensagens diretas</div><div className="text-xs text-neutral-400">Permite iniciar e receber conversas diretas.</div></div>
                    <ToggleSwitch checked={allowDirectMessages} onChange={() => setValue('allowDirectMessages', !allowDirectMessages)} />
                </div>
            </div>
        </SectionCard>
    )
}

// ── Notificações ─────────────────────────────────────────────────────────────
interface SettingsNotificationsSectionProps extends SettingsSectionProps {
    iosNotifStatus: string
    iosNotifBusy: boolean
    onRequestIosNotifPermission: () => Promise<void>
    onOpenAppSettings: () => Promise<void>
    isIosNative: boolean
}
export function SettingsNotificationsSection({ draft, setValue, iosNotifStatus, iosNotifBusy, onRequestIosNotifPermission, onOpenAppSettings, isIosNative }: SettingsNotificationsSectionProps) {
    const inAppToasts = Boolean(draft?.inAppToasts ?? true)
    const notificationPermissionPrompt = Boolean(draft?.notificationPermissionPrompt ?? true)
    const allowSocialFollows = Boolean(draft?.allowSocialFollows ?? true)
    const notifyDirectMessages = Boolean(draft?.notifyDirectMessages ?? true)
    const notifyAppointments = Boolean(draft?.notifyAppointments ?? true)
    const notifySocialFollows = Boolean(draft?.notifySocialFollows ?? true)
    const notifyFriendOnline = Boolean(draft?.notifyFriendOnline ?? true)
    const notifyFriendWorkoutEvents = Boolean(draft?.notifyFriendWorkoutEvents ?? true)
    const notifyFriendPRs = Boolean(draft?.notifyFriendPRs ?? true)
    const notifyFriendStreaks = Boolean(draft?.notifyFriendStreaks ?? true)
    const notifyFriendGoals = Boolean(draft?.notifyFriendGoals ?? true)
    return (
        <SectionCard>
            <SectionHeader icon={Bell} label="Notificações" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Toasts no app</div><div className="text-xs text-neutral-400">Mensagens rápidas no topo da tela.</div></div>
                    <ToggleSwitch checked={inAppToasts} onChange={() => setValue('inAppToasts', !inAppToasts)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Pedir permissão automaticamente</div><div className="text-xs text-neutral-400">Evita prompt do navegador ao iniciar treino.</div></div>
                    <ToggleSwitch checked={notificationPermissionPrompt} onChange={() => setValue('notificationPermissionPrompt', !notificationPermissionPrompt)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Notificação de mensagem direta</div><div className="text-xs text-neutral-400">Aparece no centro de notificações.</div></div>
                    <ToggleSwitch checked={notifyDirectMessages} onChange={() => setValue('notifyDirectMessages', !notifyDirectMessages)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Notificação de agenda</div><div className="text-xs text-neutral-400">Lembretes e eventos criados pelo coach.</div></div>
                    <ToggleSwitch checked={notifyAppointments} onChange={() => setValue('notifyAppointments', !notifyAppointments)} />
                </div>
                <div className="pt-3 border-t border-neutral-700/60 space-y-3">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Redes Sociais</div>
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Permitir seguidores</div><div className="text-xs text-neutral-400">Outros usuários podem te seguir no app.</div></div>
                        <ToggleSwitch checked={allowSocialFollows} onChange={() => setValue('allowSocialFollows', !allowSocialFollows)} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Novo seguidor</div><div className="text-xs text-neutral-400">Notifica quando alguém começa a te seguir.</div></div>
                        <ToggleSwitch checked={notifySocialFollows} onChange={() => setValue('notifySocialFollows', !notifySocialFollows)} disabled={!allowSocialFollows} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Amigo online</div><div className="text-xs text-neutral-400">Notifica quando um seguido inicia treino.</div></div>
                        <ToggleSwitch checked={notifyFriendOnline} onChange={() => setValue('notifyFriendOnline', !notifyFriendOnline)} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Treino do amigo</div><div className="text-xs text-neutral-400">Stories e relatórios publicados por seguidos.</div></div>
                        <ToggleSwitch checked={notifyFriendWorkoutEvents} onChange={() => setValue('notifyFriendWorkoutEvents', !notifyFriendWorkoutEvents)} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Novos recordes de amigos</div><div className="text-xs text-neutral-400">Quando um seguido bate um PR pessoal.</div></div>
                        <ToggleSwitch checked={notifyFriendPRs} onChange={() => setValue('notifyFriendPRs', !notifyFriendPRs)} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Streaks de amigos</div><div className="text-xs text-neutral-400">Quando um seguido mantém sequência de treinos.</div></div>
                        <ToggleSwitch checked={notifyFriendStreaks} onChange={() => setValue('notifyFriendStreaks', !notifyFriendStreaks)} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Metas de amigos</div><div className="text-xs text-neutral-400">Quando um seguido atinge uma meta.</div></div>
                        <ToggleSwitch checked={notifyFriendGoals} onChange={() => setValue('notifyFriendGoals', !notifyFriendGoals)} />
                    </div>
                </div>
                {isIosNative && (
                    <div className="mt-2 rounded-xl bg-neutral-900 border border-neutral-700 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-black text-white">Notificações do iOS</div>
                                <div className="text-xs text-neutral-400">Status: {iosNotifStatus}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button type="button" disabled={iosNotifBusy} onClick={onRequestIosNotifPermission} className="px-3 py-2 rounded-xl bg-yellow-500 text-black font-black disabled:opacity-60">Solicitar</button>
                                <button type="button" disabled={iosNotifBusy} onClick={onOpenAppSettings} className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black disabled:opacity-60">Abrir Ajustes</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </SectionCard>
    )
}

// ── Segurança (iOS only) ─────────────────────────────────────────────────────
export function SettingsSecuritySection({ draft, setValue }: SettingsSectionProps) {
    const requireBiometricsOnStartup = Boolean(draft?.requireBiometricsOnStartup ?? false)
    return (
        <SectionCard>
            <SectionHeader icon={Lock} label="Segurança" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Solicitar Biometria</div><div className="text-xs text-neutral-400">Exige Face ID ou Touch ID ao abrir o app.</div></div>
                    <ToggleSwitch checked={requireBiometricsOnStartup} onChange={() => setValue('requireBiometricsOnStartup', !requireBiometricsOnStartup)} />
                </div>
            </div>
        </SectionCard>
    )
}

// ── Módulos Modal ────────────────────────────────────────────────────────────
interface SettingsModulesModalProps extends SettingsSectionProps {
    isOpen: boolean
    onClose: () => void
}
export function SettingsModulesModal({ draft, setValue, isOpen, onClose }: SettingsModulesModalProps) {
    const moduleSocial = Boolean(draft?.moduleSocial ?? true)
    const moduleCommunity = Boolean(draft?.moduleCommunity ?? true)
    const moduleMarketplace = Boolean(draft?.moduleMarketplace ?? true)
    if (!isOpen) return null
    return (
        <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={onClose}>
            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                    <div><div className="text-xs font-black uppercase tracking-widest text-yellow-500">Módulos</div><div className="text-white font-black text-lg truncate">Personalizar</div></div>
                    <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar">✕</button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Social</div><div className="text-xs text-neutral-400">Stories e recursos sociais.</div></div>
                        <ToggleSwitch checked={moduleSocial} onChange={() => setValue('moduleSocial', !moduleSocial)} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Comunidade</div><div className="text-xs text-neutral-400">Lista e interações de comunidade.</div></div>
                        <ToggleSwitch checked={moduleCommunity} onChange={() => setValue('moduleCommunity', !moduleCommunity)} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Marketplace</div><div className="text-xs text-neutral-400">Planos e assinaturas de professores.</div></div>
                        <ToggleSwitch checked={moduleMarketplace} onChange={() => setValue('moduleMarketplace', !moduleMarketplace)} />
                    </div>
                </div>
                <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                    <button type="button" onClick={() => { setValue('moduleSocial', true); setValue('moduleCommunity', true); setValue('moduleMarketplace', true) }} className="px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 inline-flex items-center gap-2">
                        <RotateCcw size={16} className="text-yellow-500" /> Restaurar
                    </button>
                    <button type="button" onClick={onClose} className="px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 inline-flex items-center gap-2">Ok</button>
                </div>
            </div>
        </div>
    )
}
