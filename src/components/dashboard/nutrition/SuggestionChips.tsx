'use client'

export type Suggestion = { label: string; value: string }

export default function SuggestionChips({
  suggestions,
  onSelect,
  loading,
}: {
  suggestions: Suggestion[]
  onSelect: (value: string) => void
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 w-24 rounded-full bg-neutral-800/40 animate-pulse shrink-0" />
        ))}
      </div>
    )
  }

  if (!suggestions || suggestions.length === 0) return null

  return (
    <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-none">
      {suggestions.map((s, i) => (
        <button
          key={`${s.value}-${i}`}
          type="button"
          onClick={() => onSelect(s.value)}
          className="
            shrink-0 rounded-full bg-neutral-900/70 border border-neutral-800/60
            px-3 py-1.5 text-xs font-medium text-neutral-300
            hover:bg-neutral-800/80 hover:text-white hover:border-neutral-700
            active:scale-95 transition-all duration-200
          "
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
