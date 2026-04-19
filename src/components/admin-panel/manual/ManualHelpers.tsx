'use client'

import React from 'react'
import { Info, AlertCircle } from 'lucide-react'

// ─── Section primitives ───────────────────────────────────────────────────────

interface SectionTitleProps {
  id: string
  icon: React.ReactNode
  title: string
  color: string
}

export function SectionTitle({ id, icon, title, color }: SectionTitleProps) {
  return (
    <div id={id} className="flex items-center gap-3 mb-5 scroll-mt-6">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-neutral-800 ${color} flex-shrink-0`}>
        {icon}
      </div>
      <h2 className="text-white font-black text-lg tracking-tight">{title}</h2>
    </div>
  )
}

export function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-6 h-6 rounded-full bg-yellow-500 text-black font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
      <p className="text-sm text-neutral-300 leading-relaxed">{children}</p>
    </div>
  )
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 mt-3">
      <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-blue-300 leading-relaxed">{children}</p>
    </div>
  )
}

export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mt-3">
      <AlertCircle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-yellow-300 leading-relaxed">{children}</p>
    </div>
  )
}

export function FieldRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex gap-3 py-2 border-b border-neutral-800/60 last:border-0">
      <span className="text-xs font-bold text-white w-44 flex-shrink-0">{label}</span>
      <span className="text-xs text-neutral-400 leading-relaxed">{desc}</span>
    </div>
  )
}

// ─── Screen Mockup helpers ────────────────────────────────────────────────────

export function MockupShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-700/60 bg-neutral-900 overflow-hidden my-4 shadow-xl">
      {/* fake title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800/80 border-b border-neutral-700/40">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        <span className="text-[10px] text-neutral-500 font-medium ml-2 uppercase tracking-widest">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export function MockupBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${color}`}>{children}</span>
}

export function MockupBtn({ yellow, children }: { yellow?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold ${yellow ? 'bg-yellow-500 text-black' : 'bg-neutral-800 border border-neutral-700 text-neutral-300'}`}>
      {children}
    </span>
  )
}
