import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST() {
  try {
    const admin = createAdminClient()
    const { data: globals, error } = await admin
      .from('chat_channels')
      .select('id, type, created_at')
      .eq('type', 'global')
      .order('created_at', { ascending: true })

    if (error) throw error

    let canonicalId: string | null = null
    if (!globals || globals.length === 0) {
      const { data: created, error: createErr } = await admin
        .from('chat_channels')
        .insert({ type: 'global' })
        .select('id')
        .single()
      if (createErr) throw createErr
      canonicalId = created.id
    } else {
      canonicalId = globals[0].id
      // Migrate messages to canonical and remove duplicates
      for (let i = 1; i < globals.length; i++) {
        const dupId = globals[i].id
        await admin.from('messages').update({ channel_id: canonicalId }).eq('channel_id', dupId)
        await admin.from('chat_channels').delete().eq('id', dupId)
      }
    }

    // Add partial unique index to prevent future duplicates (ignore if exists)
    try {
      await admin.rpc('exec_sql', { sql: `
        DO $$ BEGIN 
          IF NOT EXISTS ( 
            SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_global_type_idx' 
          ) THEN 
            EXECUTE 'CREATE UNIQUE INDEX uniq_global_type_idx ON chat_channels ((type)) WHERE type = ''global'''; 
          END IF; 
        END $$;`
      })
    } catch (err) {
      // Ignore errors if RPC fails
    }

    return NextResponse.json({ ok: true, id: canonicalId })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
