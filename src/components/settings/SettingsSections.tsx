'use client'
import React from 'react'
import Image from 'next/image'
import { Camera, Palette, CalendarDays, Layers, Wrench, Dumbbell, Volume2, Bell, Timer, Lock, RotateCcw, User } from 'lucide-react'
import { SectionCard, SectionHeader, ToggleSwitch, type SettingsSectionProps } from './settingsShared'

// ── Perfil ───────────────────────────────────────────────────────────────────
interface SettingsProfileSectionProps extends SettingsSectionProps {
    userEmail?: string
    userId?: string
    userPhotoURL?: string | null
    onOpenChangePassword?: () => void
    onOpenAvatarUpload?: () => void
}

export function SettingsProfileSection({ draft, setValue, userPhotoURL, onOpenAvatarUpload, onOpenChangePassword }: SettingsProfileSectionProps) {
    const biologicalSex = String(draft?.biologicalSex ?? 'not_informed')
    const options = [
        { value: 'male', label: '♂ Masculino' },
        { value: 'female', label: '♀ Feminino' },
        { value: 'not_informed', label: 'Não informar' },
    ]
    return (
        <SectionCard>
            <SectionHeader icon={User} label="Perfil" color="#3b82f6" />
            <div className="space-y-3">
                {/* Avatar */}
                <div className="flex items-center gap-4 pb-3 border-b border-neutral-700/60">
                    <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-yellow-500/40 flex-shrink-0">
                        {userPhotoURL ? (
                            <Image src={userPhotoURL} width={56} height={56} className="w-full h-full object-cover" alt="Avatar" unoptimized />
                        ) : (
                            <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                                <Camera size={20} className="text-neutral-600" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white">Foto de Perfil</div>
                        <div className="text-[11px] text-neutral-500">Visível para outros usuários.</div>
                    </div>
                    <button type="button" onClick={() => onOpenAvatarUpload?.()}
                        className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-bold hover:bg-neutral-750 transition-colors">
                        Trocar
                    </button>
                </div>

                {/* Biological sex */}
                <div>
                    <div className="text-sm font-bold text-white mb-1">Sexo biológico</div>
                    <div className="text-xs text-neutral-400 mb-3">Usado para estimar calorias com mais precisão (±10%).</div>
                    <div className="grid grid-cols-3 gap-2">
                        {options.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setValue('biologicalSex', opt.value)}
                                className={`py-2.5 px-2 rounded-xl text-xs font-black border transition-all ${
                                    biologicalSex === opt.value
                                        ? 'bg-yellow-500 border-yellow-500 text-black'
                                        : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-500'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Change password */}
                <div className="pt-3 border-t border-neutral-700/60">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-bold text-white">Trocar Senha</div>
                            <div className="text-[11px] text-neutral-500">Alterar senha de acesso à conta.</div>
                        </div>
                        <button type="button" onClick={() => onOpenChangePassword?.()}
                            className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-bold hover:bg-neutral-750 transition-colors flex items-center gap-1.5">
                            <Lock size={12} />
                            Alterar
                        </button>
                    </div>
                </div>
            </div>
        </SectionCard>
    )
}

// ── Aparência ────────────────────────────────────────────────────────────────
export function SettingsAppearanceSection({ draft, setValue }: SettingsSectionProps) {
    const density = String(draft?.dashboardDensity || 'comfortable')
    return (
        <SectionCard>
            <SectionHeader icon={Palette} label="Aparência" color="#8b5cf6" />
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
            <SectionHeader icon={CalendarDays} label="Nomes de treinos" color="#f97316" />
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
            <SectionHeader icon={Layers} label="Modo do App" color="#06b6d4" />
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
    onOpenProgressPhotos?: () => void
}
export function SettingsToolsSection({ draft, setValue, onOpenWhatsNew, onOpenProgressPhotos }: SettingsToolsSectionProps) {
    const showNewRecordsCard = Boolean(draft?.showNewRecordsCard ?? true)
    const showIronRank = Boolean(draft?.showIronRank ?? true)
    const showBadges = Boolean(draft?.showBadges ?? true)
    const showStoriesBar = Boolean(draft?.showStoriesBar ?? true)
    const whatsNewAutoOpen = Boolean(draft?.whatsNewAutoOpen ?? true)
    const whatsNewRemind24h = Boolean(draft?.whatsNewRemind24h ?? true)
    return (
        <SectionCard>
            <SectionHeader icon={Wrench} label="Ferramentas" color="#f43f5e" />
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
                {onOpenProgressPhotos && (
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Diário de Progresso</div><div className="text-xs text-neutral-400">Fotos before/after com comparador deslizável.</div></div>
                        <button type="button" onClick={onOpenProgressPhotos} className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800">Abrir</button>
                    </div>
                )}
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
            <SectionHeader icon={Dumbbell} label="Treino" color="#10b981" />
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
            <SectionHeader icon={Volume2} label="Som e Convites" color="#eab308" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Sons do App</div><div className="text-xs text-neutral-400">Notificações e feedback sonoro.</div></div>
                    <ToggleSwitch checked={enableSounds} onChange={() => setValue('enableSounds', !enableSounds)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Volume</div><div className="text-xs text-neutral-400">Controla intensidade dos sons.</div></div>
                    <div className="w-40 flex items-center gap-3">
                        <input type="range" min={0} max={100} step={5} value={soundVolume} onChange={(e) => setValue('soundVolume', Number(e.target.value))} className="w-full accent-yellow-500" aria-label="Volume dos sons" />
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
    const restTimerAutoStart = Boolean(draft?.restTimerAutoStart ?? false)
    return (
        <SectionCard>
            <SectionHeader icon={Timer} label="Timer" color="#6366f1" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">START automático</div><div className="text-xs text-neutral-400">Inicia a próxima série ao terminar o descanso.</div></div>
                    <ToggleSwitch checked={restTimerAutoStart} onChange={() => setValue('restTimerAutoStart', !restTimerAutoStart)} />
                </div>
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
            <SectionHeader icon={Lock} label="Privacidade" color="#ef4444" />
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
            <SectionHeader icon={Bell} label="Notificações" color="#f59e0b" />
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

// ── Apple Health (HealthKit) — exigido pela Guideline 2.5.1 da Apple ─────────
interface SettingsHealthKitSectionProps {
    isHealthKitAvailable: boolean
    healthKitGranted: boolean
    healthKitBusy: boolean
    onRequestPermission: () => Promise<void>
    onOpenAppSettings: () => Promise<void>
}
export function SettingsHealthKitSection({
    isHealthKitAvailable,
    healthKitGranted,
    healthKitBusy,
    onRequestPermission,
    onOpenAppSettings,
}: SettingsHealthKitSectionProps) {
    if (!isHealthKitAvailable) return null
    return (
        <SectionCard>
            {/* Header com ícone do Apple Health */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #ff2d55 0%, #ff6b87 100%)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-rose-400">Apple Health</div>
                    <div className="text-white font-black text-sm truncate">Integração com Saúde</div>
                </div>
                <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide shrink-0 ${healthKitGranted ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}>
                    {healthKitGranted ? '✓ Conectado' : 'Não conectado'}
                </div>
            </div>

            {/* Descrição clara dos dados acessados — exigido pela Guideline 2.5.1 */}
            <div className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-3 mb-4 space-y-2.5">
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1">O que o IronTracks acessa no Apple Health</div>
                <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0 mt-1.5" />
                    <div>
                        <div className="text-xs font-bold text-neutral-200">Gravação de treinos</div>
                        <div className="text-[11px] text-neutral-400 leading-relaxed">Salva seus treinos concluídos (duração e calorias estimadas) como atividades no app Saúde.</div>
                    </div>
                </div>
                <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0 mt-1.5" />
                    <div>
                        <div className="text-xs font-bold text-neutral-200">Leitura de passos</div>
                        <div className="text-[11px] text-neutral-400 leading-relaxed">Lê a contagem de passos diários para contexto no resumo de atividade.</div>
                    </div>
                </div>
                <div className="pt-1 text-[10px] text-neutral-500 leading-relaxed border-t border-neutral-800/60">
                    Seus dados de saúde nunca são compartilhados com terceiros. Você pode revogar o acesso em Ajustes → Privacidade e Segurança → Saúde → IronTracks.
                </div>
            </div>

            {/* Botões de ação */}
            <div className="flex flex-col sm:flex-row gap-2">
                {!healthKitGranted ? (
                    <button
                        type="button"
                        disabled={healthKitBusy}
                        onClick={onRequestPermission}
                        id="healthkit-connect-button"
                        aria-label="Conectar ao Apple Health"
                        className="flex-1 min-h-[44px] px-4 py-3 rounded-xl font-black text-sm text-white inline-flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #ff2d55 0%, #ff6b87 100%)' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                        {healthKitBusy ? 'Solicitando...' : 'Conectar ao Apple Health'}
                    </button>
                ) : (
                    <div className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 font-black text-sm inline-flex items-center justify-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                        Apple Health conectado
                    </div>
                )}
                <button
                    type="button"
                    disabled={healthKitBusy}
                    onClick={onOpenAppSettings}
                    id="healthkit-settings-button"
                    aria-label="Abrir Configurações do iOS para gerenciar acesso ao HealthKit"
                    className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-sm hover:bg-neutral-800 transition-colors disabled:opacity-60"
                >
                    Gerenciar em Ajustes
                </button>
            </div>
        </SectionCard>
    )
}

// ── Segurança (iOS only) ─────────────────────────────────────────────────────
export function SettingsSecuritySection({ draft, setValue }: SettingsSectionProps) {
    const requireBiometricsOnStartup = Boolean(draft?.requireBiometricsOnStartup ?? false)
    return (
        <SectionCard>
            <SectionHeader icon={Lock} label="Segurança" color="#14b8a6" />
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
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" role="dialog" aria-modal="true" aria-label="Personalizar módulos" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose?.()}>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
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
