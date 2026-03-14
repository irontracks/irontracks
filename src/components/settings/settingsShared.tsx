// Shared props type for all Settings section components
export interface SettingsSectionProps {
    draft: Record<string, unknown>
    setValue: (key: string, value: unknown) => void
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

import React from 'react'

export const ToggleSwitch = ({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className="relative flex-shrink-0 w-12 h-6 rounded-full transition-all duration-300 border-0 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        style={checked
            ? { background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 0 12px rgba(234,179,8,0.4)' }
            : { background: 'rgba(60,60,60,0.8)' }
        }
    >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${checked ? 'left-6' : 'left-0.5'}`} />
    </button>
)

export const SectionHeader = ({ icon: Icon, label, color }: { icon: React.FC<{ size?: number; className?: string }>; label: string; color?: string }) => {
    const accent = color || '#f59e0b'
    return (
        <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
                <span style={{ color: accent }}><Icon size={13} /></span>
            </div>
            <div className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: accent }}>{label}</div>
        </div>
    )
}

export const SectionCard = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {children}
    </div>
)
