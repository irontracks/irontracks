'use client'

import { memo } from 'react'
import { GripVertical } from 'lucide-react'
import { Reorder, useDragControls } from 'framer-motion'

export const SortableWorkoutItem = memo(function SortableWorkoutItem({
    item,
    index,
    onChangeTitle,
    saving,
}: {
    item: { id: string; title: string; sort_order: number }
    index: number
    onChangeTitle: (id: string, val: string) => void
    saving: boolean
}) {
    const controls = useDragControls()

    return (
        <Reorder.Item
            value={item}
            dragListener={false}
            dragControls={controls}
            className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative touch-none select-none"
        >
            <div
                className={`text-neutral-500 p-2 -m-2 touch-none ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
                onPointerDown={(e) => !saving && controls.start(e)}
            >
                <GripVertical size={18} />
            </div>
            <div className="w-10 text-xs font-mono text-neutral-500">#{index + 1}</div>
            <input
                value={item.title}
                onChange={(e) => onChangeTitle(item.id, e.target.value)}
                disabled={saving}
                className="flex-1 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 disabled:opacity-50"
                placeholder="Título"
                onPointerDown={(e) => e.stopPropagation()}
            />
        </Reorder.Item>
    )
})
