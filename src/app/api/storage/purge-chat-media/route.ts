import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST() {
  try {
    const admin = createAdminClient()
    const bucket = 'chat-media'
    
    // 1. List root items (folders usually, keyed by channel_id)
    const { data: rootItems } = await admin.storage.from(bucket).list('', { limit: 1000 })
    
    let allPaths: string[] = []
    
    if (rootItems && rootItems.length > 0) {
      for (const item of rootItems) {
        // Try to list inside this item (treating it as a folder)
        const { data: subItems } = await admin.storage.from(bucket).list(item.name, { limit: 1000 })
        
        if (subItems && subItems.length > 0) {
          // It was a folder, add its children
          const paths = subItems.map(s => `${item.name}/${s.name}`)
          allPaths.push(...paths)
        } else {
          // It was a file at root (or empty folder), add it directly if has id
          if ((item as any).id) {
             allPaths.push(item.name)
          }
        }
      }
    }

    // 2. Delete all collected file paths
    if (allPaths.length > 0) {
      // Delete in batches of 100 to be safe
      for (let i = 0; i < allPaths.length; i += 100) {
        const batch = allPaths.slice(i, i + 100)
        await admin.storage.from(bucket).remove(batch)
      }
    }

    // 3. Remove message rows with media payload (global + direct)
    const { data: globalDeleted } = await admin.from('messages').delete().like('content', '%"type"%').select('id')
    const { data: directDeleted } = await admin.from('direct_messages').delete().like('content', '%"type"%').select('id')
    
    return NextResponse.json({ ok: true, deleted: allPaths.length, messagesRemoved: (globalDeleted?.length || 0) + (directDeleted?.length || 0) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

