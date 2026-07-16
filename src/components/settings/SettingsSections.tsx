'use client'
import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { Camera, Palette, CalendarDays, Layers, Wrench, Dumbbell, Volume2, Bell, Timer, Lock, RotateCcw, User, AtSign } from 'lucide-react'
import { SectionCard, SectionHeader, ToggleSwitch, type SettingsSectionProps } from './settingsShared'
import { createClient } from '@/utils/supabase/client'

// ── Perfil ───────────────────────────────────────────────────────────────────
interface SettingsProfileSectionProps extends SettingsSectionProps {
    userEmail?: string
    userId?: string
    userPhotoURL?: string | null
    onOpenChangePassword?: () => void
    onOpenAvatarUpload?: () => void
}

function HandleEditor({ userId }: { userId?: string }) {
    const [current, setCurrent] = useState<string | null>(null)
    const [draft, setDraft] = useState('')
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const [errorMsg, setErrorMsg] = useState<string>('')

    useEffect(() => {
        if (!userId) return
        let cancelled = false
        ;(async () => {
            try {
                const supabase = createClient()
                const { data } = await supabase.from('profiles').select('handle').eq('id', userId).maybeSingle()
                if (cancelled) return
                const h = String((data as { handle?: string | null } | null)?.handle ?? '').trim()
                setCurrent(h || null)
                setDraft(h || '')
            } catch {
                /* ignore — user can still type */
            }
        })()
        return () => { cancelled = true }
    }, [userId])

    const handleSave = async () => {
        const next = draft.trim().toLowerCase()
        if (!next) return
        setStatus('saving')
        setErrorMsg('')
        try {
            const res = await fetch('/api/profiles/handle', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ handle: next }),
            })
            const json = (await res.json()) as { ok?: boolean; error?: string; handle?: string; message?: string }
            if (!res.ok || !json.ok) {
                setStatus('error')
                if (json.error === 'handle_taken') setErrorMsg('Esse @ já está em uso.')
                else if (json.error === 'invalid_format') setErrorMsg(json.message || 'Formato inválido. Use 3-20 caracteres, letra inicial, [a-z0-9_].')
                else setErrorMsg(json.error || 'Falha ao salvar.')
                return
            }
            setCurrent(json.handle || next)
            setStatus('saved')
            window.setTimeout(() => setStatus('idle'), 1500)
        } catch (e) {
            setStatus('error')
            setErrorMsg(e instanceof Error ? e.message : String(e))
        }
    }

    const dirty = draft.trim().toLowerCase() !== (current || '')
    const valid = /^[a-z][a-z0-9_]{2,19}$/.test(draft.trim().toLowerCase())

    return (
        <div className="pt-3 border-t border-neutral-700/60">
            <div className="flex items-center gap-2 mb-1">
                <AtSign size={14} className="text-neutral-400" />
                <div className="text-sm font-bold text-white">@ Nome de usuário</div>
            </div>
            <div className="text-[11px] text-neutral-400 mb-2">
                Permite que outros te mencionem (@). 3-20 caracteres, letras minúsculas, números e underscore.
            </div>
            <div className="flex items-center gap-2">
                <span className="text-neutral-400 text-sm">@</span>
                <input
                    type="text"
                    aria-label="Nome de usuário (handle)"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
                    placeholder="seu_handle"
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:border-yellow-500/60"
                />
                <button
                    type="button"
                    disabled={!dirty || !valid || status === 'saving'}
                    onClick={handleSave}
                    className="px-3 py-2 rounded-xl bg-yellow-500 text-black text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-yellow-400 transition-colors"
                >
                    {status === 'saving' ? 'Salvando…' : status === 'saved' ? 'Salvo' : 'Salvar'}
                </button>
            </div>
            {status === 'error' && errorMsg && (
                <div className="text-[11px] text-red-400 mt-1.5">{errorMsg}</div>
            )}
        </div>
    )
}

export function SettingsProfileSection({ draft, setValue, userId, userPhotoURL, onOpenAvatarUpload, onOpenChangePassword }: SettingsProfileSectionProps) {
    const biologicalSex = String(draft?.biologicalSex ?? 'not_informed')
    const options = [
        { value: 'male', label: '♂ Masculino' },
        { value: 'female', label: '♀ Feminino' },
        { value: 'not_informed', label: 'Não informar' },
    ]
    return (
        <SectionCard>
            <SectionHeader icon={User} label="Perfil" color="#f59e0b" />
            <div className="space-y-3">
                {/* Avatar */}
                <div className="flex items-center gap-4 pb-3 border-b border-neutral-700/60">
                    <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-yellow-500/40 flex-shrink-0">
                        {userPhotoURL ? (
                            <Image src={userPhotoURL} width={56} height={56} className="w-full h-full object-cover" alt="Avatar" unoptimized />
                        ) : (
                            <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                                <Camera size={20} className="text-neutral-400" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white">Foto de Perfil</div>
                        <div className="text-[11px] text-neutral-400">Visível para outros usuários.</div>
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

                {/* Handle (@) */}
                <HandleEditor userId={userId} />

                {/* Change password */}
                <div className="pt-3 border-t border-neutral-700/60">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-bold text-white">Trocar Senha</div>
                            <div className="text-[11px] text-neutral-400">Alterar senha de acesso à conta.</div>
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
            <SectionHeader icon={Palette} label="Aparência" color="#fbbf24" />
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
                        <div className="text-xs text-neutral-400">Dia da semana associado ao primeiro treino do programa (A).</div>

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
            <SectionHeader icon={Layers} label="Modo do App" color="#f59e0b" />
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-white">Experiência</div>
                        <div className="text-xs text-neutral-400">Ajusta o quanto de recurso aparece por padrão.</div>
                    </div>
                    <select value={uiMode} onChange={(e) => {
                        const next = String(e.target.value || 'beginner')
                        setValue('uiMode', next)
                        if (next === 'beginner') { setValue('moduleSocial', true); setValue('moduleCommunity', true) }
                        else if (next === 'intermediate') { setValue('moduleSocial', true); setValue('moduleCommunity', false) }
                    }} className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white">
                        <option value="beginner">Iniciante</option>
                        <option value="intermediate">Intermediário</option>
                        <option value="advanced">Avançado</option>
                    </select>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-white">Módulos opcionais</div>
                        <div className="text-xs text-neutral-400">Ative/desative Social e Comunidade.</div>
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
                            <div className="text-xs text-neutral-400">Pergunta o esforço percebido (RPE) e a satisfação ao finalizar.</div>
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
    const restDayAdjustEnabled = Boolean(draft?.restDayAdjustEnabled ?? true)
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
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Ajuste em dias de descanso</div><div className="text-xs text-neutral-400">Pergunta de manhã se vai treinar; se for descansar, reduz a meta de calorias do dia (proteína mantida).</div></div>
                    <ToggleSwitch checked={restDayAdjustEnabled} onChange={() => setValue('restDayAdjustEnabled', !restDayAdjustEnabled)} />
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

// ── Som ──────────────────────────────────────────────────────────────────────
export function SettingsSoundSection({ draft, setValue }: SettingsSectionProps) {
    const enableSounds = Boolean(draft?.enableSounds ?? true)
    const soundVolume = Math.max(0, Math.min(100, Number(draft?.soundVolume ?? 100) || 0))
    return (
        <SectionCard>
            <SectionHeader icon={Volume2} label="Som" color="#eab308" />
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
            <SectionHeader icon={Timer} label="Timer" color="#fbbf24" />
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
                    <div><div className="text-sm font-bold text-white">Tick nos últimos 5s</div><div className="text-xs text-neutral-400">Emite um tique nos 5s finais do descanso, pra ajudar no ritmo.</div></div>
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
                    <div><div className="text-sm font-bold text-white">Receber mensagens diretas</div><div className="text-xs text-neutral-400">Permite que outros iniciem conversas diretas com você.</div></div>
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
    iosTimeSensitiveStatus?: string
    onRequestIosNotifPermission: () => Promise<void>
    onOpenAppSettings: () => Promise<void>
    isIosNative: boolean
}
export function SettingsNotificationsSection({ draft, setValue, iosNotifStatus, iosNotifBusy, iosTimeSensitiveStatus, onRequestIosNotifPermission, onOpenAppSettings, isIosNative }: SettingsNotificationsSectionProps) {
    const inAppToasts = Boolean(draft?.inAppToasts ?? true)
    // Diagnóstico admin: com um descanso ativo, dispara um push de teste da
    // Live Activity pro próprio device — valida o pipeline APNs→Dynamic Island
    // antes de construir o agendamento de fim de descanso. Só aparece p/ admin.
    const [laDiag, setLaDiag] = useState<string>('')
    const [laAdmin, setLaAdmin] = useState(false)
    useEffect(() => {
        if (!isIosNative) return
        let alive = true
        void (async () => {
            try {
                const sb = createClient()
                const { data: { user } } = await sb.auth.getUser()
                if (!user?.id) return
                const { data } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
                if (alive && data?.role === 'admin') setLaAdmin(true)
            } catch { /* noop */ }
        })()
        return () => { alive = false }
    }, [isIosNative])
    const runLaTest = async () => {
        setLaDiag('enviando…')
        try {
            const res = await fetch('/api/push/live-activity-test', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kind: 'rest', event: 'update' }),
            })
            const json = await res.json().catch(() => ({}))
            const n = Array.isArray(json?.results) ? json.results.length : 0
            const okCount = Array.isArray(json?.results) ? json.results.filter((r: { ok?: boolean }) => r?.ok).length : 0
            setLaDiag(res.ok && json?.ok ? `enviado p/ ${okCount}/${n} token(s)` : `erro: ${json?.error || res.status}`)
        } catch (e) {
            setLaDiag(`falha: ${e instanceof Error ? e.message : String(e)}`)
        }
    }
    const notificationPermissionPrompt = Boolean(draft?.notificationPermissionPrompt ?? true)
    const allowSocialFollows = Boolean(draft?.allowSocialFollows ?? true)
    // Master switch: disables ALL push (lock-screen) notifications.
    // In-app bell list still populates so the user can review events later.
    const pushNotificationsEnabled = Boolean(draft?.pushNotificationsEnabled ?? true)
    // Per-type toggles (in-app row + push)
    const notifyDirectMessages = Boolean(draft?.notifyDirectMessages ?? true)
    const notifyAppointments = Boolean(draft?.notifyAppointments ?? true)
    const notifyStudentWorkoutStart = Boolean(draft?.notifyStudentWorkoutStart ?? true)
    const notifyBroadcasts = Boolean(draft?.notifyBroadcasts ?? true)
    const notifySocialFollows = Boolean(draft?.notifySocialFollows ?? true)
    const notifyFollowAccepted = Boolean(draft?.notifyFollowAccepted ?? true)
    const notifyFriendOnline = Boolean(draft?.notifyFriendOnline ?? true)
    const notifyFriendWorkoutEvents = Boolean(draft?.notifyFriendWorkoutEvents ?? true)
    const notifyFriendWorkoutStart = Boolean(draft?.notifyFriendWorkoutStart ?? true)
    const notifyFriendPRs = Boolean(draft?.notifyFriendPRs ?? true)
    const notifyFriendStreaks = Boolean(draft?.notifyFriendStreaks ?? true)
    const notifyFriendGoals = Boolean(draft?.notifyFriendGoals ?? true)
    const notifyFriendComeback = Boolean(draft?.notifyFriendComeback ?? true)
    const notifyAchievements = Boolean(draft?.notifyAchievements ?? true)
    const notifyFriendWeeklyGoal = Boolean(draft?.notifyFriendWeeklyGoal ?? true)
    const notifyStoryPosted = Boolean(draft?.notifyStoryPosted ?? true)
    const notifyStoryLikes = Boolean(draft?.notifyStoryLikes ?? true)
    const notifyStoryReactions = Boolean(draft?.notifyStoryReactions ?? true)
    const notifyStoryComments = Boolean(draft?.notifyStoryComments ?? true)
    const notifyMentions = Boolean(draft?.notifyMentions ?? true)
    const notifyNearPR = Boolean(draft?.notifyNearPR ?? true)
    const notifyBirthday = Boolean(draft?.notifyBirthday ?? true)
    const notifyStreakAtRisk = Boolean(draft?.notifyStreakAtRisk ?? true)
    const notifyInactivity = Boolean(draft?.notifyInactivity ?? true)
    const notifyMorningBriefing = Boolean(draft?.notifyMorningBriefing ?? false)
    const notifyWeeklyRecap = Boolean(draft?.notifyWeeklyRecap ?? true)
    const notifyFriendsTrainedToday = Boolean(draft?.notifyFriendsTrainedToday ?? true)
    const notifyWaterReminder = Boolean(draft?.notifyWaterReminder ?? false)
    const notifyTrialEnding = Boolean(draft?.notifyTrialEnding ?? true)
    const notifyBillingIssue = Boolean(draft?.notifyBillingIssue ?? true)
    const notifyDailyGoal = Boolean(draft?.notifyDailyGoal ?? true)
    const notifyMissedMeal = Boolean(draft?.notifyMissedMeal ?? false)
    const notifyChallenges = Boolean(draft?.notifyChallenges ?? true)
    const notifyMealReminders = Boolean(draft?.notifyMealReminders ?? true)

    return (
        <SectionCard>
            <SectionHeader icon={Bell} label="Notificações" color="#f59e0b" />
            <div className="space-y-3">
                {/* Master switch for lock-screen pushes */}
                <div
                    className="rounded-xl p-3 border"
                    style={{
                        background: pushNotificationsEnabled ? 'rgba(234,179,8,0.08)' : 'rgba(255,255,255,0.02)',
                        borderColor: pushNotificationsEnabled ? 'rgba(234,179,8,0.25)' : 'rgba(255,255,255,0.06)',
                    }}
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-black text-white">Notificações push</div>
                            <div className="text-xs text-neutral-400">
                                Controle geral. Se desligar, nada aparece na tela bloqueada — o sino do app continua listando tudo.
                            </div>
                        </div>
                        <ToggleSwitch
                            checked={pushNotificationsEnabled}
                            onChange={() => setValue('pushNotificationsEnabled', !pushNotificationsEnabled)}
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Toasts no app</div><div className="text-xs text-neutral-400">Mensagens rápidas no topo da tela.</div></div>
                    <ToggleSwitch checked={inAppToasts} onChange={() => setValue('inAppToasts', !inAppToasts)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-white">Pedir permissão automaticamente</div><div className="text-xs text-neutral-400">Solicita a permissão de notificações ao entrar, em vez de no meio do treino.</div></div>
                    <ToggleSwitch checked={notificationPermissionPrompt} onChange={() => setValue('notificationPermissionPrompt', !notificationPermissionPrompt)} />
                </div>

                {/* ── Conversas e eventos diretos ──────────────────────────── */}
                <div className="pt-3 border-t border-neutral-700/60 space-y-3">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Mensagens e avisos</div>
                    <NotifRow
                        title="Notificar mensagem recebida"
                        description="Aviso quando chega uma mensagem direta."
                        checked={notifyDirectMessages}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyDirectMessages', !notifyDirectMessages)}
                    />
                    <NotifRow
                        title="Agenda / professor"
                        description="Lembretes e eventos criados pelo coach."
                        checked={notifyAppointments}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyAppointments', !notifyAppointments)}
                    />
                    <NotifRow
                        title="Aluno iniciou treino (professor)"
                        description="Avisa você quando um aluno seu começa um treino, pra assumir o controle."
                        checked={notifyStudentWorkoutStart}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyStudentWorkoutStart', !notifyStudentWorkoutStart)}
                    />
                    <NotifRow
                        title="Avisos do IronTracks"
                        description="Comunicados oficiais enviados pelo time do app."
                        checked={notifyBroadcasts}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyBroadcasts', !notifyBroadcasts)}
                    />
                </div>

                {/* ── Redes sociais ─────────────────────────────────────────── */}
                <div className="pt-3 border-t border-neutral-700/60 space-y-3">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Redes Sociais</div>
                    <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-bold text-white">Permitir seguidores</div><div className="text-xs text-neutral-400">Outros usuários podem te seguir no app.</div></div>
                        <ToggleSwitch checked={allowSocialFollows} onChange={() => setValue('allowSocialFollows', !allowSocialFollows)} />
                    </div>
                    <NotifRow
                        title="Pedido para seguir"
                        description="Alguém quer te seguir."
                        checked={notifySocialFollows}
                        disabled={!pushNotificationsEnabled || !allowSocialFollows}
                        onChange={() => setValue('notifySocialFollows', !notifySocialFollows)}
                    />
                    <NotifRow
                        title="Pedido aceito"
                        description="Alguém aceitou seu pedido para seguir."
                        checked={notifyFollowAccepted}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyFollowAccepted', !notifyFollowAccepted)}
                    />
                    <NotifRow
                        title="Amigo online"
                        description="Quando um seguido abre o app."
                        checked={notifyFriendOnline}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyFriendOnline', !notifyFriendOnline)}
                    />
                    <NotifRow
                        title="Amigo começou treino"
                        description="Quando um seguido inicia um treino agora."
                        checked={notifyFriendWorkoutStart}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyFriendWorkoutStart', !notifyFriendWorkoutStart)}
                    />
                    <NotifRow
                        title="Amigo terminou treino"
                        description="Quando um seguido finaliza um treino."
                        checked={notifyFriendWorkoutEvents}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyFriendWorkoutEvents', !notifyFriendWorkoutEvents)}
                    />
                    <NotifRow
                        title="Novos recordes (PR)"
                        description="Quando um seguido bate um PR."
                        checked={notifyFriendPRs}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyFriendPRs', !notifyFriendPRs)}
                    />
                    <NotifRow
                        title="Streaks de amigos"
                        description="Quando um seguido mantém sequência de treinos."
                        checked={notifyFriendStreaks}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyFriendStreaks', !notifyFriendStreaks)}
                    />
                    <NotifRow
                        title="Metas de amigos"
                        description="Quando um seguido atinge uma meta."
                        checked={notifyFriendGoals}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyFriendGoals', !notifyFriendGoals)}
                    />
                    <NotifRow
                        title="Amigo voltou a treinar"
                        description="Quando um seguido volta após 3+ dias sem treinar."
                        checked={notifyFriendComeback}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyFriendComeback', !notifyFriendComeback)}
                    />
                    <NotifRow
                        title="Conquistas de amigos"
                        description="Quando um seguido desbloqueia uma conquista (primeiro treino, marcos de volume)."
                        checked={notifyAchievements}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyAchievements', !notifyAchievements)}
                    />
                    <NotifRow
                        title="Meta semanal de amigos"
                        description="Quando um seguido bate a meta de treinos da semana."
                        checked={notifyFriendWeeklyGoal}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyFriendWeeklyGoal', !notifyFriendWeeklyGoal)}
                    />
                </div>

                {/* ── Pessoais ──────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-neutral-700/60 space-y-3">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Pessoais</div>
                    <NotifRow
                        title="Quase bateu PR"
                        description="Quando você fica perto de um recorde pessoal sem bater."
                        checked={notifyNearPR}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyNearPR', !notifyNearPR)}
                    />
                    <NotifRow
                        title="Streak em risco"
                        description="À noite, se você ainda não treinou e tem sequência ativa."
                        checked={notifyStreakAtRisk}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyStreakAtRisk', !notifyStreakAtRisk)}
                    />
                    <NotifRow
                        title="Saudade do treino"
                        description="Avisa após 3+ dias sem treinar."
                        checked={notifyInactivity}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyInactivity', !notifyInactivity)}
                    />
                    <NotifRow
                        title="Bom dia (briefing)"
                        description="Lembrete de motivação pela manhã. Desligado por padrão."
                        checked={notifyMorningBriefing}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyMorningBriefing', !notifyMorningBriefing)}
                    />
                    <NotifRow
                        title="Resumo semanal"
                        description="Toda segunda, resumo da semana anterior."
                        checked={notifyWeeklyRecap}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyWeeklyRecap', !notifyWeeklyRecap)}
                    />
                    <NotifRow
                        title="Aniversário no app"
                        description="Avisa no aniversário do seu cadastro."
                        checked={notifyBirthday}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyBirthday', !notifyBirthday)}
                    />
                    <NotifRow
                        title="Hidratação"
                        description="Lembrete diário pra beber água. Desligado por padrão."
                        checked={notifyWaterReminder}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyWaterReminder', !notifyWaterReminder)}
                    />
                    <NotifRow
                        title="Amigos treinaram hoje"
                        description="No fim do dia, se algum seguido treinou hoje."
                        checked={notifyFriendsTrainedToday}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyFriendsTrainedToday', !notifyFriendsTrainedToday)}
                    />
                </div>

                {/* ── Conta / VIP ────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-neutral-700/60 space-y-3">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Conta / VIP</div>
                    <NotifRow
                        title="Assinatura expirando"
                        description="Quando seu VIP está pra expirar nas próximas 24h."
                        checked={notifyTrialEnding}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyTrialEnding', !notifyTrialEnding)}
                    />
                    <NotifRow
                        title="Falha no pagamento"
                        description="Quando uma cobrança da assinatura falha."
                        checked={notifyBillingIssue}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyBillingIssue', !notifyBillingIssue)}
                    />
                </div>

                {/* ── Stories ───────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-neutral-700/60 space-y-3">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Stories</div>
                    <NotifRow
                        title="Amigo postou story"
                        description="Avisa quando seguidos publicam um story."
                        checked={notifyStoryPosted}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyStoryPosted', !notifyStoryPosted)}
                    />
                    <NotifRow
                        title="Curtidas no seu story"
                        description="Avisa quando alguém curte seu story."
                        checked={notifyStoryLikes}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyStoryLikes', !notifyStoryLikes)}
                    />
                    <NotifRow
                        title="Reações no seu story"
                        description="Avisa quando alguém reage ao seu story."
                        checked={notifyStoryReactions}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyStoryReactions', !notifyStoryReactions)}
                    />
                    <NotifRow
                        title="Comentários no seu story"
                        description="Avisa quando alguém comenta no seu story."
                        checked={notifyStoryComments}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyStoryComments', !notifyStoryComments)}
                    />
                    <NotifRow
                        title="Menções (@)"
                        description="Avisa quando alguém te menciona em um comentário."
                        checked={notifyMentions}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyMentions', !notifyMentions)}
                    />
                </div>

                {/* ── Desafios ──────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-neutral-700/60 space-y-3">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Desafios</div>
                    <NotifRow
                        title="Desafios"
                        description="Você foi desafiado, ou alguém aceitou / recusou seu desafio."
                        checked={notifyChallenges}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyChallenges', !notifyChallenges)}
                    />
                </div>

                {/* ── Lembretes ─────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-neutral-700/60 space-y-3">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Lembretes</div>
                    <NotifRow
                        title="Refeições"
                        description="Horários de refeição configurados na nutrição."
                        checked={notifyMealReminders}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyMealReminders', !notifyMealReminders)}
                    />
                    <NotifRow
                        title="Refeição esquecida"
                        description="Avisa 30min depois se você não registrou. Desligado por padrão."
                        checked={notifyMissedMeal}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyMissedMeal', !notifyMissedMeal)}
                    />
                    <NotifRow
                        title="Meta diária atingida"
                        description="Quando você bate a meta de calorias ou proteína do dia."
                        checked={notifyDailyGoal}
                        disabled={!pushNotificationsEnabled}
                        onChange={() => setValue('notifyDailyGoal', !notifyDailyGoal)}
                    />
                </div>

                {isIosNative && iosTimeSensitiveStatus === 'disabled' && (
                    <div className="mt-2 rounded-xl border border-orange-500/40 bg-orange-500/10 p-3">
                        <div className="flex items-start gap-2">
                            <span className="text-orange-400 text-base leading-none mt-0.5">⚠️</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-black text-orange-300">Notificações urgentes desativadas</div>
                                <div className="text-xs text-orange-200/80 mt-1">
                                    As notificações do IronTracks que deveriam acordar a tela (timer de descanso, mensagens) foram desativadas nas configurações do iOS. Ative &quot;Notificações Importantes&quot; em <span className="font-bold">Ajustes → IronTracks → Notificações</span> para que a tela acorde corretamente.
                                </div>
                                <button
                                    type="button"
                                    disabled={iosNotifBusy}
                                    onClick={onOpenAppSettings}
                                    className="mt-2 px-3 py-1.5 rounded-lg bg-orange-500 text-black font-black text-xs disabled:opacity-60"
                                >
                                    Abrir Ajustes
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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

                {isIosNative && laAdmin && (
                    <div className="mt-2 rounded-xl bg-neutral-900 border border-yellow-500/30 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-black text-white">🧪 Testar Live Activity (admin)</div>
                                <div className="text-xs text-neutral-400">Com um descanso ATIVO, envia um push de teste pra Dynamic Island.{laDiag ? ` — ${laDiag}` : ''}</div>
                            </div>
                            <button type="button" onClick={runLaTest} className="px-3 py-2 rounded-xl bg-yellow-500 text-black font-black shrink-0">Enviar</button>
                        </div>
                    </div>
                )}
            </div>
        </SectionCard>
    )
}

function NotifRow({
    title,
    description,
    checked,
    disabled,
    onChange,
}: {
    title: string
    description: string
    checked: boolean
    disabled?: boolean
    onChange: () => void
}) {
    return (
        <div className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-50' : ''}`}>
            <div>
                <div className="text-sm font-bold text-white">{title}</div>
                <div className="text-xs text-neutral-400">{description}</div>
            </div>
            <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
        </div>
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
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">O que o IronTracks acessa no Apple Health</div>
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
                <div className="pt-1 text-[10px] text-neutral-400 leading-relaxed border-t border-neutral-800/60">
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

// ── Geofencing (iOS only) — auto check-in na academia ────────────────────────
interface SettingsGymGeofenceSectionProps {
    draft: Record<string, unknown>
    setValue: (key: string, value: unknown) => void
    /** Resolves to the user's CURRENT lat/lng (Geolocation API). */
    onCaptureCurrentLocation: () => Promise<{ lat: number; lng: number } | null>
    /** Requests CLAuthorizationStatus.authorizedAlways. */
    onRequestAlwaysPermission: () => Promise<string>
    onOpenAppSettings: () => Promise<void>
}
export function SettingsGymGeofenceSection({
    draft,
    setValue,
    onCaptureCurrentLocation,
    onRequestAlwaysPermission,
    onOpenAppSettings,
}: SettingsGymGeofenceSectionProps) {
    const enabled = Boolean(draft?.gymGeofenceEnabled ?? false)
    const gymName = String(draft?.favoriteGymName ?? '')
    const lat = typeof draft?.favoriteGymLat === 'number' ? (draft.favoriteGymLat as number) : null
    const lng = typeof draft?.favoriteGymLng === 'number' ? (draft.favoriteGymLng as number) : null
    const hasGym = !!gymName && lat != null && lng != null
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState<string>('')
    const [nameDraft, setNameDraft] = React.useState(gymName)

    React.useEffect(() => { setNameDraft(gymName) }, [gymName])

    const handleSetCurrent = async () => {
        setError('')
        setBusy(true)
        try {
            const status = await onRequestAlwaysPermission()
            if (status === 'denied' || status === 'restricted') {
                setError('Permissão de localização negada. Habilite "Sempre" em Ajustes.')
                return
            }
            const coords = await onCaptureCurrentLocation()
            if (!coords) {
                setError('Não foi possível obter sua localização atual.')
                return
            }
            setValue('favoriteGymLat', coords.lat)
            setValue('favoriteGymLng', coords.lng)
            const safeName = (nameDraft || 'Minha academia').trim().slice(0, 60)
            setValue('favoriteGymName', safeName)
            setValue('gymGeofenceEnabled', true)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro inesperado.')
        } finally {
            setBusy(false)
        }
    }

    const handleClear = () => {
        setValue('favoriteGymLat', null)
        setValue('favoriteGymLng', null)
        setValue('favoriteGymName', '')
        setValue('gymGeofenceEnabled', false)
        setNameDraft('')
    }

    const handleToggleEnabled = () => {
        if (!hasGym) return
        setValue('gymGeofenceEnabled', !enabled)
    }

    return (
        <SectionCard>
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-amber-400">Auto Check-in</div>
                    <div className="text-white font-black text-sm truncate">Geolocalização da Academia</div>
                </div>
                <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide shrink-0 ${enabled && hasGym ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}>
                    {enabled && hasGym ? '✓ Ativo' : 'Desativado'}
                </div>
            </div>

            <div className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-3 mb-4 space-y-2.5">
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Como funciona</div>
                <div className="text-[11px] text-neutral-400 leading-relaxed">
                    Salve sua academia favorita e o IronTracks te avisa automaticamente assim que você chega lá — mesmo com o app fechado. Detecção sem GPS contínuo (zero impacto na bateria).
                </div>
                <div className="pt-1 text-[10px] text-neutral-400 leading-relaxed border-t border-neutral-800/60">
                    Sua localização nunca sai do dispositivo para esse uso. Só o nome da academia é salvo na sua conta.
                </div>
            </div>

            {hasGym ? (
                <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3 mb-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Academia favorita</div>
                    <div className="text-sm font-bold text-white truncate">{gymName}</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">
                        {lat?.toFixed(5)}, {lng?.toFixed(5)}
                    </div>
                </div>
            ) : null}

            {/* Nome (editável antes de capturar) */}
            <div className="mb-3">
                <label htmlFor="favorite-gym-name" className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1 block">Nome da academia</label>
                <input
                    id="favorite-gym-name"
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Smart Fit Centro"
                    maxLength={60}
                    aria-label="Nome da academia favorita"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 placeholder:text-neutral-400 text-sm"
                />
            </div>

            {error ? (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 mb-3">{error}</div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-2">
                <button
                    type="button"
                    disabled={busy}
                    onClick={handleSetCurrent}
                    className="flex-1 min-h-[44px] px-4 py-3 rounded-xl font-black text-sm text-white inline-flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)' }}
                >
                    {busy ? 'Capturando...' : (hasGym ? 'Atualizar para localização atual' : 'Usar localização atual')}
                </button>
                {hasGym ? (
                    <>
                        <button
                            type="button"
                            onClick={handleToggleEnabled}
                            className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-sm hover:bg-neutral-800 transition-colors"
                        >
                            {enabled ? 'Pausar' : 'Reativar'}
                        </button>
                        <button
                            type="button"
                            onClick={handleClear}
                            className="min-h-[44px] px-4 py-3 rounded-xl bg-red-900/30 border border-red-700/40 text-red-300 font-black text-sm hover:bg-red-900/40 transition-colors"
                        >
                            Remover
                        </button>
                    </>
                ) : null}
            </div>

            <button
                type="button"
                onClick={onOpenAppSettings}
                className="mt-2 min-h-[36px] w-full px-3 py-2 rounded-lg text-[11px] text-neutral-400 hover:text-neutral-200"
            >
                Gerenciar permissão de localização em Ajustes do iOS
            </button>
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
                </div>
                <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                    <button type="button" onClick={() => { setValue('moduleSocial', true); setValue('moduleCommunity', true) }} className="px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 inline-flex items-center gap-2">
                        <RotateCcw size={16} className="text-yellow-500" /> Restaurar
                    </button>
                    <button type="button" onClick={onClose} className="px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 inline-flex items-center gap-2">Ok</button>
                </div>
            </div>
        </div>
    )
}
